-- ═══════════════════════════════════════════════════════════════
-- Migration 014: get_user_team_stats RPC for admin referral tree
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_team_stats(user_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  team_size INT;
  team_perf NUMERIC;
  personal NUMERIC;
  direct INT;
BEGIN
  -- Direct referral count
  SELECT COUNT(*) INTO direct FROM profiles WHERE referrer_id = user_id_param;

  -- Team size (recursive)
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = user_id_param
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COUNT(*) INTO team_size FROM downline;

  -- Team performance = total vault deposits of downline
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = user_id_param
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_perf
  FROM vault_positions vp
  JOIN downline d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE';

  -- Personal holding
  SELECT COALESCE(SUM(principal), 0) INTO personal
  FROM vault_positions WHERE user_id = user_id_param AND status = 'ACTIVE';

  RETURN jsonb_build_object(
    'teamSize', team_size,
    'teamPerformance', ROUND(team_perf, 2)::TEXT,
    'personalHolding', ROUND(personal, 2)::TEXT,
    'directCount', direct
  );
END;
$$;
