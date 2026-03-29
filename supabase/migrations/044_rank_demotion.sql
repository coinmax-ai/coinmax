-- ═══════════════════════════════════════════════════════════════
-- Migration 044: Rank demotion on vault maturity/redemption
--
-- Problem: check_rank_promotion() only promotes, never demotes.
--          When vault positions expire (COMPLETED) or early-redeem (EARLY_EXIT),
--          the user's personal holding & team performance drop, but rank stays.
--
-- Fix: Replace with check_rank_update() that finds the HIGHEST qualifying rank
--      and sets it — even if lower than current rank (demotion).
--      Trigger on vault position status change + upline chain.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- A) Bidirectional rank check (promote + demote)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_rank_promotion(addr TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  conditions JSONB;
  current_rank TEXT;
  new_rank TEXT := NULL;
  personal_holding NUMERIC;
  direct_referral_count INT;
  team_performance NUMERIC;
  team_performance_3gen NUMERIC;
  rank_levels TEXT[] := ARRAY['V1','V2','V3','V4','V5','V6','V7'];
  target_rank_idx INT;
  cond_holding NUMERIC;
  cond_referrals INT;
  cond_sub_ranks INT;
  cond_sub_level TEXT;
  cond_team_perf NUMERIC;
  qualified_line_count INT;
  qualified BOOLEAN;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  current_rank := profile_row.rank;
  SELECT value::JSONB INTO conditions FROM system_config WHERE key = 'RANK_CONDITIONS';

  -- Personal holding (exclude bonus)
  SELECT COALESCE(SUM(principal), 0) INTO personal_holding
  FROM vault_positions
  WHERE user_id = profile_row.id AND status = 'ACTIVE' AND plan_type != 'BONUS_5D';

  -- Direct referrals with active deposits (exclude bonus)
  SELECT COUNT(*) INTO direct_referral_count
  FROM profiles p
  WHERE p.referrer_id = profile_row.id
    AND EXISTS (
      SELECT 1 FROM vault_positions vp
      WHERE vp.user_id = p.id AND vp.status = 'ACTIVE' AND vp.plan_type != 'BONUS_5D'
    );

  -- Full team performance (exclude bonus)
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = profile_row.id
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_performance
  FROM vault_positions vp
  JOIN downline d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE' AND vp.plan_type != 'BONUS_5D';

  -- 3-generation team performance (for V1)
  WITH RECURSIVE downline_3gen AS (
    SELECT id, 1 as depth FROM profiles WHERE referrer_id = profile_row.id
    UNION ALL
    SELECT p.id, d.depth + 1 FROM profiles p JOIN downline_3gen d ON p.referrer_id = d.id
    WHERE d.depth < 3
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_performance_3gen
  FROM vault_positions vp
  JOIN downline_3gen d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE' AND vp.plan_type != 'BONUS_5D';

  -- Check each rank
  FOR target_rank_idx IN 1..array_length(rank_levels, 1) LOOP
    SELECT
      COALESCE((elem->>'personalHolding')::NUMERIC, 0),
      COALESCE((elem->>'directReferrals')::INT, 0),
      COALESCE((elem->>'requiredSubRanks')::INT, 0),
      COALESCE(elem->>'subRankLevel', ''),
      COALESCE((elem->>'teamPerformance')::NUMERIC, 0)
    INTO cond_holding, cond_referrals, cond_sub_ranks, cond_sub_level, cond_team_perf
    FROM jsonb_array_elements(conditions) AS elem
    WHERE elem->>'level' = rank_levels[target_rank_idx];

    qualified := TRUE;

    -- Personal holding
    IF personal_holding < cond_holding THEN qualified := FALSE; END IF;

    -- Team performance: V1 uses 3-gen limit, V2+ uses full depth
    IF qualified THEN
      IF rank_levels[target_rank_idx] = 'V1' THEN
        IF team_performance_3gen < cond_team_perf THEN qualified := FALSE; END IF;
      ELSE
        IF team_performance < cond_team_perf THEN qualified := FALSE; END IF;
      END IF;
    END IF;

    -- V1: check direct referrals count
    IF qualified AND rank_levels[target_rank_idx] = 'V1' THEN
      IF direct_referral_count < cond_referrals THEN qualified := FALSE; END IF;
    END IF;

    -- V2+: check required sub-ranks on DIFFERENT LINES (not just direct referrals)
    IF qualified AND cond_sub_ranks > 0 AND cond_sub_level != '' THEN
      SELECT COUNT(*) INTO qualified_line_count
      FROM (
        SELECT dr.id AS line_root
        FROM profiles dr
        WHERE dr.referrer_id = profile_row.id
        AND EXISTS (
          WITH RECURSIVE line_tree AS (
            SELECT dr.id AS mid
            UNION ALL
            SELECT p.id FROM profiles p JOIN line_tree lt ON p.referrer_id = lt.mid
          )
          SELECT 1 FROM profiles lp
          JOIN line_tree lt ON lp.id = lt.mid
          WHERE lp.rank IS NOT NULL
            AND array_position(rank_levels, lp.rank) >= array_position(rank_levels, cond_sub_level)
        )
      ) qualified_lines;

      IF qualified_line_count < cond_sub_ranks THEN qualified := FALSE; END IF;
    END IF;

    IF qualified THEN
      new_rank := rank_levels[target_rank_idx];
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Apply rank change (up or down)
  IF new_rank IS DISTINCT FROM current_rank THEN
    UPDATE profiles SET rank = new_rank WHERE id = profile_row.id;
  END IF;

  RETURN jsonb_build_object(
    'previousRank', current_rank,
    'currentRank', new_rank,
    'promoted', (new_rank IS NOT NULL AND current_rank IS NOT NULL AND
                 COALESCE(array_position(rank_levels, new_rank), 0) > COALESCE(array_position(rank_levels, current_rank), 0)),
    'demoted', (COALESCE(array_position(rank_levels, new_rank), 0) < COALESCE(array_position(rank_levels, current_rank), 0)),
    'personalHolding', ROUND(personal_holding, 2)::TEXT,
    'directReferrals', direct_referral_count,
    'teamPerformance', ROUND(team_performance, 2)::TEXT,
    'teamPerformance3gen', ROUND(team_performance_3gen, 2)::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- B) Recheck ranks on vault position status change
--    Called after maturity (COMPLETED) or early redeem (EARLY_EXIT)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recheck_ranks_on_vault_change(target_user_id VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  target_addr TEXT;
  current_id VARCHAR;
  upline_id VARCHAR;
  depth INT := 0;
  result JSONB;
  results JSONB := '[]'::JSONB;
BEGIN
  -- Get wallet address
  SELECT wallet_address INTO target_addr FROM profiles WHERE id = target_user_id;
  IF target_addr IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Recheck the user themselves
  SELECT check_rank_promotion(target_addr) INTO result;
  results := results || jsonb_build_array(
    jsonb_build_object('address', target_addr, 'result', result)
  );

  -- Recheck upline chain (up to 15 levels) — their team performance changed
  current_id := target_user_id;
  LOOP
    depth := depth + 1;
    IF depth > 999 THEN EXIT; END IF; -- unlimited upline depth

    SELECT referrer_id INTO upline_id FROM profiles WHERE id = current_id;
    IF upline_id IS NULL THEN EXIT; END IF;

    SELECT wallet_address INTO target_addr FROM profiles WHERE id = upline_id;
    IF target_addr IS NOT NULL THEN
      SELECT check_rank_promotion(target_addr) INTO result;
      results := results || jsonb_build_array(
        jsonb_build_object('address', target_addr, 'result', result)
      );
    END IF;

    current_id := upline_id;
  END LOOP;

  RETURN jsonb_build_object('rechecked', results);
END;
$$;

-- ─────────────────────────────────────────────
-- C) Update batch_check to also handle demotions
--    Check ALL users with rank (not just those with active deposits)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION batch_check_rank_promotions()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  p RECORD;
  result JSONB;
  promoted_count INT := 0;
  demoted_count INT := 0;
  checked_count INT := 0;
BEGIN
  -- Check all users who have a rank OR have active vault deposits
  FOR p IN
    SELECT DISTINCT pr.wallet_address
    FROM profiles pr
    WHERE pr.rank IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM vault_positions vp
         WHERE vp.user_id = pr.id AND vp.status = 'ACTIVE'
       )
    ORDER BY pr.wallet_address
  LOOP
    SELECT check_rank_promotion(p.wallet_address) INTO result;
    checked_count := checked_count + 1;

    IF (result->>'promoted')::BOOLEAN THEN
      promoted_count := promoted_count + 1;
    END IF;
    IF (result->>'demoted')::BOOLEAN THEN
      demoted_count := demoted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checkedCount', checked_count,
    'promotedCount', promoted_count,
    'demotedCount', demoted_count
  );
END;
$$;
