-- =============================================
-- 004: Payment & Reward System
-- New tables, system config, updated RPCs, reward settlement functions
-- =============================================

-- ─────────────────────────────────────────────
-- A) New Tables
-- ─────────────────────────────────────────────

-- System config for tunable parameters
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue events from all platform sources
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,  -- 'prediction_fee', 'vault_mgmt_fee', 'ai_platform_fee', 'withdrawal_fee'
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue pool balances
CREATE TABLE IF NOT EXISTS revenue_pools (
  pool_name TEXT PRIMARY KEY,  -- 'NODE_POOL', 'BUYBACK_POOL', 'INSURANCE_POOL', 'TREASURY_POOL', 'OPERATIONS'
  balance NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Node reward ledger
CREATE TABLE IF NOT EXISTS node_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES profiles(id) NOT NULL,
  reward_type TEXT NOT NULL,  -- 'FIXED_YIELD', 'POOL_DIVIDEND', 'TEAM_COMMISSION'
  amount NUMERIC NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault reward ledger
CREATE TABLE IF NOT EXISTS vault_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES profiles(id) NOT NULL,
  position_id VARCHAR REFERENCES vault_positions(id) NOT NULL,
  reward_type TEXT NOT NULL,  -- 'DAILY_YIELD', 'PLATFORM_FEE'
  amount NUMERIC NOT NULL,
  ar_price NUMERIC,           -- MA token price at settlement time (USD)
  ar_amount NUMERIC,          -- Reward amount in MA tokens (= amount / ar_price)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- B) System Config Values
-- ─────────────────────────────────────────────

INSERT INTO system_config (key, value) VALUES
  ('NODE_MAX_DURATION_DAYS', '120'),
  ('NODE_MAX_FIXED_RETURN', '0.10'),
  ('NODE_MINI_DURATION_DAYS', '90'),
  ('NODE_MINI_FIXED_RETURN', '0.10'),
  ('NODE_MAX_WEIGHT_MULTIPLIER', '1.5'),
  ('NODE_MINI_WEIGHT_MULTIPLIER', '1.0'),
  ('NODE_EARLY_EXIT_PENALTY', '0.10'),
  ('NODE_DIVIDEND_USER_KEEP', '0.90'),
  ('NODE_DIVIDEND_TEAM_POOL', '0.10'),
  ('REVENUE_NODE_POOL_SHARE', '0.50'),
  ('REVENUE_BUYBACK_SHARE', '0.20'),
  ('REVENUE_INSURANCE_SHARE', '0.10'),
  ('REVENUE_TREASURY_SHARE', '0.10'),
  ('REVENUE_OPERATIONS_SHARE', '0.10'),
  ('VAULT_PLATFORM_FEE', '0.10'),
  ('VAULT_EARLY_EXIT_PENALTY', '0.10'),
  ('VAULT_MIN_AMOUNT', '50'),
  ('DIRECT_REFERRAL_RATE', '0.10'),
  ('TEAM_MAX_DEPTH', '15')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Rank configuration
INSERT INTO system_config (key, value) VALUES
  ('RANKS', '[
    {"level":"V1","commission":0.06},
    {"level":"V2","commission":0.10},
    {"level":"V3","commission":0.15},
    {"level":"V4","commission":0.20},
    {"level":"V5","commission":0.25},
    {"level":"V6","commission":0.30},
    {"level":"V7","commission":0.50}
  ]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Initialize revenue pools
INSERT INTO revenue_pools (pool_name, balance) VALUES
  ('NODE_POOL', 0), ('BUYBACK_POOL', 0), ('INSURANCE_POOL', 0),
  ('TREASURY_POOL', 0), ('OPERATIONS', 0)
ON CONFLICT (pool_name) DO NOTHING;

-- ─────────────────────────────────────────────
-- C) Updated RPC Functions (with tx_hash, USDC token)
-- ─────────────────────────────────────────────

-- vault_deposit: now accepts tx_hash, enforces min amount, uses USDC
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

  -- Get min amount from config
  SELECT value::NUMERIC INTO min_amount FROM system_config WHERE key = 'VAULT_MIN_AMOUNT';
  IF min_amount IS NULL THEN min_amount := 50; END IF;

  IF deposit_amount < min_amount THEN
    RAISE EXCEPTION 'Minimum deposit is % USDC', min_amount;
  END IF;

  IF plan_type = '5_DAYS' THEN plan_days := 5; plan_rate := 0.005;
  ELSIF plan_type = '15_DAYS' THEN plan_days := 15; plan_rate := 0.007;
  ELSIF plan_type = '45_DAYS' THEN plan_days := 45; plan_rate := 0.009;
  ELSE plan_days := 5; plan_rate := 0.005;
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

-- subscribe_vip: now accepts tx_hash and plan_label, uses USDC
CREATE OR REPLACE FUNCTION subscribe_vip(addr TEXT, tx_hash TEXT DEFAULT NULL, plan_label TEXT DEFAULT 'monthly')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  vip_price NUMERIC;
  vip_interval INTERVAL;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF plan_label = 'yearly' THEN
    vip_price := 899;
    vip_interval := INTERVAL '1 year';
  ELSE
    vip_price := 69;
    vip_interval := INTERVAL '1 month';
  END IF;

  UPDATE profiles SET is_vip = TRUE, vip_expires_at = NOW() + vip_interval
  WHERE id = profile_row.id
  RETURNING * INTO profile_row;

  INSERT INTO transactions (user_id, type, token, amount, tx_hash, status)
  VALUES (profile_row.id, 'VIP_PURCHASE', 'USDC', vip_price, tx_hash, 'CONFIRMED');

  RETURN to_jsonb(profile_row);
END;
$$;

-- purchase_node: now accepts tx_hash, sets rank, start/end dates, uses USDC
CREATE OR REPLACE FUNCTION purchase_node(addr TEXT, node_type_param TEXT, tx_hash TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  node_price NUMERIC;
  node_duration INT;
  node_rank TEXT;
  membership node_memberships%ROWTYPE;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF node_type_param = 'MAX' THEN
    node_price := 6000;
    node_duration := 120;
    node_rank := 'V6';
  ELSE
    node_price := 1000;
    node_duration := 90;
    node_rank := 'V4';
  END IF;

  INSERT INTO node_memberships (user_id, node_type, price, status, start_date, end_date)
  VALUES (profile_row.id, node_type_param, node_price, 'ACTIVE', NOW(), NOW() + (node_duration || ' days')::INTERVAL)
  RETURNING * INTO membership;

  UPDATE profiles SET node_type = node_type_param, rank = node_rank
  WHERE id = profile_row.id;

  INSERT INTO transactions (user_id, type, token, amount, tx_hash, status)
  VALUES (profile_row.id, 'NODE_PURCHASE', 'USDC', node_price, tx_hash, 'CONFIRMED');

  RETURN to_jsonb(membership);
END;
$$;

-- vault_withdraw: updated with early exit penalty from config, uses USDC
CREATE OR REPLACE FUNCTION vault_withdraw(addr TEXT, pos_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  profile_row profiles%ROWTYPE;
  pos vault_positions%ROWTYPE;
  days_elapsed INT;
  yield_amount NUMERIC;
  total_withdraw NUMERIC;
  is_early BOOLEAN;
  penalty_rate NUMERIC;
  tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT * INTO pos FROM vault_positions WHERE id = pos_id::UUID AND user_id = profile_row.id;
  IF pos.id IS NULL THEN
    RAISE EXCEPTION 'Position not found';
  END IF;

  days_elapsed := GREATEST(0, EXTRACT(DAY FROM NOW() - pos.start_date)::INT);
  yield_amount := pos.principal * pos.daily_rate * days_elapsed;
  is_early := pos.end_date IS NOT NULL AND NOW() < pos.end_date;

  IF is_early THEN
    -- Early exit: penalty on principal, keep settled yield
    SELECT COALESCE(value::NUMERIC, 0.10) INTO penalty_rate FROM system_config WHERE key = 'VAULT_EARLY_EXIT_PENALTY';
    total_withdraw := pos.principal * (1 - penalty_rate) + yield_amount;
  ELSE
    total_withdraw := pos.principal + yield_amount;
  END IF;

  UPDATE vault_positions SET status = CASE WHEN is_early THEN 'EARLY_EXIT' ELSE 'COMPLETED' END
  WHERE id = pos_id::UUID;

  INSERT INTO transactions (user_id, type, token, amount, status)
  VALUES (profile_row.id, 'WITHDRAW', 'USDC', ROUND(total_withdraw, 6), 'CONFIRMED')
  RETURNING * INTO tx;

  IF yield_amount > 0 THEN
    INSERT INTO transactions (user_id, type, token, amount, status)
    VALUES (profile_row.id, 'YIELD', 'USDC', ROUND(yield_amount, 6), 'CONFIRMED');
  END IF;

  UPDATE profiles SET total_withdrawn = COALESCE(total_withdrawn, 0) + total_withdraw
  WHERE id = profile_row.id;

  RETURN jsonb_build_object(
    'transaction', to_jsonb(tx),
    'yieldAmount', ROUND(yield_amount, 6)::TEXT,
    'totalWithdraw', ROUND(total_withdraw, 6)::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- D) Reward Settlement Functions (for daily cron)
-- ─────────────────────────────────────────────

-- settle_node_fixed_yield: daily fixed yield for active nodes
CREATE OR REPLACE FUNCTION settle_node_fixed_yield()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  node RECORD;
  fixed_return NUMERIC;
  duration_days INT;
  daily_profit NUMERIC;
  total_settled NUMERIC := 0;
  nodes_processed INT := 0;
BEGIN
  FOR node IN
    SELECT nm.*, p.id AS profile_id
    FROM node_memberships nm
    JOIN profiles p ON p.id = nm.user_id
    WHERE nm.status = 'ACTIVE'
      AND (nm.end_date IS NULL OR nm.end_date > NOW())
  LOOP
    -- Get config based on node type
    IF node.node_type = 'MAX' THEN
      SELECT COALESCE(value::NUMERIC, 0.10) INTO fixed_return FROM system_config WHERE key = 'NODE_MAX_FIXED_RETURN';
      SELECT COALESCE(value::INT, 120) INTO duration_days FROM system_config WHERE key = 'NODE_MAX_DURATION_DAYS';
    ELSE
      SELECT COALESCE(value::NUMERIC, 0.10) INTO fixed_return FROM system_config WHERE key = 'NODE_MINI_FIXED_RETURN';
      SELECT COALESCE(value::INT, 90) INTO duration_days FROM system_config WHERE key = 'NODE_MINI_DURATION_DAYS';
    END IF;

    daily_profit := node.price * fixed_return / duration_days;

    INSERT INTO node_rewards (user_id, reward_type, amount, details)
    VALUES (node.user_id, 'FIXED_YIELD', daily_profit,
      jsonb_build_object('node_type', node.node_type, 'principal', node.price, 'rate', fixed_return, 'duration', duration_days));

    total_settled := total_settled + daily_profit;
    nodes_processed := nodes_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('nodesProcessed', nodes_processed, 'totalSettled', ROUND(total_settled, 6)::TEXT);
END;
$$;

-- distribute_daily_revenue: split today's revenue into pools
CREATE OR REPLACE FUNCTION distribute_daily_revenue()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  today_revenue NUMERIC;
  node_share NUMERIC;
  buyback_share NUMERIC;
  insurance_share NUMERIC;
  treasury_share NUMERIC;
  operations_share NUMERIC;
  node_rate NUMERIC;
  buyback_rate NUMERIC;
  insurance_rate NUMERIC;
  treasury_rate NUMERIC;
  operations_rate NUMERIC;
BEGIN
  -- Sum today's revenue events
  SELECT COALESCE(SUM(amount), 0) INTO today_revenue
  FROM revenue_events
  WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day';

  IF today_revenue <= 0 THEN
    RETURN jsonb_build_object('revenue', 0, 'distributed', false);
  END IF;

  -- Get distribution rates from config
  SELECT COALESCE(value::NUMERIC, 0.50) INTO node_rate FROM system_config WHERE key = 'REVENUE_NODE_POOL_SHARE';
  SELECT COALESCE(value::NUMERIC, 0.20) INTO buyback_rate FROM system_config WHERE key = 'REVENUE_BUYBACK_SHARE';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO insurance_rate FROM system_config WHERE key = 'REVENUE_INSURANCE_SHARE';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO treasury_rate FROM system_config WHERE key = 'REVENUE_TREASURY_SHARE';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO operations_rate FROM system_config WHERE key = 'REVENUE_OPERATIONS_SHARE';

  node_share := today_revenue * node_rate;
  buyback_share := today_revenue * buyback_rate;
  insurance_share := today_revenue * insurance_rate;
  treasury_share := today_revenue * treasury_rate;
  operations_share := today_revenue * operations_rate;

  -- Credit pools
  UPDATE revenue_pools SET balance = balance + node_share, updated_at = NOW() WHERE pool_name = 'NODE_POOL';
  UPDATE revenue_pools SET balance = balance + buyback_share, updated_at = NOW() WHERE pool_name = 'BUYBACK_POOL';
  UPDATE revenue_pools SET balance = balance + insurance_share, updated_at = NOW() WHERE pool_name = 'INSURANCE_POOL';
  UPDATE revenue_pools SET balance = balance + treasury_share, updated_at = NOW() WHERE pool_name = 'TREASURY_POOL';
  UPDATE revenue_pools SET balance = balance + operations_share, updated_at = NOW() WHERE pool_name = 'OPERATIONS';

  RETURN jsonb_build_object(
    'revenue', ROUND(today_revenue, 6)::TEXT,
    'distributed', true,
    'nodePool', ROUND(node_share, 6)::TEXT,
    'buybackPool', ROUND(buyback_share, 6)::TEXT,
    'insurancePool', ROUND(insurance_share, 6)::TEXT,
    'treasuryPool', ROUND(treasury_share, 6)::TEXT,
    'operations', ROUND(operations_share, 6)::TEXT
  );
END;
$$;

-- settle_node_pool_dividend: distribute NODE_POOL to active node holders by weight
CREATE OR REPLACE FUNCTION settle_node_pool_dividend()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  pool_balance NUMERIC;
  total_weight NUMERIC := 0;
  node RECORD;
  node_weight NUMERIC;
  dividend NUMERIC;
  user_keep_rate NUMERIC;
  team_pool_rate NUMERIC;
  user_amount NUMERIC;
  team_amount NUMERIC;
  max_multiplier NUMERIC;
  mini_multiplier NUMERIC;
  total_distributed NUMERIC := 0;
  nodes_processed INT := 0;
BEGIN
  -- Get pool balance
  SELECT balance INTO pool_balance FROM revenue_pools WHERE pool_name = 'NODE_POOL';
  IF pool_balance IS NULL OR pool_balance <= 0 THEN
    RETURN jsonb_build_object('poolBalance', 0, 'distributed', false);
  END IF;

  -- Get config
  SELECT COALESCE(value::NUMERIC, 1.5) INTO max_multiplier FROM system_config WHERE key = 'NODE_MAX_WEIGHT_MULTIPLIER';
  SELECT COALESCE(value::NUMERIC, 1.0) INTO mini_multiplier FROM system_config WHERE key = 'NODE_MINI_WEIGHT_MULTIPLIER';
  SELECT COALESCE(value::NUMERIC, 0.90) INTO user_keep_rate FROM system_config WHERE key = 'NODE_DIVIDEND_USER_KEEP';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO team_pool_rate FROM system_config WHERE key = 'NODE_DIVIDEND_TEAM_POOL';

  -- Calculate total weight
  SELECT COALESCE(SUM(
    CASE WHEN node_type = 'MAX' THEN price * max_multiplier
    ELSE price * mini_multiplier END
  ), 0) INTO total_weight
  FROM node_memberships
  WHERE status = 'ACTIVE' AND (end_date IS NULL OR end_date > NOW());

  IF total_weight <= 0 THEN
    RETURN jsonb_build_object('poolBalance', pool_balance::TEXT, 'distributed', false, 'reason', 'no_active_nodes');
  END IF;

  -- Distribute to each node holder
  FOR node IN
    SELECT nm.*
    FROM node_memberships nm
    WHERE nm.status = 'ACTIVE' AND (nm.end_date IS NULL OR nm.end_date > NOW())
  LOOP
    IF node.node_type = 'MAX' THEN
      node_weight := node.price * max_multiplier;
    ELSE
      node_weight := node.price * mini_multiplier;
    END IF;

    dividend := pool_balance * (node_weight / total_weight);
    user_amount := dividend * user_keep_rate;
    team_amount := dividend * team_pool_rate;

    -- User keeps 90%
    INSERT INTO node_rewards (user_id, reward_type, amount, details)
    VALUES (node.user_id, 'POOL_DIVIDEND', user_amount,
      jsonb_build_object('node_type', node.node_type, 'weight', node_weight, 'total_weight', total_weight,
        'pool_balance', pool_balance, 'gross_dividend', dividend));

    total_distributed := total_distributed + dividend;
    nodes_processed := nodes_processed + 1;
  END LOOP;

  -- Deduct from pool
  UPDATE revenue_pools SET balance = balance - total_distributed, updated_at = NOW() WHERE pool_name = 'NODE_POOL';

  RETURN jsonb_build_object(
    'poolBalance', ROUND(pool_balance, 6)::TEXT,
    'distributed', true,
    'totalDistributed', ROUND(total_distributed, 6)::TEXT,
    'nodesProcessed', nodes_processed
  );
END;
$$;

-- settle_team_commission: differential commission up referral chain
CREATE OR REPLACE FUNCTION settle_team_commission(base_amount NUMERIC, source_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  ranks_json JSONB;
  max_depth INT;
  direct_rate NUMERIC;
  current_user_id UUID;
  upline_id UUID;
  current_depth INT := 0;
  prev_rate NUMERIC := 0;
  upline_rank TEXT;
  upline_commission NUMERIC;
  diff_rate NUMERIC;
  commission NUMERIC;
  total_commission NUMERIC := 0;
  commissions_paid INT := 0;
BEGIN
  -- Get config
  SELECT value::JSONB INTO ranks_json FROM system_config WHERE key = 'RANKS';
  SELECT COALESCE(value::INT, 15) INTO max_depth FROM system_config WHERE key = 'TEAM_MAX_DEPTH';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO direct_rate FROM system_config WHERE key = 'DIRECT_REFERRAL_RATE';

  current_user_id := source_user_id;

  -- Walk up referral chain
  LOOP
    current_depth := current_depth + 1;
    IF current_depth > max_depth THEN EXIT; END IF;

    -- Get upline
    SELECT referrer_id INTO upline_id FROM profiles WHERE id = current_user_id;
    IF upline_id IS NULL THEN EXIT; END IF;

    -- Get upline rank and commission rate
    SELECT rank INTO upline_rank FROM profiles WHERE id = upline_id;

    -- Look up commission rate from ranks config
    SELECT COALESCE((elem->>'commission')::NUMERIC, 0)
    INTO upline_commission
    FROM jsonb_array_elements(ranks_json) AS elem
    WHERE elem->>'level' = upline_rank;

    IF upline_commission IS NULL THEN upline_commission := 0; END IF;

    -- Direct referral bonus (first level only)
    IF current_depth = 1 AND direct_rate > 0 THEN
      commission := base_amount * direct_rate;
      IF commission > 0 THEN
        INSERT INTO node_rewards (user_id, reward_type, amount, details)
        VALUES (upline_id, 'TEAM_COMMISSION', commission,
          jsonb_build_object('type', 'direct_referral', 'source_user', source_user_id, 'depth', current_depth));
        total_commission := total_commission + commission;
        commissions_paid := commissions_paid + 1;
      END IF;
    END IF;

    -- Differential commission
    diff_rate := GREATEST(upline_commission - prev_rate, 0);
    IF diff_rate > 0 THEN
      commission := base_amount * diff_rate;
      INSERT INTO node_rewards (user_id, reward_type, amount, details)
      VALUES (upline_id, 'TEAM_COMMISSION', commission,
        jsonb_build_object('type', 'differential', 'source_user', source_user_id,
          'depth', current_depth, 'rate', diff_rate, 'upline_rate', upline_commission, 'prev_rate', prev_rate));
      total_commission := total_commission + commission;
      commissions_paid := commissions_paid + 1;
    END IF;

    -- Track highest rate seen so far for differential calculation
    IF upline_commission > prev_rate THEN
      prev_rate := upline_commission;
    END IF;

    current_user_id := upline_id;
  END LOOP;

  RETURN jsonb_build_object('totalCommission', ROUND(total_commission, 6)::TEXT, 'commissionsPaid', commissions_paid);
END;
$$;

-- settle_vault_daily: daily yield settlement for vault positions
-- Reads MA_TOKEN_PRICE from system_config to convert USDC yields into MA token amounts.
-- TODO: When LP pool is live, replace MA_TOKEN_PRICE with Uniswap V3 TWAP or Chainlink oracle feed.
CREATE OR REPLACE FUNCTION settle_vault_daily()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  pos RECORD;
  platform_fee_rate NUMERIC;
  ar_token_price NUMERIC;
  gross_profit NUMERIC;
  platform_fee NUMERIC;
  user_profit NUMERIC;
  user_ar_amount NUMERIC;
  total_user_profit NUMERIC := 0;
  total_platform_fees NUMERIC := 0;
  positions_processed INT := 0;
BEGIN
  -- Get platform fee rate from config
  SELECT COALESCE(value::NUMERIC, 0.10) INTO platform_fee_rate FROM system_config WHERE key = 'VAULT_PLATFORM_FEE';

  -- Get MA token price (default 0.1 USD if LP pool not yet live)
  SELECT COALESCE(value::NUMERIC, 0.10) INTO ar_token_price FROM system_config WHERE key = 'MA_TOKEN_PRICE';

  FOR pos IN
    SELECT vp.*, p.id AS profile_id
    FROM vault_positions vp
    JOIN profiles p ON p.id = vp.user_id
    WHERE vp.status = 'ACTIVE'
      AND (vp.end_date IS NULL OR vp.end_date > NOW())
  LOOP
    gross_profit := pos.principal * pos.daily_rate;
    platform_fee := gross_profit * platform_fee_rate;
    user_profit := gross_profit - platform_fee;
    user_ar_amount := user_profit / ar_token_price;

    -- Record user yield with MA price snapshot
    INSERT INTO vault_rewards (user_id, position_id, reward_type, amount, ar_price, ar_amount)
    VALUES (pos.user_id, pos.id, 'DAILY_YIELD', user_profit, ar_token_price, user_ar_amount);

    -- Record platform fee as revenue event
    INSERT INTO revenue_events (source, amount)
    VALUES ('vault_mgmt_fee', platform_fee);

    -- Also record fee in vault_rewards for tracking
    INSERT INTO vault_rewards (user_id, position_id, reward_type, amount, ar_price, ar_amount)
    VALUES (pos.user_id, pos.id, 'PLATFORM_FEE', platform_fee, ar_token_price, platform_fee / ar_token_price);

    total_user_profit := total_user_profit + user_profit;
    total_platform_fees := total_platform_fees + platform_fee;
    positions_processed := positions_processed + 1;

    -- Apply team commission on platform fee
    PERFORM settle_team_commission(platform_fee, pos.user_id);
  END LOOP;

  RETURN jsonb_build_object(
    'positionsProcessed', positions_processed,
    'totalUserProfit', ROUND(total_user_profit, 6)::TEXT,
    'totalPlatformFees', ROUND(total_platform_fees, 6)::TEXT,
    'arPrice', ar_token_price::TEXT
  );
END;
$$;

-- ─────────────────────────────────────────────
-- E) Add tx_hash column to transactions if not exists
-- ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'tx_hash'
  ) THEN
    ALTER TABLE transactions ADD COLUMN tx_hash TEXT;
  END IF;
END;
$$;

-- Add start_date and end_date columns to node_memberships if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'node_memberships' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE node_memberships ADD COLUMN start_date TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'node_memberships' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE node_memberships ADD COLUMN end_date TIMESTAMPTZ;
  END IF;
END;
$$;
