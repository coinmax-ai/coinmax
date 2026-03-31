-- Trigger: vault_rewards DAILY_YIELD → earnings_releases (待释放)
CREATE OR REPLACE FUNCTION auto_create_release_for_vault_yield()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.reward_type = 'DAILY_YIELD' AND NEW.ar_amount > 0 THEN
    -- Check if this position's bonus yield is locked
    -- If locked, don't create release entry (stays as locked yield)
    IF EXISTS (
      SELECT 1 FROM vault_positions
      WHERE id = NEW.position_id
        AND (plan_type = 'BONUS_5D' AND bonus_yield_locked = true)
    ) THEN
      RETURN NEW; -- Skip: bonus yield locked
    END IF;

    INSERT INTO earnings_releases (
      user_id,
      source_type,
      gross_amount,
      net_amount,
      burn_amount,
      release_days,
      status,
      released_at
    ) VALUES (
      NEW.user_id,
      'VAULT_YIELD',
      NEW.ar_amount,
      NEW.ar_amount,
      0,
      0,
      'PENDING',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vault_yield_to_release ON vault_rewards;
CREATE TRIGGER trg_vault_yield_to_release
  AFTER INSERT ON vault_rewards
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_release_for_vault_yield();

-- Also run node settlement
SELECT settle_node_fixed_yield() as node_result;
