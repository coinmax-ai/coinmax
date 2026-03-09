-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Vault Plans, Rank System, Release/Burn, Daily Cron
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- A) Update vault_deposit with correct lock periods
--    5天 0.5%, 45天 0.7%, 90天 0.9%, 180天 1.2%, 360天 1.5%
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION vault_deposit(addr TEXT, plan_type TEXT, deposit_amount NUMERIC, tx_hash TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  plan_days INT;
  plan_rate NUMERIC;
  end_dt TIMESTAMP;
  min_amount NUMERIC;
  pos vault_positions%ROWTYPE;
  tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    INSERT INTO profiles (wallet_address) VALUES (addr) RETURNING * INTO profile_row;
  END IF;

  SELECT value::NUMERIC INTO min_amount FROM system_config WHERE key = 'VAULT_MIN_AMOUNT';
  IF min_amount IS NULL THEN min_amount := 50; END IF;

  IF deposit_amount < min_amount THEN
    RAISE EXCEPTION 'Minimum deposit is % USDC', min_amount;
  END IF;

  IF plan_type = '5_DAYS' THEN plan_days := 5; plan_rate := 0.005;
  ELSIF plan_type = '45_DAYS' THEN plan_days := 45; plan_rate := 0.007;
  ELSIF plan_type = '90_DAYS' THEN plan_days := 90; plan_rate := 0.009;
  ELSIF plan_type = '180_DAYS' THEN plan_days := 180; plan_rate := 0.012;
  ELSIF plan_type = '360_DAYS' THEN plan_days := 360; plan_rate := 0.015;
  ELSE
    RAISE EXCEPTION 'Invalid plan type: %', plan_type;
  END IF;

  end_dt := NOW() + (plan_days || ' days')::INTERVAL;

  INSERT INTO vault_positions (user_id, plan_type, principal, daily_rate, end_date, status)
  VALUES (profile_row.id, plan_type, deposit_amount, plan_rate, end_dt, 'ACTIVE')
  RETURNING * INTO pos;

  INSERT INTO transactions (user_id, type, token, amount, tx_hash, status)
  VALUES (profile_row.id, 'DEPOSIT', 'USDC', deposit_amount, tx_hash, 'CONFIRMED')
  RETURNING * INTO tx;

  UPDATE profiles SET total_deposited = COALESCE(total_deposited, 0) + deposit_amount
  WHERE id = profile_row.id;

  RETURN jsonb_build_object('position', to_jsonb(pos), 'transaction', to_jsonb(tx));
END;
$$;

-- ─────────────────────────────────────────────
-- B) Update RANKS config: V1=5%, V2=10%, V3=15%, V4=20%, V5=25%, V6=30%, V7=50%
-- ─────────────────────────────────────────────
INSERT INTO system_config (key, value) VALUES
  ('RANKS', '[
    {"level":"V1","commission":0.05},
    {"level":"V2","commission":0.10},
    {"level":"V3","commission":0.15},
    {"level":"V4","commission":0.20},
    {"level":"V5","commission":0.25},
    {"level":"V6","commission":0.30},
    {"level":"V7","commission":0.50}
  ]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Store rank promotion conditions in system_config
INSERT INTO system_config (key, value) VALUES
  ('RANK_CONDITIONS', '[
    {"level":"V1","personalHolding":100,"directReferrals":1,"teamPerformance":5000},
    {"level":"V2","personalHolding":300,"requiredSubRanks":2,"subRankLevel":"V1","teamPerformance":20000},
    {"level":"V3","personalHolding":500,"requiredSubRanks":2,"subRankLevel":"V2","teamPerformance":50000},
    {"level":"V4","personalHolding":1000,"requiredSubRanks":2,"subRankLevel":"V3","teamPerformance":100000},
    {"level":"V5","personalHolding":3000,"requiredSubRanks":2,"subRankLevel":"V4","teamPerformance":500000},
    {"level":"V6","personalHolding":5000,"requiredSubRanks":2,"subRankLevel":"V5","teamPerformance":1000000},
    {"level":"V7","personalHolding":10000,"requiredSubRanks":2,"subRankLevel":"V6","teamPerformance":3000000}
  ]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ─────────────────────────────────────────────
-- C) Earnings release/burn table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES profiles(id),
  source_type TEXT NOT NULL, -- 'VAULT' or 'NODE'
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  burn_rate NUMERIC NOT NULL DEFAULT 0,
  burn_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  release_days INT NOT NULL DEFAULT 0, -- 0=immediate, 7, 15, 30, 60
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RELEASING, COMPLETED
  release_start TIMESTAMP NOT NULL DEFAULT NOW(),
  release_end TIMESTAMP NOT NULL DEFAULT NOW(),
  released_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- D) Request earnings release with burn mechanism
--    Immediate=20% burn, 7d=15%, 15d=10%, 30d=5%, 60d=0%
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION request_earnings_release(
  addr TEXT,
  release_days INT,
  amount NUMERIC,
  source_type TEXT DEFAULT 'VAULT'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  burn_rate NUMERIC;
  burn_amount NUMERIC;
  net_amount NUMERIC;
  release_end_dt TIMESTAMP;
  release_rec earnings_releases%ROWTYPE;
  available NUMERIC;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Determine burn rate by release period
  IF release_days = 0 THEN burn_rate := 0.20;
  ELSIF release_days = 7 THEN burn_rate := 0.15;
  ELSIF release_days = 15 THEN burn_rate := 0.10;
  ELSIF release_days = 30 THEN burn_rate := 0.05;
  ELSIF release_days = 60 THEN burn_rate := 0.00;
  ELSE
    RAISE EXCEPTION 'Invalid release period. Use 0, 7, 15, 30, or 60 days';
  END IF;

  -- Check available balance based on source
  IF source_type = 'VAULT' THEN
    SELECT COALESCE(SUM(vr.amount), 0) INTO available
    FROM vault_rewards vr
    WHERE vr.user_id = profile_row.id AND vr.reward_type = 'DAILY_YIELD';

    -- Subtract already released/pending amounts
    SELECT available - COALESCE(SUM(er.gross_amount), 0) INTO available
    FROM earnings_releases er
    WHERE er.user_id = profile_row.id AND er.source_type = 'VAULT' AND er.status IN ('PENDING', 'RELEASING', 'COMPLETED');
  ELSIF source_type = 'NODE' THEN
    SELECT COALESCE(SUM(available_balance), 0) INTO available
    FROM node_memberships
    WHERE user_id = profile_row.id AND status IN ('ACTIVE', 'PENDING_MILESTONES');
  ELSE
    RAISE EXCEPTION 'Invalid source_type. Use VAULT or NODE';
  END IF;

  IF amount > available THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', ROUND(available, 2);
  END IF;

  burn_amount := amount * burn_rate;
  net_amount := amount - burn_amount;
  release_end_dt := NOW() + (release_days || ' days')::INTERVAL;

  INSERT INTO earnings_releases (user_id, source_type, gross_amount, burn_rate, burn_amount, net_amount, release_days, status, release_start, release_end)
  VALUES (profile_row.id, source_type, amount, burn_rate, burn_amount, net_amount, release_days,
    CASE WHEN release_days = 0 THEN 'COMPLETED' ELSE 'RELEASING' END,
    NOW(), release_end_dt)
  RETURNING * INTO release_rec;

  -- If immediate release, deduct from node available_balance
  IF source_type = 'NODE' AND release_days = 0 THEN
    UPDATE node_memberships
    SET available_balance = GREATEST(available_balance - amount, 0)
    WHERE user_id = profile_row.id AND status IN ('ACTIVE', 'PENDING_MILESTONES');
  END IF;

  RETURN jsonb_build_object(
    'release', to_jsonb(release_rec),
    'burnRate', burn_rate,
    'burnAmount', ROUND(burn_amount, 2)::TEXT,
    'netAmount', ROUND(net_amount, 2)::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- E) Process pending releases (run daily)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_pending_releases()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rel RECORD;
  processed INT := 0;
  total_released NUMERIC := 0;
  total_burned NUMERIC := 0;
BEGIN
  FOR rel IN
    SELECT * FROM earnings_releases
    WHERE status = 'RELEASING' AND release_end <= NOW()
  LOOP
    UPDATE earnings_releases
    SET status = 'COMPLETED', released_at = NOW()
    WHERE id = rel.id;

    -- Deduct from node available_balance if node source
    IF rel.source_type = 'NODE' THEN
      UPDATE node_memberships
      SET available_balance = GREATEST(available_balance - rel.gross_amount, 0)
      WHERE user_id = rel.user_id AND status IN ('ACTIVE', 'PENDING_MILESTONES');
    END IF;

    processed := processed + 1;
    total_released := total_released + rel.net_amount;
    total_burned := total_burned + rel.burn_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', processed,
    'totalReleased', ROUND(total_released, 2)::TEXT,
    'totalBurned', ROUND(total_burned, 2)::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- F) Check rank promotion
--    Performance = vault deposits only (not nodes)
--    V1: ≥100U holding, ≥1 direct referral, ≥5000U team performance
--    V2-V7: holding + required sub-ranks + team performance
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rank_promotion(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  conditions JSONB;
  cond RECORD;
  current_rank TEXT;
  new_rank TEXT;
  personal_holding NUMERIC;
  direct_referral_count INT;
  team_performance NUMERIC;
  rank_levels TEXT[] := ARRAY['V1','V2','V3','V4','V5','V6','V7'];
  current_rank_idx INT := 0;
  target_rank_idx INT;
  cond_holding NUMERIC;
  cond_referrals INT;
  cond_sub_ranks INT;
  cond_sub_level TEXT;
  cond_team_perf NUMERIC;
  qualified_sub_count INT;
  promoted BOOLEAN := FALSE;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  current_rank := profile_row.rank;
  SELECT value::JSONB INTO conditions FROM system_config WHERE key = 'RANK_CONDITIONS';

  -- Calculate personal holding = active vault deposits (NOT nodes)
  SELECT COALESCE(SUM(principal), 0) INTO personal_holding
  FROM vault_positions
  WHERE user_id = profile_row.id AND status = 'ACTIVE';

  -- Count direct referrals (users who have vault deposits)
  SELECT COUNT(*) INTO direct_referral_count
  FROM profiles p
  WHERE p.referrer_id = profile_row.id
    AND EXISTS (
      SELECT 1 FROM vault_positions vp
      WHERE vp.user_id = p.id AND vp.status = 'ACTIVE'
    );

  -- Calculate team performance = total vault deposits of entire downline (recursive)
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = profile_row.id
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_performance
  FROM vault_positions vp
  JOIN downline d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE';

  -- Determine current rank index
  IF current_rank IS NOT NULL THEN
    FOR i IN 1..array_length(rank_levels, 1) LOOP
      IF rank_levels[i] = current_rank THEN
        current_rank_idx := i;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  new_rank := current_rank;

  -- Check each rank from current+1 upwards
  FOR target_rank_idx IN (current_rank_idx + 1)..array_length(rank_levels, 1) LOOP
    -- Get conditions for this rank
    SELECT
      COALESCE((elem->>'personalHolding')::NUMERIC, 0),
      COALESCE((elem->>'directReferrals')::INT, 0),
      COALESCE((elem->>'requiredSubRanks')::INT, 0),
      COALESCE(elem->>'subRankLevel', ''),
      COALESCE((elem->>'teamPerformance')::NUMERIC, 0)
    INTO cond_holding, cond_referrals, cond_sub_ranks, cond_sub_level, cond_team_perf
    FROM jsonb_array_elements(conditions) AS elem
    WHERE elem->>'level' = rank_levels[target_rank_idx];

    -- Check personal holding
    IF personal_holding < cond_holding THEN EXIT; END IF;

    -- Check team performance
    IF team_performance < cond_team_perf THEN EXIT; END IF;

    -- V1 special: check direct referrals count
    IF rank_levels[target_rank_idx] = 'V1' THEN
      IF direct_referral_count < cond_referrals THEN EXIT; END IF;
    END IF;

    -- V2+: check required sub-ranks (direct referrals with specific rank)
    IF cond_sub_ranks > 0 AND cond_sub_level != '' THEN
      SELECT COUNT(*) INTO qualified_sub_count
      FROM profiles p
      WHERE p.referrer_id = profile_row.id
        AND p.rank IS NOT NULL
        AND array_position(rank_levels, p.rank) >= array_position(rank_levels, cond_sub_level);

      IF qualified_sub_count < cond_sub_ranks THEN EXIT; END IF;
    END IF;

    -- All conditions met, promote to this rank
    new_rank := rank_levels[target_rank_idx];
    promoted := TRUE;
  END LOOP;

  -- Apply promotion
  IF promoted AND new_rank IS DISTINCT FROM current_rank THEN
    UPDATE profiles SET rank = new_rank WHERE id = profile_row.id;
  END IF;

  RETURN jsonb_build_object(
    'previousRank', current_rank,
    'currentRank', new_rank,
    'promoted', promoted AND new_rank IS DISTINCT FROM current_rank,
    'personalHolding', ROUND(personal_holding, 2)::TEXT,
    'directReferrals', direct_referral_count,
    'teamPerformance', ROUND(team_performance, 2)::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- G) Daily settlement master function (calls all sub-settlements)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_daily_settlement()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  vault_result JSONB;
  node_result JSONB;
  release_result JSONB;
  revenue_result JSONB;
  node_active BOOLEAN;
BEGIN
  -- 1. Settle vault daily yields
  SELECT settle_vault_daily() INTO vault_result;

  -- 2. Check if node system is active
  SELECT COALESCE(value::BOOLEAN, FALSE) INTO node_active
  FROM system_config WHERE key = 'NODE_SYSTEM_ACTIVE';

  IF node_active THEN
    -- 3. Settle node fixed yields
    SELECT settle_node_fixed_yield() INTO node_result;

    -- 4. Distribute daily revenue to pools
    SELECT distribute_daily_revenue() INTO revenue_result;
  ELSE
    node_result := '{"skipped": true, "reason": "NODE_SYSTEM_INACTIVE"}'::JSONB;
    revenue_result := '{"skipped": true}'::JSONB;
  END IF;

  -- 5. Process pending earnings releases
  SELECT process_pending_releases() INTO release_result;

  RETURN jsonb_build_object(
    'vault', vault_result,
    'node', node_result,
    'revenue', revenue_result,
    'releases', release_result,
    'settledAt', NOW()::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- H) Get user earnings release history
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_earnings_releases(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  releases JSONB;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RETURN '{"releases": []}'::JSONB;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(er) ORDER BY er.created_at DESC), '[]'::JSONB)
  INTO releases
  FROM earnings_releases er
  WHERE er.user_id = profile_row.id;

  RETURN jsonb_build_object('releases', releases);
END;
$$;

-- ─────────────────────────────────────────────
-- I) Get rank promotion status for display
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_rank_status(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  personal_holding NUMERIC;
  direct_referral_count INT;
  team_performance NUMERIC;
  conditions JSONB;
  next_cond JSONB;
  rank_levels TEXT[] := ARRAY['V1','V2','V3','V4','V5','V6','V7'];
  current_idx INT := 0;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RETURN '{"error": "User not found"}'::JSONB;
  END IF;

  -- Personal holding = active vault deposits
  SELECT COALESCE(SUM(principal), 0) INTO personal_holding
  FROM vault_positions
  WHERE user_id = profile_row.id AND status = 'ACTIVE';

  -- Direct referrals with deposits
  SELECT COUNT(*) INTO direct_referral_count
  FROM profiles p
  WHERE p.referrer_id = profile_row.id
    AND EXISTS (
      SELECT 1 FROM vault_positions vp
      WHERE vp.user_id = p.id AND vp.status = 'ACTIVE'
    );

  -- Team performance (recursive downline vault deposits)
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = profile_row.id
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_performance
  FROM vault_positions vp
  JOIN downline d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE';

  -- Get conditions
  SELECT value::JSONB INTO conditions FROM system_config WHERE key = 'RANK_CONDITIONS';

  -- Find current rank index
  IF profile_row.rank IS NOT NULL THEN
    FOR i IN 1..array_length(rank_levels, 1) LOOP
      IF rank_levels[i] = profile_row.rank THEN current_idx := i; EXIT; END IF;
    END LOOP;
  END IF;

  -- Get next rank conditions
  IF current_idx < array_length(rank_levels, 1) THEN
    SELECT elem INTO next_cond
    FROM jsonb_array_elements(conditions) AS elem
    WHERE elem->>'level' = rank_levels[current_idx + 1];
  END IF;

  RETURN jsonb_build_object(
    'currentRank', profile_row.rank,
    'personalHolding', ROUND(personal_holding, 2)::TEXT,
    'directReferrals', direct_referral_count,
    'teamPerformance', ROUND(team_performance, 2)::TEXT,
    'nextRankConditions', next_cond,
    'allConditions', conditions
  );
END;
$$;
