-- Fix: 总金额 should be frozen amount only (1000/6000), not contribution+frozen (1100/6600)
-- Also fix MINI daily_rate to 0.009 (was 0.005 in the active function version)

-- Update existing transaction records to correct the amount
UPDATE transactions
SET amount = (details->>'frozen')::NUMERIC
WHERE type = 'NODE_PURCHASE'
  AND details->>'frozen' IS NOT NULL
  AND amount = (details->>'contribution')::NUMERIC + (details->>'frozen')::NUMERIC;

-- Recreate purchase_node with corrected amount = frozen (not contribution+frozen)
CREATE OR REPLACE FUNCTION purchase_node(
  addr TEXT,
  node_type_param TEXT,
  tx_hash TEXT DEFAULT NULL,
  payment_mode_param TEXT DEFAULT 'FULL'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  contribution NUMERIC;
  frozen NUMERIC;
  daily_rate_val NUMERIC;
  node_duration INT;
  membership node_memberships%ROWTYPE;
  milestones_json JSONB;
  milestone JSONB;
  m_index INT := 0;
  total_m INT;
  highest_node TEXT;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF node_type_param = 'MAX' THEN
    contribution := 600;
    frozen := 6000;
    daily_rate_val := 0.009;
    node_duration := 120;
    SELECT value::JSONB INTO milestones_json FROM system_config WHERE key = 'MAX_MILESTONES';
  ELSE
    contribution := 100;
    frozen := 1000;
    daily_rate_val := 0.009;
    node_duration := 90;
    SELECT value::JSONB INTO milestones_json FROM system_config WHERE key = 'MINI_MILESTONES';
  END IF;

  total_m := jsonb_array_length(COALESCE(milestones_json, '[]'::JSONB));

  INSERT INTO node_memberships (
    user_id, node_type, price, contribution_amount, frozen_amount, daily_rate,
    status, start_date, end_date,
    payment_mode, deposit_amount, milestone_stage, total_milestones, earnings_capacity,
    locked_earnings, released_earnings, available_balance
  )
  VALUES (
    profile_row.id, node_type_param, contribution + frozen,
    contribution, frozen, daily_rate_val,
    'PENDING_MILESTONES', NOW(), NOW() + (node_duration || ' days')::INTERVAL,
    'FULL', contribution, 0, total_m, 0.0,
    0, 0, 0
  )
  RETURNING * INTO membership;

  IF milestones_json IS NOT NULL THEN
    FOR milestone IN SELECT * FROM jsonb_array_elements(milestones_json)
    LOOP
      INSERT INTO node_milestones (membership_id, milestone_index, required_rank, deadline_days, deadline_at)
      VALUES (
        membership.id,
        m_index,
        milestone->>'rank',
        (milestone->>'days')::INT,
        NOW() + ((milestone->>'days')::INT || ' days')::INTERVAL
      );
      m_index := m_index + 1;
    END LOOP;
  END IF;

  -- Fix: amount = frozen only (not contribution + frozen)
  INSERT INTO transactions (user_id, type, token, amount, tx_hash, status, details)
  VALUES (profile_row.id, 'NODE_PURCHASE', 'USDC', frozen, tx_hash, 'CONFIRMED',
    jsonb_build_object('node_type', node_type_param, 'contribution', contribution, 'frozen', frozen));

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM node_memberships WHERE user_id = profile_row.id AND node_type = 'MAX' AND status IN ('ACTIVE', 'PENDING_MILESTONES'))
    THEN 'MAX'
    WHEN EXISTS (SELECT 1 FROM node_memberships WHERE user_id = profile_row.id AND node_type = 'MINI' AND status IN ('ACTIVE', 'PENDING_MILESTONES'))
    THEN 'MINI'
    ELSE 'NONE'
  END INTO highest_node;

  UPDATE profiles SET node_type = highest_node WHERE id = profile_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', membership.id,
    'node_type', node_type_param,
    'contribution', contribution,
    'frozen', frozen,
    'daily_rate', daily_rate_val,
    'duration', node_duration,
    'milestones', total_m
  );
END;
$$;
