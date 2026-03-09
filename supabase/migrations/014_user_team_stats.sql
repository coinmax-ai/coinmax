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
  own_node TEXT;
  direct_max_nodes INT;
  direct_mini_nodes INT;
  total_team_nodes INT;
BEGIN
  SELECT COUNT(*) INTO direct FROM profiles WHERE referrer_id = user_id_param;

  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = user_id_param
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COUNT(*) INTO team_size FROM downline;

  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = user_id_param
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COALESCE(SUM(vp.principal), 0) INTO team_perf
  FROM vault_positions vp
  JOIN downline d ON vp.user_id = d.id
  WHERE vp.status = 'ACTIVE';

  SELECT COALESCE(SUM(principal), 0) INTO personal
  FROM vault_positions WHERE user_id = user_id_param AND status = 'ACTIVE';

  -- Own node type
  SELECT node_type INTO own_node FROM node_memberships
  WHERE user_id = user_id_param ORDER BY created_at DESC LIMIT 1;

  -- Direct referral MAX node count
  SELECT COUNT(*) INTO direct_max_nodes
  FROM node_memberships nm
  JOIN profiles p ON nm.user_id = p.id
  WHERE p.referrer_id = user_id_param AND nm.node_type = 'MAX';

  -- Direct referral MINI node count
  SELECT COUNT(*) INTO direct_mini_nodes
  FROM node_memberships nm
  JOIN profiles p ON nm.user_id = p.id
  WHERE p.referrer_id = user_id_param AND nm.node_type = 'MINI';

  -- Total team nodes
  WITH RECURSIVE downline AS (
    SELECT id FROM profiles WHERE referrer_id = user_id_param
    UNION ALL
    SELECT p.id FROM profiles p JOIN downline d ON p.referrer_id = d.id
  )
  SELECT COUNT(*) INTO total_team_nodes
  FROM node_memberships nm
  JOIN downline d ON nm.user_id = d.id;

  RETURN jsonb_build_object(
    'teamSize', team_size,
    'teamPerformance', ROUND(team_perf, 2)::TEXT,
    'personalHolding', ROUND(personal, 2)::TEXT,
    'directCount', direct,
    'ownNode', COALESCE(own_node, 'NONE'),
    'directMaxNodes', direct_max_nodes,
    'directMiniNodes', direct_mini_nodes,
    'totalTeamNodes', total_team_nodes
  );
END;
$$;
