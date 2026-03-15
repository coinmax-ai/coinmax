-- Phase 5 & 6: Copy Trading + Learning Feedback Loop
-- Tables for trade results, backtesting, weight adjustment, user risk config, and exchange keys

-- ══════════════════════════════════════════════════════
-- Phase 5: User Copy Trading
-- ══════════════════════════════════════════════════════

-- User risk configuration
CREATE TABLE IF NOT EXISTS user_risk_config (
  user_id UUID PRIMARY KEY,
  max_position_size_usd NUMERIC DEFAULT 1000,
  max_concurrent_positions INT DEFAULT 3,
  max_daily_loss_usd NUMERIC DEFAULT 200,
  max_drawdown_pct NUMERIC DEFAULT 10,
  max_leverage INT DEFAULT 5,
  allowed_assets TEXT[] DEFAULT ARRAY['BTC','ETH','SOL','BNB'],
  copy_enabled BOOLEAN DEFAULT FALSE,
  execution_mode TEXT DEFAULT 'PAPER' CHECK (execution_mode IN ('PAPER','SIGNAL','SEMI_AUTO','FULL_AUTO')),
  trading_hours_enabled BOOLEAN DEFAULT FALSE,
  trading_hours_start INT DEFAULT 8,
  trading_hours_end INT DEFAULT 22,
  cooldown_minutes INT DEFAULT 1,
  min_signal_strength TEXT DEFAULT 'MEDIUM' CHECK (min_signal_strength IN ('STRONG','MEDIUM','WEAK')),
  kill_switch BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User exchange API keys (encrypted)
CREATE TABLE IF NOT EXISTS user_exchange_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance','bybit','okx','bitget','hyperliquid','dydx')),
  encrypted_data JSONB NOT NULL,
  masked_key TEXT NOT NULL,
  testnet BOOLEAN DEFAULT FALSE,
  label TEXT DEFAULT '',
  is_valid BOOLEAN DEFAULT TRUE,
  last_validated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, exchange)
);

-- Paper trades (simulated positions)
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY,
  signal_id UUID REFERENCES trade_signals(id),
  asset TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  entry_price NUMERIC NOT NULL,
  size NUMERIC NOT NULL,
  leverage INT DEFAULT 1,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  exit_price NUMERIC,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  close_reason TEXT CHECK (close_reason IN ('STOP_LOSS','TAKE_PROFIT','TIME_LIMIT','MANUAL','TRAILING_STOP','LIQUIDATION')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status);
CREATE INDEX IF NOT EXISTS idx_paper_trades_asset ON paper_trades(asset);

-- ══════════════════════════════════════════════════════
-- Phase 6: Learning Feedback Loop
-- ══════════════════════════════════════════════════════

-- Trade results (closed trades with full metadata)
CREATE TABLE IF NOT EXISTS trade_results (
  id UUID PRIMARY KEY,
  signal_id UUID REFERENCES trade_signals(id),
  asset TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  size NUMERIC,
  leverage INT DEFAULT 1,
  pnl_usd NUMERIC NOT NULL,
  pnl_pct NUMERIC NOT NULL,
  close_reason TEXT NOT NULL,
  duration_seconds INT,
  strategy_type TEXT,
  contributing_models TEXT[],
  is_win BOOLEAN NOT NULL,
  fees NUMERIC DEFAULT 0,
  exchange TEXT,
  entry_state JSONB,
  exit_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_results_asset ON trade_results(asset);
CREATE INDEX IF NOT EXISTS idx_trade_results_created ON trade_results(created_at);
CREATE INDEX IF NOT EXISTS idx_trade_results_strategy ON trade_results(strategy_type);

-- Add computed_weight column to ai_model_accuracy if not exists
DO $$ BEGIN
  ALTER TABLE ai_model_accuracy ADD COLUMN IF NOT EXISTS computed_weight NUMERIC DEFAULT 1.0;
  ALTER TABLE ai_model_accuracy ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet, create it
  CREATE TABLE ai_model_accuracy (
    model TEXT NOT NULL,
    asset TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT '30d',
    accuracy_pct NUMERIC DEFAULT 50,
    total_predictions INT DEFAULT 0,
    avg_confidence NUMERIC DEFAULT 0,
    computed_weight NUMERIC DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (model, asset, timeframe, period)
  );
END $$;

-- Weight adjustment audit log
CREATE TABLE IF NOT EXISTS weight_adjustment_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  models_adjusted INT,
  assets_covered TEXT[],
  total_predictions INT,
  overall_accuracy NUMERIC,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backtest reports
CREATE TABLE IF NOT EXISTS backtest_reports (
  id UUID PRIMARY KEY,
  config JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  total_trades INT,
  winning_trades INT,
  losing_trades INT,
  win_rate NUMERIC,
  total_pnl_usd NUMERIC,
  total_pnl_pct NUMERIC,
  avg_pnl_per_trade NUMERIC,
  best_trade NUMERIC,
  worst_trade NUMERIC,
  sharpe_ratio NUMERIC,
  max_drawdown_pct NUMERIC,
  max_drawdown_usd NUMERIC,
  profit_factor NUMERIC,
  calmar_ratio NUMERIC,
  avg_trade_duration INT,
  by_asset JSONB,
  by_strategy JSONB,
  by_close_reason JSONB,
  previous_report_id UUID,
  performance_change NUMERIC,
  alert TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_reports_completed ON backtest_reports(completed_at DESC);

-- Strategy tuning results
CREATE TABLE IF NOT EXISTS tuning_results (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  total_combinations INT,
  combinations_run INT,
  best_params JSONB,
  best_sharpe NUMERIC,
  best_pnl_pct NUMERIC,
  best_win_rate NUMERIC,
  top_results JSONB,
  current_params JSONB,
  improvement JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active configuration store (key-value for runtime params)
CREATE TABLE IF NOT EXISTS active_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════
-- RPC Functions
-- ══════════════════════════════════════════════════════

-- Atomic model accuracy update (called by trade-recorder)
CREATE OR REPLACE FUNCTION update_model_accuracy(
  p_model TEXT,
  p_asset TEXT,
  p_timeframe TEXT,
  p_correct BOOLEAN,
  p_pnl_pct NUMERIC
) RETURNS VOID AS $$
DECLARE
  v_period TEXT;
BEGIN
  FOREACH v_period IN ARRAY ARRAY['7d', '30d'] LOOP
    INSERT INTO ai_model_accuracy (model, asset, timeframe, period, accuracy_pct, total_predictions, updated_at)
    VALUES (p_model, p_asset, p_timeframe, v_period, CASE WHEN p_correct THEN 100 ELSE 0 END, 1, NOW())
    ON CONFLICT (model, asset, timeframe, period) DO UPDATE SET
      accuracy_pct = (ai_model_accuracy.accuracy_pct * ai_model_accuracy.total_predictions + CASE WHEN p_correct THEN 100 ELSE 0 END) / (ai_model_accuracy.total_predictions + 1),
      total_predictions = ai_model_accuracy.total_predictions + 1,
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════

ALTER TABLE user_risk_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exchange_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_results ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on user_risk_config" ON user_risk_config FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on user_exchange_keys" ON user_exchange_keys FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on paper_trades" ON paper_trades FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access on trade_results" ON trade_results FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Read-only access to backtest/tuning for authenticated users
ALTER TABLE backtest_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read backtest reports" ON backtest_reports FOR SELECT USING (TRUE);
CREATE POLICY "Service write backtest" ON backtest_reports FOR INSERT WITH CHECK (TRUE);

ALTER TABLE tuning_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read tuning results" ON tuning_results FOR SELECT USING (TRUE);
CREATE POLICY "Service write tuning" ON tuning_results FOR INSERT WITH CHECK (TRUE);
