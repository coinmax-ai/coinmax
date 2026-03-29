-- Fix: use activated_at instead of start_date for countdown + yield

-- 1. check_node_activation: set activated_at on first activation
CREATE OR REPLACE FUNCTION check_node_activation(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  profile_row profiles%ROWTYPE;
  v_vault_deposited NUMERIC := 0;
  v_mini_referrals INT := 0;
  membership RECORD;
  tiers_json JSONB;
  tier JSONB;
  best_rank TEXT := NULL;
  best_rank_idx INT := 0;
  tier_rank_idx INT;
  tier_vault NUMERIC;
  tier_refs INT;
  activated_count INT := 0;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  SELECT COALESCE(SUM(principal), 0) INTO v_vault_deposited
  FROM vault_positions
  WHERE user_id = profile_row.id AND status IN ('ACTIVE', 'COMPLETED') AND plan_type != 'BONUS_5D';

  SELECT COUNT(DISTINCT nm.user_id) INTO v_mini_referrals
  FROM node_memberships nm
  JOIN profiles p ON p.id = nm.user_id
  WHERE p.referrer_id = profile_row.id
    AND nm.node_type = 'MINI'
    AND nm.status IN ('ACTIVE', 'PENDING_MILESTONES');

  FOR membership IN
    SELECT * FROM node_memberships
    WHERE user_id = profile_row.id
      AND status IN ('ACTIVE', 'PENDING_MILESTONES')
  LOOP
    IF membership.node_type = 'MAX' THEN
      SELECT value::JSONB INTO tiers_json FROM system_config WHERE key = 'MAX_ACTIVATION_TIERS';
    ELSE
      SELECT value::JSONB INTO tiers_json FROM system_config WHERE key = 'MINI_ACTIVATION_TIERS';
    END IF;

    IF tiers_json IS NULL THEN CONTINUE; END IF;

    best_rank := NULL;
    best_rank_idx := 0;

    FOR tier IN SELECT * FROM jsonb_array_elements(tiers_json)
    LOOP
      tier_vault := (tier->>'vault_deposit')::NUMERIC;
      tier_refs := COALESCE((tier->>'required_mini_referrals')::INT, 0);
      tier_rank_idx := CASE
        WHEN tier->>'rank' = 'V1' THEN 1 WHEN tier->>'rank' = 'V2' THEN 2
        WHEN tier->>'rank' = 'V3' THEN 3 WHEN tier->>'rank' = 'V4' THEN 4
        WHEN tier->>'rank' = 'V5' THEN 5 WHEN tier->>'rank' = 'V6' THEN 6
        WHEN tier->>'rank' = 'V7' THEN 7 ELSE 0
      END;

      IF v_vault_deposited >= tier_vault AND v_mini_referrals >= tier_refs THEN
        IF tier_rank_idx > best_rank_idx THEN
          best_rank := tier->>'rank';
          best_rank_idx := tier_rank_idx;
        END IF;
      END IF;
    END LOOP;

    IF best_rank IS NOT NULL THEN
      IF membership.activated_rank IS NULL OR best_rank_idx > CASE
        WHEN membership.activated_rank = 'V1' THEN 1 WHEN membership.activated_rank = 'V2' THEN 2
        WHEN membership.activated_rank = 'V3' THEN 3 WHEN membership.activated_rank = 'V4' THEN 4
        WHEN membership.activated_rank = 'V5' THEN 5 WHEN membership.activated_rank = 'V6' THEN 6
        ELSE 0
      END THEN
        UPDATE node_memberships
        SET activated_rank = best_rank,
            earnings_capacity = CASE WHEN activated_rank IS NULL THEN 1.0 ELSE earnings_capacity END,
            activated_at = CASE WHEN activated_rank IS NULL THEN NOW() ELSE activated_at END
        WHERE id = membership.id;

        UPDATE profiles
        SET rank = best_rank
        WHERE id = profile_row.id
          AND (rank IS NULL OR CASE
            WHEN rank = 'V1' THEN 1 WHEN rank = 'V2' THEN 2 WHEN rank = 'V3' THEN 3
            WHEN rank = 'V4' THEN 4 WHEN rank = 'V5' THEN 5 WHEN rank = 'V6' THEN 6
            WHEN rank = 'V7' THEN 7 ELSE 0
          END < best_rank_idx);

        activated_count := activated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('activated', activated_count, 'vaultDeposited', v_vault_deposited, 'miniReferrals', v_mini_referrals);
END;
$fn$;

-- 2. settle_node_fixed_yield: use activated_at
CREATE OR REPLACE FUNCTION settle_node_fixed_yield()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  node RECORD;
  daily_profit NUMERIC;
  total_settled NUMERIC := 0;
  nodes_processed INT := 0;
  days_since_activation INT;
BEGIN
  FOR node IN
    SELECT nm.*, p.id AS profile_id, p.rank AS user_rank
    FROM node_memberships nm
    JOIN profiles p ON p.id = nm.user_id
    WHERE nm.status IN ('ACTIVE', 'PENDING_MILESTONES')
      AND nm.activated_rank IS NOT NULL
      AND nm.activated_at IS NOT NULL
      AND (nm.end_date IS NULL OR nm.end_date > NOW())
  LOOP
    IF COALESCE(node.earnings_paused, FALSE) THEN
      nodes_processed := nodes_processed + 1;
      CONTINUE;
    END IF;

    daily_profit := node.frozen_amount * COALESCE(node.daily_rate, 0.009);
    IF daily_profit <= 0 THEN CONTINUE; END IF;

    days_since_activation := EXTRACT(DAY FROM (NOW() - node.activated_at));
    IF days_since_activation < 1 THEN CONTINUE; END IF;

    IF node.node_type = 'MINI' THEN
      UPDATE node_memberships SET locked_earnings = locked_earnings + daily_profit WHERE id = node.id;
      INSERT INTO node_rewards (user_id, reward_type, amount, details)
      VALUES (node.user_id, 'FIXED_YIELD', daily_profit,
        jsonb_build_object('node_type', 'MINI', 'frozen_amount', node.frozen_amount,
          'daily_rate', node.daily_rate, 'status', 'LOCKED', 'day', days_since_activation));
    ELSE
      UPDATE node_memberships
      SET released_earnings = released_earnings + daily_profit,
          available_balance = available_balance + daily_profit
      WHERE id = node.id;
      INSERT INTO node_rewards (user_id, reward_type, amount, details)
      VALUES (node.user_id, 'FIXED_YIELD', daily_profit,
        jsonb_build_object('node_type', 'MAX', 'frozen_amount', node.frozen_amount,
          'daily_rate', node.daily_rate, 'status', 'RELEASED', 'day', days_since_activation));
    END IF;

    total_settled := total_settled + daily_profit;
    nodes_processed := nodes_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('nodesProcessed', nodes_processed, 'totalSettled', ROUND(total_settled, 6)::TEXT);
END;
$fn$;

-- 3. check_node_milestones: use activated_at
CREATE OR REPLACE FUNCTION check_node_milestones(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  profile_row profiles%ROWTYPE;
  ms RECORD;
  user_rank_index INT;
  required_rank_index INT;
  achieved_count INT := 0;
  failed_count INT := 0;
  days_since_activation INT;
  rank_levels TEXT[] := ARRAY['V1','V2','V3','V4','V5','V6','V7'];
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  PERFORM check_node_activation(addr);
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;

  user_rank_index := COALESCE(array_position(rank_levels, profile_row.rank), 0);

  FOR ms IN
    SELECT nm_ms.*, nm.user_id, nm.node_type, nm.total_milestones, nm.id AS mem_id,
           nm.locked_earnings, nm.frozen_amount,
           nm.activated_at AS node_activated_at,
           nm.activated_rank, nm.earnings_paused
    FROM node_milestones nm_ms
    JOIN node_memberships nm ON nm.id = nm_ms.membership_id
    WHERE nm.user_id = profile_row.id
      AND nm.status = 'PENDING_MILESTONES'
      AND nm_ms.status = 'PENDING'
      AND nm.activated_rank IS NOT NULL
      AND nm.activated_at IS NOT NULL
    ORDER BY nm_ms.deadline_days ASC, nm_ms.milestone_index ASC
  LOOP
    days_since_activation := EXTRACT(DAY FROM (NOW() - ms.node_activated_at));
    IF days_since_activation < ms.deadline_days THEN CONTINUE; END IF;

    required_rank_index := COALESCE(array_position(rank_levels, ms.required_rank), 0);

    IF user_rank_index >= required_rank_index THEN
      UPDATE node_milestones SET status = 'ACHIEVED', achieved_at = NOW() WHERE id = ms.id;
      UPDATE node_memberships SET milestone_stage = milestone_stage + 1 WHERE id = ms.mem_id;

      IF COALESCE(ms.pass_action, 'CONTINUE') = 'UNLOCK_PARTIAL' THEN
        UPDATE node_memberships
        SET released_earnings = released_earnings + COALESCE(locked_earnings, 0),
            available_balance = available_balance + COALESCE(locked_earnings, 0),
            locked_earnings = 0
        WHERE id = ms.mem_id;
      ELSIF ms.pass_action = 'UNLOCK_ALL' THEN
        UPDATE node_memberships
        SET released_earnings = released_earnings + COALESCE(locked_earnings, 0),
            available_balance = available_balance + COALESCE(locked_earnings, 0),
            locked_earnings = 0
        WHERE id = ms.mem_id;
      ELSIF ms.pass_action = 'UNLOCK_FROZEN' THEN
        UPDATE node_memberships
        SET frozen_unlocked = TRUE, available_balance = available_balance + frozen_amount
        WHERE id = ms.mem_id AND NOT frozen_unlocked;
      ELSIF ms.pass_action = 'CONTINUE' THEN
        UPDATE node_memberships SET earnings_paused = FALSE WHERE id = ms.mem_id;
      END IF;

      achieved_count := achieved_count + 1;
    ELSE
      UPDATE node_milestones SET status = 'FAILED' WHERE id = ms.id;

      IF COALESCE(ms.fail_action, 'PAUSE') = 'DESTROY' THEN
        UPDATE node_memberships
        SET destroyed_earnings = COALESCE(destroyed_earnings, 0) + COALESCE(locked_earnings, 0),
            locked_earnings = 0
        WHERE id = ms.mem_id;
      ELSIF ms.fail_action = 'PAUSE' THEN
        UPDATE node_memberships SET earnings_paused = TRUE WHERE id = ms.mem_id;
      END IF;

      PERFORM check_rank_promotion(addr);
      failed_count := failed_count + 1;
    END IF;
  END LOOP;

  UPDATE node_memberships SET status = 'ACTIVE'
  WHERE user_id = profile_row.id
    AND status = 'PENDING_MILESTONES'
    AND milestone_stage >= total_milestones;

  RETURN jsonb_build_object('achieved', achieved_count, 'failed', failed_count);
END;
$fn$;

-- 4. Backfill activated_at for existing nodes
UPDATE node_memberships SET activated_at = start_date
WHERE activated_rank IS NOT NULL AND activated_at IS NULL;
