-- Fund distribution records (FundManager → recipients)
CREATE TABLE IF NOT EXISTS fund_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL,           -- 'USDT' or 'USDC'
  amount NUMERIC NOT NULL,       -- distributed amount
  tx_hash TEXT,                  -- on-chain tx hash
  fund_manager TEXT NOT NULL,    -- FundManager contract address
  recipient TEXT NOT NULL,       -- recipient wallet address
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fund_distributions_created ON fund_distributions(created_at DESC);
