-- MA Flash Swap records
CREATE TABLE IF NOT EXISTS ma_swap_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('sell', 'buy')),
  ma_amount NUMERIC NOT NULL,
  usd_amount NUMERIC NOT NULL,
  output_token TEXT DEFAULT 'USDT',
  ma_price NUMERIC NOT NULL,
  fee_usd NUMERIC DEFAULT 0,
  ma_balance_before NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_wallet ON ma_swap_records(wallet_address);
CREATE INDEX IF NOT EXISTS idx_swap_created ON ma_swap_records(created_at DESC);

ALTER TABLE ma_swap_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read/write swap records" ON ma_swap_records FOR ALL USING (TRUE) WITH CHECK (TRUE);
