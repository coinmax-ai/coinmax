CREATE OR REPLACE FUNCTION settle_team_commission(base_amount NUMERIC, source_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  ranks_json JSONB; max_depth INT; direct_rate NUMERIC; same_rank_rate NUMERIC; override_rate NUMERIC;
  direct_referrer_id UUID; referrer_has_vault BOOLEAN;
  current_user_id UUID; upline_id UUID; current_depth INT := 0;
  prev_rate NUMERIC := 0; prev_rank TEXT := NULL;
  upline_rank TEXT; upline_commission NUMERIC; upline_has_vault BOOLEAN;
  diff_rate NUMERIC; commission NUMERIC; total_commission NUMERIC := 0;
  commissions_paid INT := 0; same_rank_paid BOOLEAN := FALSE; override_paid BOOLEAN := FALSE;
BEGIN
  SELECT value::JSONB INTO ranks_json FROM system_config WHERE key = 'RANKS';
  SELECT COALESCE(value::INT, 999) INTO max_depth FROM system_config WHERE key = 'TEAM_MAX_DEPTH';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO direct_rate FROM system_config WHERE key = 'DIRECT_REFERRAL_RATE';
  SELECT COALESCE(value::NUMERIC, 0.10) INTO same_rank_rate FROM system_config WHERE key = 'SAME_RANK_RATE';
  SELECT COALESCE(value::NUMERIC, 0.05) INTO override_rate FROM system_config WHERE key = 'OVERRIDE_RATE';

  -- 1. Direct referral → broker_rewards (NOT node_rewards)
  SELECT referrer_id INTO direct_referrer_id FROM profiles WHERE id = source_user_id;
  IF direct_referrer_id IS NOT NULL AND direct_rate > 0 THEN
    SELECT EXISTS(SELECT 1 FROM vault_positions WHERE user_id = direct_referrer_id AND status = 'ACTIVE' AND plan_type != 'BONUS_5D') INTO referrer_has_vault;
    IF referrer_has_vault THEN
      commission := base_amount * direct_rate;
      IF commission > 0 THEN
        INSERT INTO broker_rewards (user_id, reward_type, amount, details)
        VALUES (direct_referrer_id, 'DIRECT_REFERRAL', commission,
          jsonb_build_object('source_user', source_user_id::TEXT, 'depth', 1, 'rate', direct_rate));
        total_commission := total_commission + commission; commissions_paid := commissions_paid + 1;
      END IF;
    END IF;
  END IF;

  -- 2-4. Placement tree → broker_rewards
  current_user_id := source_user_id;
  LOOP
    current_depth := current_depth + 1;
    IF current_depth > max_depth THEN EXIT; END IF;
    SELECT placement_id INTO upline_id FROM profiles WHERE id = current_user_id;
    IF upline_id IS NULL THEN EXIT; END IF;
    SELECT rank INTO upline_rank FROM profiles WHERE id = upline_id;
    SELECT EXISTS(SELECT 1 FROM vault_positions WHERE user_id = upline_id AND status = 'ACTIVE' AND plan_type != 'BONUS_5D') INTO upline_has_vault;
    IF NOT upline_has_vault THEN current_user_id := upline_id; CONTINUE; END IF;

    SELECT COALESCE((elem->>'commission')::NUMERIC, 0) INTO upline_commission
    FROM jsonb_array_elements(ranks_json) AS elem WHERE elem->>'level' = upline_rank;
    IF upline_commission IS NULL THEN upline_commission := 0; END IF;

    -- Differential
    diff_rate := GREATEST(upline_commission - prev_rate, 0);
    IF diff_rate > 0 THEN
      commission := base_amount * diff_rate;
      INSERT INTO broker_rewards (user_id, reward_type, amount, details)
      VALUES (upline_id, 'DIFFERENTIAL', commission,
        jsonb_build_object('source_user', source_user_id::TEXT, 'depth', current_depth, 'rate', diff_rate));
      total_commission := total_commission + commission; commissions_paid := commissions_paid + 1;
    END IF;

    -- Same-rank (once)
    IF NOT same_rank_paid AND upline_rank IS NOT NULL AND prev_rank IS NOT NULL AND upline_rank = prev_rank AND same_rank_rate > 0 THEN
      commission := base_amount * upline_commission * same_rank_rate;
      IF commission > 0 THEN
        INSERT INTO broker_rewards (user_id, reward_type, amount, details)
        VALUES (upline_id, 'SAME_RANK', commission,
          jsonb_build_object('source_user', source_user_id::TEXT, 'depth', current_depth, 'rate', same_rank_rate, 'matched_rank', upline_rank));
        total_commission := total_commission + commission; commissions_paid := commissions_paid + 1; same_rank_paid := TRUE;
      END IF;
    END IF;

    -- Override (once)
    IF NOT override_paid AND upline_rank IS NOT NULL AND prev_rank IS NOT NULL AND upline_commission < prev_rate AND override_rate > 0 THEN
      commission := base_amount * override_rate;
      IF commission > 0 THEN
        INSERT INTO broker_rewards (user_id, reward_type, amount, details)
        VALUES (upline_id, 'OVERRIDE', commission,
          jsonb_build_object('source_user', source_user_id::TEXT, 'depth', current_depth, 'rate', override_rate));
        total_commission := total_commission + commission; commissions_paid := commissions_paid + 1; override_paid := TRUE;
      END IF;
    END IF;

    prev_rate := GREATEST(prev_rate, upline_commission);
    prev_rank := upline_rank;
    current_user_id := upline_id;
  END LOOP;

  RETURN jsonb_build_object('totalCommission', ROUND(total_commission, 6)::TEXT, 'commissionsPaid', commissions_paid);
END;
$fn$;
