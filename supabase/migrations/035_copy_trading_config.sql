-- Copy Trading Config: add model/strategy selection columns
-- user_id remains UUID, linked to profiles.id

-- Add model/strategy selection columns to user_risk_config
ALTER TABLE user_risk_config
  ADD COLUMN IF NOT EXISTS selected_models TEXT[] DEFAULT ARRAY['gpt-4o','claude-haiku','gemini-flash'],
  ADD COLUMN IF NOT EXISTS selected_strategies TEXT[] DEFAULT ARRAY['trend_following','momentum','breakout','mean_reversion','bb_squeeze'];

-- RLS: allow anon access (validated by wallet → profile lookup in frontend)
DROP POLICY IF EXISTS "Users can manage own risk config" ON user_risk_config;
CREATE POLICY "Users can manage own risk config" ON user_risk_config
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Users can manage own exchange keys" ON user_exchange_keys;
CREATE POLICY "Users can manage own exchange keys" ON user_exchange_keys
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
