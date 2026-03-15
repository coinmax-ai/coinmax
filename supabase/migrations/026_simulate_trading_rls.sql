-- ============================================================
-- Fix: RLS for paper_trades + trade_signals (anon access)
--       + cron job for simulate-trading
-- ============================================================

-- paper_trades: allow anon SELECT (frontend reads positions)
-- and INSERT/UPDATE (simulation writes)
CREATE POLICY "anon_all_paper_trades" ON paper_trades
  FOR ALL USING (true) WITH CHECK (true);

-- trade_signals: allow anon INSERT/UPDATE (simulation writes signals)
CREATE POLICY "anon_write_signals" ON trade_signals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_update_signals" ON trade_signals
  FOR UPDATE USING (true) WITH CHECK (true);

-- ── Cron: simulate-trading every 5 minutes ──────────────────

SELECT cron.schedule(
  'simulate-trading',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/simulate-trading',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
