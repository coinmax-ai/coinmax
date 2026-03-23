-- ============================================================
-- Strategy Learning System — Phase 1
-- 3 new tables + seed 14 strategies + RPC + indexes
-- ============================================================

-- Ensure pgvector is available (already created in 018)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. strategy_configs — Strategy rule configs (JSONB evaluable) ──

CREATE TABLE strategy_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  -- Entry rules: OR-of-AND condition groups
  entry_rules JSONB NOT NULL DEFAULT '{"groups": []}',
  -- Exit parameters: SL/TP/timeLimit/trailing formulas
  exit_params JSONB NOT NULL DEFAULT '{}',
  -- Position parameters: leverage/side_mode/sizing
  position_params JSONB NOT NULL DEFAULT '{}',
  -- AI-learned optimal parameters (updated by strategy-learn cron)
  learned_params JSONB NOT NULL DEFAULT '{}',
  -- Hard boundaries to prevent overfitting
  param_bounds JSONB NOT NULL DEFAULT '{}',
  -- Control
  enabled BOOLEAN NOT NULL DEFAULT true,
  asset_filter TEXT[] DEFAULT NULL, -- NULL = all assets
  -- Versioning
  learning_version INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strategy_configs_name ON strategy_configs(name);
CREATE INDEX idx_strategy_configs_enabled ON strategy_configs(enabled) WHERE enabled = true;

-- ── 2. strategy_embeddings — Market snapshot + strategy result (vector search) ──

CREATE TABLE strategy_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL REFERENCES strategy_configs(name),
  asset TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '5m',
  -- 16 normalized market indicators at trade open
  market_state JSONB NOT NULL,
  -- Random projection embedding (deterministic, no API call)
  embedding vector(1536),
  -- Trade result (filled on close)
  trade_pnl_pct NUMERIC,
  trade_won BOOLEAN,
  trade_id UUID, -- reference to paper_trades
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strat_embed_strategy ON strategy_embeddings(strategy_name, asset);
CREATE INDEX idx_strat_embed_created ON strategy_embeddings(created_at DESC);
CREATE INDEX idx_strat_embed_trade ON strategy_embeddings(trade_id) WHERE trade_id IS NOT NULL;

-- HNSW index for fast vector similarity search
CREATE INDEX idx_strat_embed_vector ON strategy_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 3. strategy_performance — Rolling performance metrics ──

CREATE TABLE strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL REFERENCES strategy_configs(name),
  asset TEXT NOT NULL,
  -- 7-day rolling
  win_rate_7d NUMERIC DEFAULT 0,
  avg_pnl_7d NUMERIC DEFAULT 0,
  trades_7d INT DEFAULT 0,
  sharpe_7d NUMERIC DEFAULT 0,
  -- 30-day rolling
  win_rate_30d NUMERIC DEFAULT 0,
  avg_pnl_30d NUMERIC DEFAULT 0,
  trades_30d INT DEFAULT 0,
  -- Composite score (0-100)
  composite_score NUMERIC DEFAULT 50,
  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(strategy_name, asset)
);

CREATE INDEX idx_strat_perf_score ON strategy_performance(composite_score DESC);

-- ── RPC: match_strategy_for_market — vector similarity search ──

CREATE OR REPLACE FUNCTION match_strategy_for_market(
  query_embedding vector(1536),
  match_count INT DEFAULT 20,
  filter_asset TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  strategy_name TEXT,
  asset TEXT,
  market_state JSONB,
  trade_pnl_pct NUMERIC,
  trade_won BOOLEAN,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.strategy_name,
    se.asset,
    se.market_state,
    se.trade_pnl_pct,
    se.trade_won,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM strategy_embeddings se
  WHERE se.trade_pnl_pct IS NOT NULL  -- only closed trades
    AND (filter_asset IS NULL OR se.asset = filter_asset)
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── RPC: upsert_strategy_performance — called after trade close ──

CREATE OR REPLACE FUNCTION upsert_strategy_performance(
  p_strategy_name TEXT,
  p_asset TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_win_rate_7d NUMERIC;
  v_avg_pnl_7d NUMERIC;
  v_trades_7d INT;
  v_sharpe_7d NUMERIC;
  v_win_rate_30d NUMERIC;
  v_avg_pnl_30d NUMERIC;
  v_trades_30d INT;
  v_composite NUMERIC;
  v_pnl_stddev_7d NUMERIC;
BEGIN
  -- 7-day stats
  SELECT
    COUNT(*) FILTER (WHERE trade_won = true)::NUMERIC / NULLIF(COUNT(*), 0),
    AVG(trade_pnl_pct),
    COUNT(*),
    STDDEV(trade_pnl_pct)
  INTO v_win_rate_7d, v_avg_pnl_7d, v_trades_7d, v_pnl_stddev_7d
  FROM strategy_embeddings
  WHERE strategy_name = p_strategy_name
    AND asset = p_asset
    AND trade_pnl_pct IS NOT NULL
    AND created_at > NOW() - INTERVAL '7 days';

  -- Sharpe approximation (annualized from 7d)
  v_sharpe_7d := CASE
    WHEN v_pnl_stddev_7d IS NOT NULL AND v_pnl_stddev_7d > 0
    THEN (COALESCE(v_avg_pnl_7d, 0) / v_pnl_stddev_7d) * SQRT(52)
    ELSE 0
  END;

  -- 30-day stats
  SELECT
    COUNT(*) FILTER (WHERE trade_won = true)::NUMERIC / NULLIF(COUNT(*), 0),
    AVG(trade_pnl_pct),
    COUNT(*)
  INTO v_win_rate_30d, v_avg_pnl_30d, v_trades_30d
  FROM strategy_embeddings
  WHERE strategy_name = p_strategy_name
    AND asset = p_asset
    AND trade_pnl_pct IS NOT NULL
    AND created_at > NOW() - INTERVAL '30 days';

  -- Composite score: 40% win_rate_7d + 30% normalized_pnl + 30% sharpe
  v_composite := LEAST(100, GREATEST(0,
    COALESCE(v_win_rate_7d, 0.5) * 40 +
    LEAST(30, GREATEST(0, (COALESCE(v_avg_pnl_7d, 0) + 2) * 7.5)) +
    LEAST(30, GREATEST(0, (COALESCE(v_sharpe_7d, 0) + 1) * 10))
  ));

  INSERT INTO strategy_performance (
    strategy_name, asset,
    win_rate_7d, avg_pnl_7d, trades_7d, sharpe_7d,
    win_rate_30d, avg_pnl_30d, trades_30d,
    composite_score, updated_at
  ) VALUES (
    p_strategy_name, p_asset,
    COALESCE(v_win_rate_7d, 0), COALESCE(v_avg_pnl_7d, 0), COALESCE(v_trades_7d, 0), COALESCE(v_sharpe_7d, 0),
    COALESCE(v_win_rate_30d, 0), COALESCE(v_avg_pnl_30d, 0), COALESCE(v_trades_30d, 0),
    v_composite, NOW()
  )
  ON CONFLICT (strategy_name, asset) DO UPDATE SET
    win_rate_7d = EXCLUDED.win_rate_7d,
    avg_pnl_7d = EXCLUDED.avg_pnl_7d,
    trades_7d = EXCLUDED.trades_7d,
    sharpe_7d = EXCLUDED.sharpe_7d,
    win_rate_30d = EXCLUDED.win_rate_30d,
    avg_pnl_30d = EXCLUDED.avg_pnl_30d,
    trades_30d = EXCLUDED.trades_30d,
    composite_score = EXCLUDED.composite_score,
    updated_at = NOW();
END;
$$;

-- ── RLS Policies ──

ALTER TABLE strategy_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_strategy_configs" ON strategy_configs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "anon_read_strategy_configs" ON strategy_configs FOR SELECT USING (true);

ALTER TABLE strategy_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_strategy_embeddings" ON strategy_embeddings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "anon_read_strategy_embeddings" ON strategy_embeddings FOR SELECT USING (true);

ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_strategy_performance" ON strategy_performance FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "anon_read_strategy_performance" ON strategy_performance FOR SELECT USING (true);

-- ── Seed 14 strategies ──

INSERT INTO strategy_configs (name, display_name, description, entry_rules, exit_params, position_params, param_bounds) VALUES

-- 1. Trend Following
('trend_following', '趋势跟踪', 'EMA crossover + MACD confirmation + momentum filter',
'{
  "groups": [
    {
      "conditions": [
        {"field": "ema9", "op": "gt", "value": {"ref": "ema21"}},
        {"field": "macd.histogram", "op": "gt", "value": 0},
        {"field": "mom", "op": "gt", "value": "$min_momentum"}
      ],
      "side": "LONG",
      "confidence_formula": "min(90, 55 + adx * 0.4 + abs(mom) * 5)"
    },
    {
      "conditions": [
        {"field": "ema9", "op": "lt", "value": {"ref": "ema21"}},
        {"field": "macd.histogram", "op": "lt", "value": 0},
        {"field": "mom", "op": "lt", "value": "-$min_momentum"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(90, 55 + adx * 0.4 + abs(mom) * 5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.015, vol * $sl_mult)", "tp_formula": "max(0.03, vol * $tp_mult)", "time_limit_hours": 12, "trailing": true}'::jsonb,
'{"leverage_formula": "confidence > 75 ? 3 : 2", "side_mode": "both"}'::jsonb,
'{"min_momentum": {"default": 0.02, "min": 0.005, "max": 0.1}, "sl_mult": {"default": 0.02, "min": 0.01, "max": 0.05}, "tp_mult": {"default": 0.04, "min": 0.02, "max": 0.1}}'::jsonb
),

-- 2. Mean Reversion
('mean_reversion', '均值回归', 'RSI oversold/overbought + BB proximity',
'{
  "groups": [
    {
      "conditions": [
        {"field": "rsi", "op": "lt", "value": "$rsi_oversold"},
        {"field": "bb.pctB", "op": "lt", "value": "$bb_low"}
      ],
      "side": "LONG",
      "confidence_formula": "min(88, 56 + ($rsi_oversold - rsi) * 1.2 + (1 - bb.pctB) * 8)"
    },
    {
      "conditions": [
        {"field": "rsi", "op": "gt", "value": "$rsi_overbought"},
        {"field": "bb.pctB", "op": "gt", "value": "$bb_high"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(88, 56 + (rsi - $rsi_overbought) * 1.2 + bb.pctB * 8)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.015, vol * $sl_mult)", "tp_formula": "max(0.04, vol * $tp_mult)", "time_limit_hours": 6}'::jsonb,
'{"leverage_formula": "2", "side_mode": "both"}'::jsonb,
'{"rsi_oversold": {"default": 38, "min": 25, "max": 45}, "rsi_overbought": {"default": 62, "min": 55, "max": 75}, "bb_low": {"default": 0.3, "min": 0.1, "max": 0.4}, "bb_high": {"default": 0.7, "min": 0.6, "max": 0.9}, "sl_mult": {"default": 0.02, "min": 0.01, "max": 0.05}, "tp_mult": {"default": 0.05, "min": 0.02, "max": 0.1}}'::jsonb
),

-- 3. Breakout
('breakout', '突破', 'Price near BB bands + momentum burst',
'{
  "groups": [
    {
      "conditions": [
        {"field": "bb.pctB", "op": "gt", "value": "$bb_upper_thresh"},
        {"field": "mom", "op": "gt", "value": "$min_momentum"}
      ],
      "side": "LONG",
      "confidence_formula": "min(85, 55 + volRatio * 4 + adx * 0.25 + abs(mom) * 5)"
    },
    {
      "conditions": [
        {"field": "bb.pctB", "op": "lt", "value": "$bb_lower_thresh"},
        {"field": "mom", "op": "lt", "value": "-$min_momentum"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(85, 55 + volRatio * 4 + adx * 0.25 + abs(mom) * 5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.01, vol * $sl_mult)", "tp_formula": "max(0.025, vol * $tp_mult)", "time_limit_hours": 8}'::jsonb,
'{"leverage_formula": "min(4, round(confidence / 25))", "side_mode": "both"}'::jsonb,
'{"bb_upper_thresh": {"default": 0.85, "min": 0.75, "max": 0.95}, "bb_lower_thresh": {"default": 0.15, "min": 0.05, "max": 0.25}, "min_momentum": {"default": 0.1, "min": 0.03, "max": 0.3}, "sl_mult": {"default": 0.012, "min": 0.008, "max": 0.03}, "tp_mult": {"default": 0.035, "min": 0.02, "max": 0.08}}'::jsonb
),

-- 4. Scalping
('scalping', '短线', 'Short-term RSI zones + MACD direction',
'{
  "groups": [
    {
      "conditions": [
        {"field": "rsi", "op": "gt", "value": 30},
        {"field": "rsi", "op": "lt", "value": "$rsi_upper"},
        {"field": "macd.histogram", "op": "gt", "value": 0}
      ],
      "side": "LONG",
      "confidence_formula": "min(78, 52 + ($rsi_upper - rsi) * 1.0 + abs(mom) * 8)"
    },
    {
      "conditions": [
        {"field": "rsi", "op": "gt", "value": "$rsi_lower"},
        {"field": "rsi", "op": "lt", "value": 70},
        {"field": "macd.histogram", "op": "lt", "value": 0}
      ],
      "side": "SHORT",
      "confidence_formula": "min(78, 52 + (rsi - $rsi_lower) * 1.0 + abs(mom) * 8)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.008, vol * $sl_mult)", "tp_formula": "max(0.02, vol * $tp_mult)", "time_limit_hours": 2}'::jsonb,
'{"leverage_formula": "min(5, round(confidence / 20))", "side_mode": "both"}'::jsonb,
'{"rsi_upper": {"default": 48, "min": 42, "max": 55}, "rsi_lower": {"default": 52, "min": 45, "max": 58}, "sl_mult": {"default": 0.01, "min": 0.005, "max": 0.025}, "tp_mult": {"default": 0.03, "min": 0.015, "max": 0.06}}'::jsonb
),

-- 5. Momentum
('momentum', '动量', 'Directional move with all indicators aligned',
'{
  "groups": [
    {
      "conditions": [
        {"field": "mom", "op": "gt", "value": "$min_momentum"},
        {"field": "rsi", "op": "gt", "value": 50},
        {"field": "rsi", "op": "lt", "value": 80},
        {"field": "macd.histogram", "op": "gt", "value": 0},
        {"field": "ema9", "op": "gt", "value": {"ref": "ema21"}}
      ],
      "side": "LONG",
      "confidence_formula": "min(92, 60 + adx * 0.4 + volRatio * 3 + abs(mom) * 5)"
    },
    {
      "conditions": [
        {"field": "mom", "op": "lt", "value": "-$min_momentum"},
        {"field": "rsi", "op": "lt", "value": 50},
        {"field": "rsi", "op": "gt", "value": 20},
        {"field": "macd.histogram", "op": "lt", "value": 0},
        {"field": "ema9", "op": "lt", "value": {"ref": "ema21"}}
      ],
      "side": "SHORT",
      "confidence_formula": "min(92, 60 + adx * 0.4 + volRatio * 3 + abs(mom) * 5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.012, vol * $sl_mult)", "tp_formula": "max(0.025, vol * $tp_mult)", "time_limit_hours": 8}'::jsonb,
'{"leverage_formula": "min(4, round(confidence / 25))", "side_mode": "both"}'::jsonb,
'{"min_momentum": {"default": 0.15, "min": 0.05, "max": 0.4}, "sl_mult": {"default": 0.015, "min": 0.008, "max": 0.04}, "tp_mult": {"default": 0.04, "min": 0.02, "max": 0.1}}'::jsonb
),

-- 6. Swing
('swing', '波段', 'Multi-timeframe EMA alignment + BB mid retest',
'{
  "groups": [
    {
      "conditions": [
        {"field": "htf.ema9", "op": "gt", "value": {"ref": "htf.ema21"}},
        {"field": "bb.pctB", "op": "gt", "value": 0.25},
        {"field": "bb.pctB", "op": "lt", "value": 0.6},
        {"field": "rsi", "op": "gt", "value": 38},
        {"field": "rsi", "op": "lt", "value": 58}
      ],
      "side": "LONG",
      "confidence_formula": "min(85, 55 + htf.adx * 0.3 + abs(htf.mom) * 3)",
      "requires_htf": true
    },
    {
      "conditions": [
        {"field": "htf.ema9", "op": "lt", "value": {"ref": "htf.ema21"}},
        {"field": "bb.pctB", "op": "gt", "value": 0.4},
        {"field": "bb.pctB", "op": "lt", "value": 0.75},
        {"field": "rsi", "op": "gt", "value": 42},
        {"field": "rsi", "op": "lt", "value": 62}
      ],
      "side": "SHORT",
      "confidence_formula": "min(85, 55 + htf.adx * 0.3 + abs(htf.mom) * 3)",
      "requires_htf": true
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.02, vol * $sl_mult)", "tp_formula": "max(0.04, vol * $tp_mult)", "time_limit_hours": 24}'::jsonb,
'{"leverage_formula": "2", "side_mode": "both"}'::jsonb,
'{"sl_mult": {"default": 0.025, "min": 0.015, "max": 0.06}, "tp_mult": {"default": 0.05, "min": 0.03, "max": 0.12}}'::jsonb
),

-- 7. Grid
('grid', '网格', 'Low volatility range-bound — buy low sell high within BB',
'{
  "groups": [
    {
      "conditions": [
        {"field": "vol", "op": "lte", "value": "$max_vol"},
        {"field": "adx", "op": "lte", "value": "$max_adx"},
        {"field": "bb.width", "op": "lt", "value": "$max_bb_width"},
        {"field": "bb.pctB", "op": "gt", "value": 0.35},
        {"field": "bb.pctB", "op": "lt", "value": 0.5}
      ],
      "side": "LONG",
      "confidence_formula": "min(80, 55 + ($max_bb_width - bb.width) * 8 + ($max_adx - adx) * 0.5)"
    },
    {
      "conditions": [
        {"field": "vol", "op": "lte", "value": "$max_vol"},
        {"field": "adx", "op": "lte", "value": "$max_adx"},
        {"field": "bb.width", "op": "lt", "value": "$max_bb_width"},
        {"field": "bb.pctB", "op": "gte", "value": 0.5},
        {"field": "bb.pctB", "op": "lt", "value": 0.65}
      ],
      "side": "SHORT",
      "confidence_formula": "min(80, 55 + ($max_bb_width - bb.width) * 8 + ($max_adx - adx) * 0.5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.025, bb.width / 100 * 1.2)", "tp_formula": "max(0.015, bb.width / 100 * 0.6)", "time_limit_hours": 4}'::jsonb,
'{"leverage_formula": "1", "side_mode": "both"}'::jsonb,
'{"max_vol": {"default": 1.2, "min": 0.5, "max": 2.0}, "max_adx": {"default": 30, "min": 20, "max": 40}, "max_bb_width": {"default": 3, "min": 1.5, "max": 5}}'::jsonb
),

-- 8. DCA
('dca', 'DCA定投', 'Dollar-cost average on dips/pumps',
'{
  "groups": [
    {
      "conditions": [
        {"field": "rsi", "op": "lt", "value": "$rsi_oversold"},
        {"field": "mom", "op": "lt", "value": "-$min_momentum"},
        {"field": "bb.pctB", "op": "lt", "value": "$bb_low"}
      ],
      "side": "LONG",
      "confidence_formula": "min(82, 55 + ($rsi_oversold - rsi) * 1.0 + abs(mom) * 5)"
    },
    {
      "conditions": [
        {"field": "rsi", "op": "gt", "value": "$rsi_overbought"},
        {"field": "mom", "op": "gt", "value": "$min_momentum"},
        {"field": "bb.pctB", "op": "gt", "value": "$bb_high"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(82, 55 + (rsi - $rsi_overbought) * 1.0 + abs(mom) * 5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.04, vol * $sl_mult)", "tp_formula": "max(0.02, vol * $tp_mult)", "time_limit_hours": 48}'::jsonb,
'{"leverage_formula": "1", "side_mode": "both"}'::jsonb,
'{"rsi_oversold": {"default": 35, "min": 20, "max": 42}, "rsi_overbought": {"default": 65, "min": 58, "max": 80}, "min_momentum": {"default": 0.1, "min": 0.03, "max": 0.3}, "bb_low": {"default": 0.25, "min": 0.1, "max": 0.35}, "bb_high": {"default": 0.75, "min": 0.65, "max": 0.9}, "sl_mult": {"default": 0.04, "min": 0.02, "max": 0.08}, "tp_mult": {"default": 0.025, "min": 0.01, "max": 0.06}}'::jsonb
),

-- 9. Pattern
('pattern', 'K线形态', 'Candlestick pattern recognition with indicator confirmation',
'{
  "groups": [
    {
      "conditions": [
        {"field": "pattern.direction", "op": "eq", "value": "BULLISH"},
        {"field": "pattern.strength", "op": "gte", "value": 1},
        {"field": "$or", "op": "any", "value": [
          {"field": "rsi", "op": "lt", "value": 55},
          {"field": "macd.histogram", "op": "gt", "value": 0}
        ]}
      ],
      "side": "LONG",
      "confidence_formula": "min(85, 50 + pattern.strength * 8 + (55 - rsi) * 0.3)"
    },
    {
      "conditions": [
        {"field": "pattern.direction", "op": "eq", "value": "BEARISH"},
        {"field": "pattern.strength", "op": "gte", "value": 1},
        {"field": "$or", "op": "any", "value": [
          {"field": "rsi", "op": "gt", "value": 45},
          {"field": "macd.histogram", "op": "lt", "value": 0}
        ]}
      ],
      "side": "SHORT",
      "confidence_formula": "min(85, 50 + pattern.strength * 8 + (rsi - 45) * 0.3)"
    }
  ],
  "requires_patterns": true
}'::jsonb,
'{"sl_formula": "max(0.015, vol * $sl_mult)", "tp_formula": "max(0.02, vol * $tp_mult)", "time_limit_hours": 6}'::jsonb,
'{"leverage_formula": "pattern.strength >= 3 ? 3 : 2", "side_mode": "both"}'::jsonb,
'{"sl_mult": {"default": 0.018, "min": 0.01, "max": 0.04}, "tp_mult": {"default": 0.03, "min": 0.015, "max": 0.07}}'::jsonb
),

-- 10. Avellaneda
('avellaneda', 'Avellaneda做市', 'Volatility-adaptive spread strategy (Avellaneda-Stoikov)',
'{
  "groups": [
    {
      "conditions": [
        {"field": "$computed.deviation", "op": "lt", "value": "-$computed.optimalSpread"},
        {"field": "rsi", "op": "lt", "value": 50},
        {"field": "$computed.abs_deviation", "op": "gt", "value": "$computed.min_deviation"}
      ],
      "side": "LONG",
      "confidence_formula": "min(80, 55 + abs($computed.deviation) * 5 + (50 - rsi) * 0.3)",
      "computed": {
        "fairValue": "(ema9 + ema21) / 2",
        "deviation": "(price - fairValue) / fairValue * 100",
        "optimalSpread": "vol * 0.8",
        "min_deviation": "optimalSpread * 0.5"
      }
    },
    {
      "conditions": [
        {"field": "$computed.deviation", "op": "gt", "value": "$computed.optimalSpread"},
        {"field": "rsi", "op": "gt", "value": 50},
        {"field": "$computed.abs_deviation", "op": "gt", "value": "$computed.min_deviation"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(80, 55 + abs($computed.deviation) * 5 + (rsi - 50) * 0.3)",
      "computed": {
        "fairValue": "(ema9 + ema21) / 2",
        "deviation": "(price - fairValue) / fairValue * 100",
        "optimalSpread": "vol * 0.8",
        "min_deviation": "optimalSpread * 0.5"
      }
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.015, $computed.optimalSpread / 100 * 1.5)", "tp_formula": "max(0.01, $computed.optimalSpread / 100)", "time_limit_hours": 4}'::jsonb,
'{"leverage_formula": "2", "side_mode": "both"}'::jsonb,
'{}'::jsonb
),

-- 11. Position Executor
('position_executor', '仓位执行器', 'Triple barrier with trailing stop — multi-indicator confirmation',
'{
  "groups": [
    {
      "conditions": [
        {"field": "$score.bull", "op": "gte", "value": "$min_score"}
      ],
      "side": "LONG",
      "confidence_formula": "min(90, 55 + $score.bull * 6 + adx * 0.3)",
      "scoring": {
        "bull": ["ema9 > ema21", "macd.histogram > 0", "rsi < 60", "mom > 0.1", "adx > 20"]
      }
    },
    {
      "conditions": [
        {"field": "$score.bear", "op": "gte", "value": "$min_score"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(90, 55 + $score.bear * 6 + adx * 0.3)",
      "scoring": {
        "bear": ["ema9 < ema21", "macd.histogram < 0", "rsi > 40", "mom < -0.1", "adx > 20"]
      }
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.02, vol * $sl_mult)", "tp_formula": "max(0.06, vol * $tp_mult)", "time_limit_hours": 36, "trailing": true}'::jsonb,
'{"leverage_formula": "min(5, round(confidence / 22))", "side_mode": "both"}'::jsonb,
'{"min_score": {"default": 4, "min": 3, "max": 5}, "sl_mult": {"default": 0.025, "min": 0.015, "max": 0.05}, "tp_mult": {"default": 0.08, "min": 0.04, "max": 0.15}}'::jsonb
),

-- 12. TWAP
('twap', 'TWAP累积', 'Time-weighted accumulation during favorable conditions',
'{
  "groups": [
    {
      "conditions": [
        {"field": "vol", "op": "lt", "value": "$max_vol"},
        {"field": "rsi", "op": "lt", "value": "$rsi_oversold"},
        {"field": "bb.pctB", "op": "lt", "value": "$bb_low"},
        {"field": "adx", "op": "lt", "value": "$max_adx"}
      ],
      "side": "LONG",
      "confidence_formula": "min(82, 52 + ($rsi_oversold - rsi) * 1.0 + (1 - bb.pctB) * 5)"
    },
    {
      "conditions": [
        {"field": "vol", "op": "lt", "value": "$max_vol"},
        {"field": "rsi", "op": "gt", "value": "$rsi_overbought"},
        {"field": "bb.pctB", "op": "gt", "value": "$bb_high"},
        {"field": "adx", "op": "lt", "value": "$max_adx"}
      ],
      "side": "SHORT",
      "confidence_formula": "min(82, 52 + (rsi - $rsi_overbought) * 1.0 + bb.pctB * 5)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.035, vol * $sl_mult)", "tp_formula": "max(0.05, vol * $tp_mult)", "time_limit_hours": 72}'::jsonb,
'{"leverage_formula": "1", "side_mode": "both"}'::jsonb,
'{"max_vol": {"default": 1.5, "min": 0.8, "max": 2.5}, "rsi_oversold": {"default": 33, "min": 20, "max": 40}, "rsi_overbought": {"default": 67, "min": 60, "max": 80}, "bb_low": {"default": 0.2, "min": 0.05, "max": 0.3}, "bb_high": {"default": 0.8, "min": 0.7, "max": 0.95}, "max_adx": {"default": 35, "min": 25, "max": 45}, "sl_mult": {"default": 0.04, "min": 0.02, "max": 0.08}, "tp_mult": {"default": 0.06, "min": 0.03, "max": 0.12}}'::jsonb
),

-- 13. Market Making
('market_making', '做市', 'Dual-side spread capture in low-directional markets',
'{
  "groups": [
    {
      "conditions": [
        {"field": "adx", "op": "lte", "value": "$max_adx"},
        {"field": "vol", "op": "gte", "value": "$min_vol"},
        {"field": "bb.pctB", "op": "lt", "value": 0.45},
        {"field": "rsi", "op": "lt", "value": 52}
      ],
      "side": "LONG",
      "confidence_formula": "min(78, 52 + ($max_adx - adx) * 0.8 + vol * 3)"
    },
    {
      "conditions": [
        {"field": "adx", "op": "lte", "value": "$max_adx"},
        {"field": "vol", "op": "gte", "value": "$min_vol"},
        {"field": "bb.pctB", "op": "gt", "value": 0.55},
        {"field": "rsi", "op": "gt", "value": 48}
      ],
      "side": "SHORT",
      "confidence_formula": "min(78, 52 + ($max_adx - adx) * 0.8 + vol * 3)"
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.015, $computed.spreadPct / 100 * 2)", "tp_formula": "max(0.01, $computed.spreadPct / 100)", "time_limit_hours": 12, "computed": {"spreadPct": "max(0.1, vol * 0.4)"}}'::jsonb,
'{"leverage_formula": "2", "side_mode": "both"}'::jsonb,
'{"max_adx": {"default": 25, "min": 15, "max": 35}, "min_vol": {"default": 0.3, "min": 0.1, "max": 0.8}}'::jsonb
),

-- 14. Arbitrage
('arbitrage', '时间框架套利', 'Cross-timeframe RSI/momentum divergence convergence',
'{
  "groups": [
    {
      "conditions": [
        {"field": "rsi", "op": "lt", "value": 40},
        {"field": "mom", "op": "gt", "value": 0},
        {"field": "htf.rsi", "op": "gt", "value": 45},
        {"field": "htf.mom", "op": "gt", "value": 0.05}
      ],
      "side": "LONG",
      "confidence_formula": "min(85, 55 + abs(rsi - htf.rsi) * 0.5 + abs(htf.mom) * 8)",
      "requires_htf": true
    },
    {
      "conditions": [
        {"field": "rsi", "op": "gt", "value": 60},
        {"field": "mom", "op": "lt", "value": 0},
        {"field": "htf.rsi", "op": "lt", "value": 55},
        {"field": "htf.mom", "op": "lt", "value": -0.05}
      ],
      "side": "SHORT",
      "confidence_formula": "min(85, 55 + abs(rsi - htf.rsi) * 0.5 + abs(htf.mom) * 8)",
      "requires_htf": true
    }
  ]
}'::jsonb,
'{"sl_formula": "max(0.012, vol * $sl_mult)", "tp_formula": "max(0.025, vol * $tp_mult)", "time_limit_hours": 16}'::jsonb,
'{"leverage_formula": "3", "side_mode": "both"}'::jsonb,
'{"sl_mult": {"default": 0.015, "min": 0.008, "max": 0.04}, "tp_mult": {"default": 0.035, "min": 0.02, "max": 0.08}}'::jsonb
)

ON CONFLICT (name) DO NOTHING;

-- ── Initialize strategy_performance for all strategy+asset combos ──

INSERT INTO strategy_performance (strategy_name, asset)
SELECT sc.name, a.asset
FROM strategy_configs sc
CROSS JOIN (VALUES ('BTC'), ('ETH'), ('SOL'), ('BNB'), ('DOGE'), ('XRP')) AS a(asset)
ON CONFLICT (strategy_name, asset) DO NOTHING;
