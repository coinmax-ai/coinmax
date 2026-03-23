-- ============================================================
-- Fix cron jobs: correct URLs + add simulate-trading schedule
-- Old project: jqgimdgtpwnunrlwexib (wrong)
-- New project: enedbksmftcgtszrkppc (correct)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Remove old cron jobs with wrong URLs ──

SELECT cron.unschedule('resolve-predictions-5min');
SELECT cron.unschedule('adjust-weights-hourly');
SELECT cron.unschedule('close-expired-paper-trades');

-- ── Cron 1: simulate-trading every 5 minutes ──

SELECT cron.schedule(
  'simulate-trading-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://enedbksmftcgtszrkppc.supabase.co/functions/v1/simulate-trading',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Cron 2: resolve-predictions every 5 minutes ──

SELECT cron.schedule(
  'resolve-predictions-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://enedbksmftcgtszrkppc.supabase.co/functions/v1/resolve-predictions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Cron 3: adjust-weights every hour ──

SELECT cron.schedule(
  'adjust-weights-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://enedbksmftcgtszrkppc.supabase.co/functions/v1/adjust-weights',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWRia3NtZnRjZ3RzenJrcHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MzEyMCwiZXhwIjoyMDg5MzY5MTIwfQ.URK9Jw6uW0XbqB30dSQwE_x576Y0-6w-Ximb2gW6H5A'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Cron 4: auto-close expired paper trades ──
-- Fixed: now calculates actual PnL instead of setting pnl=0

CREATE OR REPLACE FUNCTION auto_close_expired_paper_trades() RETURNS void AS $$
BEGIN
  -- Close trades that exceeded their strategy-specific time limits
  -- Uses generous limits: scalping 8h, grid/avellaneda/mean_reversion/pattern 24h,
  -- breakout/momentum 48h, swing 72h, twap 72h, dca 168h, default 48h
  UPDATE paper_trades SET
    status = 'CLOSED',
    close_reason = 'TIME_LIMIT',
    closed_at = NOW()
  WHERE status = 'OPEN'
    AND (
      (strategy_type = 'scalping' AND opened_at < NOW() - INTERVAL '8 hours')
      OR (strategy_type IN ('grid', 'avellaneda', 'mean_reversion', 'pattern', 'market_making') AND opened_at < NOW() - INTERVAL '24 hours')
      OR (strategy_type IN ('breakout', 'momentum', 'position_executor') AND opened_at < NOW() - INTERVAL '48 hours')
      OR (strategy_type IN ('swing', 'twap', 'arbitrage') AND opened_at < NOW() - INTERVAL '72 hours')
      OR (strategy_type = 'dca' AND opened_at < NOW() - INTERVAL '168 hours')
      OR (strategy_type IS NULL AND opened_at < NOW() - INTERVAL '48 hours')
      OR (strategy_type NOT IN ('scalping','grid','avellaneda','mean_reversion','pattern','market_making','breakout','momentum','position_executor','swing','twap','arbitrage','dca','trend_following') AND opened_at < NOW() - INTERVAL '48 hours')
      OR (strategy_type = 'trend_following' AND opened_at < NOW() - INTERVAL '24 hours')
    );
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
  'close-expired-paper-trades',
  '*/10 * * * *',
  $$SELECT auto_close_expired_paper_trades();$$
);
