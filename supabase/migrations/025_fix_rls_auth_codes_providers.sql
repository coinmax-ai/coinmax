-- ============================================================
-- Fix: RLS policies for admin access to strategy_providers
--       + node_auth_codes table creation & RLS
-- ============================================================

-- ── 1. Fix strategy_providers RLS ────────────────────────────
-- Admin panel uses anon key, so we need permissive policies.
-- The admin panel handles its own auth via admin_users table.

CREATE POLICY "anon_read_all_providers" ON strategy_providers
  FOR SELECT USING (true);

CREATE POLICY "anon_update_providers" ON strategy_providers
  FOR UPDATE USING (true) WITH CHECK (true);

-- ── 2. Fix trade_signals RLS for admin ───────────────────────
-- Admin needs to see all signals (not just authenticated users)

CREATE POLICY "anon_read_all_signals" ON trade_signals
  FOR SELECT USING (true);

-- ── 3. Create node_auth_codes table (if not exists) ──────────

CREATE TABLE IF NOT EXISTS node_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'MAX',
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'USED', 'INACTIVE')),
  max_uses INT DEFAULT 1,
  used_count INT DEFAULT 0,
  used_by TEXT,
  used_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON node_auth_codes(code);
CREATE INDEX IF NOT EXISTS idx_auth_codes_status ON node_auth_codes(status);

-- Enable RLS with permissive policies (admin manages own auth)
ALTER TABLE node_auth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_codes_full_access" ON node_auth_codes
  FOR ALL USING (true) WITH CHECK (true);
