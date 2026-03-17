-- Simulation config table (single row, key-value style)
CREATE TABLE IF NOT EXISTS simulation_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  position_size_usd NUMERIC NOT NULL DEFAULT 1000,
  max_positions INT NOT NULL DEFAULT 15,
  max_leverage INT NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 10,
  cooldown_min INT NOT NULL DEFAULT 5,
  enabled_strategies TEXT[] NOT NULL DEFAULT ARRAY['trend_following','mean_reversion','breakout','scalping','momentum','swing'],
  enabled_assets TEXT[] NOT NULL DEFAULT ARRAY['BTC','ETH','SOL','BNB','DOGE','XRP'],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row
INSERT INTO simulation_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE simulation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_sim_config" ON simulation_config FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "anon_read_sim_config" ON simulation_config FOR SELECT USING (true);
CREATE POLICY "anon_update_sim_config" ON simulation_config FOR UPDATE USING (true);
