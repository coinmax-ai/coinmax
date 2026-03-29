const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

(async () => {
  await c.connect();

  // 1. Add activated_at column (already added above, safe to re-run)
  await c.query(`ALTER TABLE node_memberships ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ DEFAULT NULL`);
  console.log('✅ activated_at column');

  // 2. Update check_node_activation
  await c.query(fs.readFileSync('/dev/stdin', 'utf8'));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
