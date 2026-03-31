CREATE OR REPLACE FUNCTION settle_vault_daily()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
DECLARE
  pos RECORD;
  ar_token_price NUMERIC;
  daily_yield NUMERIC;
  ma_amount NUMERIC;
  total_yield NUMERIC := 0;
  positions_processed INT := 0;
  already_settled BOOLEAN;
  today_start TIMESTAMP := date_trunc('day', NOW() AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore';
BEGIN
  SELECT COALESCE(value::NUMERIC, 0.60) INTO ar_token_price FROM system_config WHERE key = 'MA_TOKEN_PRICE';

  FOR pos IN
    SELECT vp.*, p.id AS profile_id
    FROM vault_positions vp
    JOIN profiles p ON p.id = vp.user_id
    WHERE vp.status = 'ACTIVE'
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM vault_rewards
      WHERE position_id = pos.id AND created_at >= today_start
    ) INTO already_settled;
    IF already_settled THEN CONTINUE; END IF;

    daily_yield := pos.principal * pos.daily_rate;
    ma_amount := daily_yield / ar_token_price;

    INSERT INTO vault_rewards (user_id, position_id, reward_type, amount, ar_price, ar_amount)
    VALUES (pos.user_id, pos.id, 'DAILY_YIELD', daily_yield, ar_token_price, ma_amount);

    total_yield := total_yield + daily_yield;
    positions_processed := positions_processed + 1;

    -- Team commission: skip bonus positions (bonus yield doesn't generate commission)
    IF pos.plan_type != 'BONUS_5D' THEN
      PERFORM settle_team_commission(ma_amount, pos.user_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'positionsProcessed', positions_processed,
    'totalYield', ROUND(total_yield, 6)::TEXT,
    'arPrice', ar_token_price::TEXT,
    'settledAt', NOW()::TEXT
  );
END;
$fn$;
