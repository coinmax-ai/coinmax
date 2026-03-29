/**
 * Rank Upgrade Test Plan — Step by step execution
 * Accounts A → F with vault deposits and rank promotion verification
 */
const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

const ADDRS = {
  A:  '0x6A38C45d599AB4B93935B321dD3Ba7462d7C00Fe',
  B1: '0x5CD60f8aD8b7Fa14534FE98cC7e2f3196b3e8Af1',
  B2: '0xcf540060795D30760C03ecdE32281a8DD641BDd8',
  C1: '0xB1f53AE569A4a663acA2BE188a378141b1BdA219',
  C2: '0x0Fde18DE928945C7a14DF5a000C668D448494703',
  C3: '0x11803966d12c10280F71C7510E558341E896B7ba',
  C4: '0x6765A10032A633B27F105664a9585B466A9FB789',
  D1: '0xEbe871722b2eF7821f4158D224023bF4242D4438',
  D2: '0x7002fB58DCC081ed5c85EA69901CE414671fA44D',
  E1: '0x9Ec3f1186C5ebc1e32c004C1E7D8539a931c2eFA',
  E2: '0x4DD432D519db823Cf47202B51307433f4D8441F6',
  F1: '0xCe4835273A3a703aE8c0fC1eE5Cc0335635f9085',
  F2: '0x709735409947A5383B7262CA4eB61cc194d159da',
  M1: '0x883092E8D6655cfA118B7765511CC4aF9C8D7D79',
  M2: '0xD8F565194C97F93169312f812D9eC9B7A10f88E6',
};

async function getId(addr) {
  const r = await c.query(`SELECT id FROM profiles WHERE wallet_address = '${addr}'`);
  return r.rows[0]?.id;
}

async function deposit(name, amount) {
  const addr = ADDRS[name];
  const uid = await getId(addr);
  // Clear old positions for clean test
  await c.query(`DELETE FROM vault_positions WHERE user_id = '${uid}' AND plan_type != 'BONUS_5D'`);
  await c.query(`INSERT INTO vault_positions (user_id, plan_type, principal, daily_rate, end_date, status)
    VALUES ('${uid}', '90_DAYS', ${amount}, 0.009, NOW() + INTERVAL '90 days', 'ACTIVE')`);
  // Fix placement_id if null
  await c.query(`UPDATE profiles SET placement_id = referrer_id WHERE id = '${uid}' AND placement_id IS NULL`);
  return `${name} deposited ${amount}U`;
}

async function setRankAndPerf(name, rank, teamPerf) {
  const addr = ADDRS[name];
  const uid = await getId(addr);
  await c.query(`UPDATE profiles SET rank = '${rank}' WHERE id = '${uid}'`);
  // Ensure holding meets rank requirement
  const holdingReqs = { V1: 100, V2: 300, V3: 500, V4: 1000, V5: 3000, V6: 5000, V7: 10000 };
  const minHold = holdingReqs[rank] || 100;
  const cur = await c.query(`SELECT COALESCE(SUM(principal),0) as h FROM vault_positions WHERE user_id='${uid}' AND status='ACTIVE' AND plan_type!='BONUS_5D'`);
  if (Number(cur.rows[0].h) < minHold) {
    await c.query(`DELETE FROM vault_positions WHERE user_id = '${uid}' AND plan_type != 'BONUS_5D'`);
    await c.query(`INSERT INTO vault_positions (user_id, plan_type, principal, daily_rate, end_date, status)
      VALUES ('${uid}', '180_DAYS', ${minHold}, 0.012, NOW() + INTERVAL '180 days', 'ACTIVE')`);
  }
  // Add filler deposits under this account to reach target team performance
  if (teamPerf > 0) {
    // Calculate current team perf
    const tpRes = await c.query(`
      WITH RECURSIVE dl AS (
        SELECT id FROM profiles WHERE referrer_id = '${uid}'
        UNION ALL
        SELECT p.id FROM profiles p JOIN dl d ON p.referrer_id = d.id
      )
      SELECT COALESCE(SUM(vp.principal),0) as tp FROM vault_positions vp JOIN dl d ON vp.user_id = d.id WHERE vp.status='ACTIVE' AND vp.plan_type!='BONUS_5D'
    `);
    const currentTP = Number(tpRes.rows[0].tp);
    const needed = teamPerf - currentTP;
    if (needed > 0) {
      // Find or create a filler account under this user
      const fillerAddr = addr.slice(0, -4) + 'FF' + rank.slice(1);
      let fillerId;
      const existing = await c.query(`SELECT id FROM profiles WHERE wallet_address = '${fillerAddr}'`);
      if (existing.rows[0]) {
        fillerId = existing.rows[0].id;
        await c.query(`DELETE FROM vault_positions WHERE user_id = '${fillerId}' AND plan_type != 'BONUS_5D'`);
      } else {
        const ins = await c.query(`INSERT INTO profiles (wallet_address, referrer_id, placement_id, ref_code)
          VALUES ('${fillerAddr}', '${uid}', '${uid}', 'FILL_${name}_${rank}') RETURNING id`);
        fillerId = ins.rows[0].id;
      }
      await c.query(`INSERT INTO vault_positions (user_id, plan_type, principal, daily_rate, end_date, status)
        VALUES ('${fillerId}', '180_DAYS', ${needed}, 0.012, NOW() + INTERVAL '180 days', 'ACTIVE')`);
    }
  }
  return `${name} set rank=${rank}, teamPerf target=${teamPerf}`;
}

async function promote(name) {
  const addr = ADDRS[name];
  const r = await c.query(`SELECT check_rank_promotion('${addr}') as result`);
  return r.rows[0].result;
}

async function status(name) {
  const addr = ADDRS[name];
  const uid = await getId(addr);
  const p = await c.query(`SELECT rank FROM profiles WHERE id = '${uid}'`);
  const h = await c.query(`SELECT COALESCE(SUM(principal),0) as h FROM vault_positions WHERE user_id='${uid}' AND status='ACTIVE' AND plan_type!='BONUS_5D'`);
  const tp = await c.query(`
    WITH RECURSIVE dl AS (
      SELECT id FROM profiles WHERE referrer_id = '${uid}'
      UNION ALL
      SELECT p.id FROM profiles p JOIN dl d ON p.referrer_id = d.id
    )
    SELECT COALESCE(SUM(vp.principal),0) as tp FROM vault_positions vp JOIN dl d ON vp.user_id = d.id WHERE vp.status='ACTIVE' AND vp.plan_type!='BONUS_5D'
  `);
  const refs = await c.query(`
    SELECT COUNT(*) as cnt FROM profiles p
    WHERE p.referrer_id = '${uid}'
      AND EXISTS (SELECT 1 FROM vault_positions vp WHERE vp.user_id = p.id AND vp.status='ACTIVE' AND vp.plan_type!='BONUS_5D')
  `);
  const rankedRefs = await c.query(`
    SELECT wallet_address, rank FROM profiles WHERE referrer_id = '${uid}' AND rank IS NOT NULL
  `);
  return {
    name,
    rank: p.rows[0]?.rank || '-',
    holding: Number(h.rows[0].h),
    teamPerf: Number(tp.rows[0].tp),
    directRefs: Number(refs.rows[0].cnt),
    rankedRefs: rankedRefs.rows.map(r => `${r.wallet_address.slice(-8)}(${r.rank})`),
  };
}

(async () => {
  await c.connect();
  const log = [];
  const L = (s) => { log.push(s); console.log(s); };

  L('# 等级升级测试报告');
  L('');
  L('> 执行时间: ' + new Date().toISOString().slice(0, 19) + ' UTC');
  L('');
  L('## 树状结构');
  L('```');
  L('A (根)');
  L('├── B1 (左线)');
  L('│   ├── C1');
  L('│   │   └── D1');
  L('│   │       └── F1');
  L('│   ├── C2');
  L('│   │   └── D2');
  L('│   ├── M1');
  L('│   └── ...');
  L('└── B2 (右线)');
  L('    ├── C3');
  L('    │   └── E1');
  L('    │       └── F2');
  L('    ├── C4');
  L('    │   └── E2');
  L('    ├── M2');
  L('    └── ...');
  L('```');
  L('');

  // ═══════════════════════════════════════
  // Phase 1: Basic deposits (Steps 1-3)
  // ═══════════════════════════════════════
  L('## Phase 1: 基础入金 (Steps 1-3)');
  L('');

  L('### Step 1: A 入金 1000U');
  L(await deposit('A', 1000));
  let pr = await promote('A');
  let st = await status('A');
  L(`结果: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U, directRefs=${st.directRefs}`);
  L(`预期: 无等级 (有持仓但无团队) ${st.rank === '-' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  L('### Step 2: B1 入金 300U');
  L(await deposit('B1', 300));
  await promote('B1');
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, teamPerf=${st.teamPerf}U, directRefs=${st.directRefs}`);
  L(`预期: A仍无等级 (仅1个直推,需1个有存入+5000团队) ${st.rank === '-' ? '✅' : '❌'}`);
  L('');

  L('### Step 3: B2 入金 300U');
  L(await deposit('B2', 300));
  await promote('B2');
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, teamPerf=${st.teamPerf}U, directRefs=${st.directRefs}`);
  L(`预期: A仍无等级 (团队业绩600<5000) ${st.rank === '-' ? '✅' : '❌'}`);
  L('');

  // ═══════════════════════════════════════
  // Phase 2: C层入金 + D层大额 → V1/V2 (Steps 4-11)
  // ═══════════════════════════════════════
  L('## Phase 2: C/D层入金触发V1/V2 (Steps 4-11)');
  L('');

  L('### Step 4: C1 入金 100U (B1的直推)');
  L(await deposit('C1', 100));
  await promote('C1');
  L(`C1: ${JSON.stringify(await status('C1'))}`);
  L('');

  L('### Step 5: C2 入金 100U (B1的直推)');
  L(await deposit('C2', 100));
  await promote('C2');
  L(`C2: ${JSON.stringify(await status('C2'))}`);
  L('');

  L('### Step 6: C3 入金 100U (B2的直推)');
  L(await deposit('C3', 100));
  await promote('C3');
  L('');

  L('### Step 7: C4 入金 100U (B2的直推)');
  L(await deposit('C4', 100));
  await promote('C4');
  L('');

  L('### Step 8: D1 入金 10000U (C1的直推) → C1应升V1');
  L(await deposit('D1', 10000));
  await promote('D1');
  pr = await promote('C1');
  st = await status('C1');
  L(`C1: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U, directRefs=${st.directRefs}`);
  L(`预期: C1=V1 (holding≥100, 1直推有存入, 团队≥5000) ${st.rank === 'V1' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  L('### Step 9: D2 入金 10000U (C2的直推) → C2升V1, B1升V2');
  L(await deposit('D2', 10000));
  await promote('D2');
  await promote('C2');
  await promote('B1');
  const stC2 = await status('C2');
  const stB1 = await status('B1');
  L(`C2: rank=${stC2.rank}, holding=${stC2.holding}U, teamPerf=${stC2.teamPerf}U`);
  L(`预期: C2=V1 ${stC2.rank === 'V1' ? '✅' : '❌'}`);
  L(`B1: rank=${stB1.rank}, holding=${stB1.holding}U, teamPerf=${stB1.teamPerf}U, rankedRefs=[${stB1.rankedRefs}]`);
  L(`预期: B1=V2 (holding≥300, 2个V1+(C1,C2), 团队≥20000) ${stB1.rank === 'V2' ? '✅' : '❌ 实际=' + stB1.rank}`);
  L('');

  L('### Step 10: E1 入金 10000U (C3的直推) → C3升V1');
  L(await deposit('E1', 10000));
  await promote('E1');
  await promote('C3');
  const stC3 = await status('C3');
  L(`C3: rank=${stC3.rank}, teamPerf=${stC3.teamPerf}U`);
  L(`预期: C3=V1 ${stC3.rank === 'V1' ? '✅' : '❌'}`);
  L('');

  L('### Step 11: E2 入金 10000U (C4的直推) → C4升V1, B2升V2');
  L(await deposit('E2', 10000));
  await promote('E2');
  await promote('C4');
  await promote('B2');
  const stC4 = await status('C4');
  const stB2 = await status('B2');
  L(`C4: rank=${stC4.rank}`);
  L(`预期: C4=V1 ${stC4.rank === 'V1' ? '✅' : '❌'}`);
  L(`B2: rank=${stB2.rank}, holding=${stB2.holding}U, teamPerf=${stB2.teamPerf}U, rankedRefs=[${stB2.rankedRefs}]`);
  L(`预期: B2=V2 (holding≥300, 2个V1+(C3,C4), 团队≥20000) ${stB2.rank === 'V2' ? '✅' : '❌ 实际=' + stB2.rank}`);
  L('');

  // ═══════════════════════════════════════
  // Phase 3: F层入金 → A升V3 (Steps 12-13)
  // ═══════════════════════════════════════
  L('## Phase 3: F层入金 → A升V3 (Steps 12-13)');
  L('');

  L('### Step 12: F1 入金 5000U (D1的直推) → 补团队业绩');
  L(await deposit('F1', 5000));
  await promote('F1');
  await promote('D1');
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, teamPerf=${st.teamPerf}U, rankedRefs=[${st.rankedRefs}]`);
  L(`预期: A仍未达V3 (团队~46000<50000) ${st.rank !== 'V3' ? '✅' : '❌'}`);
  L('');

  L('### Step 13: F2 入金 5000U (E1的直推) → A升V3');
  L(await deposit('F2', 5000));
  await promote('F2');
  await promote('E1');
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U, rankedRefs=[${st.rankedRefs}]`);
  L(`预期: A=V3 (holding≥500, 2个V2+(B1,B2), 团队≥50000) ${st.rank === 'V3' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  // ═══════════════════════════════════════
  // Phase 4: Manual set M1/M2 (Steps 14-15)
  // ═══════════════════════════════════════
  L('## Phase 4: 手动设置等级测试 (Steps 14-15)');
  L('');

  L('### Step 14: M1 手动设置 rank=V1');
  await deposit('M1', 100);
  await setRankAndPerf('M1', 'V1', 5000);
  const stM1 = await status('M1');
  L(`M1: rank=${stM1.rank}, holding=${stM1.holding}U`);
  L(`预期: M1=V1 (手动设置) ${stM1.rank === 'V1' ? '✅' : '❌'}`);
  L('');

  L('### Step 15: M2 手动设置 rank=V2');
  await deposit('M2', 300);
  await setRankAndPerf('M2', 'V2', 20000);
  const stM2 = await status('M2');
  L(`M2: rank=${stM2.rank}, holding=${stM2.holding}U`);
  L(`预期: M2=V2 (手动设置) ${stM2.rank === 'V2' ? '✅' : '❌'}`);
  L('');

  // ═══════════════════════════════════════
  // Phase 5: A升V4→V7 (Steps 16-24)
  // ═══════════════════════════════════════
  L('## Phase 5: A逐步升V4→V7 (Steps 16-24)');
  L('');

  L('### Step 16: 复核A当前状态');
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U`);
  L(`预期: A=V3 ${st.rank === 'V3' ? '✅' : '❌'}`);
  L('');

  // V4: need 1000U personal, 2xV3, 100000 team
  L('### Steps 17-18: B1/B2 → V3, A → V4');
  await deposit('A', 1000); // ensure A has 1000U
  await setRankAndPerf('B1', 'V3', 100000);
  await setRankAndPerf('B2', 'V3', 100000);
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U, rankedRefs=[${st.rankedRefs}]`);
  L(`预期: A=V4 (holding≥1000, 2个V3, 团队≥100000) ${st.rank === 'V4' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  // V5: need 3000U personal, 2xV4, 500000 team
  L('### Steps 19-20: B1/B2 → V4, A → V5');
  await deposit('A', 3000);
  await setRankAndPerf('B1', 'V4', 500000);
  await setRankAndPerf('B2', 'V4', 500000);
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U`);
  L(`预期: A=V5 (holding≥3000, 2个V4, 团队≥500000) ${st.rank === 'V5' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  // V6: need 5000U personal, 2xV5, 1000000 team
  L('### Steps 21-22: B1/B2 → V5, A → V6');
  await deposit('A', 5000);
  await setRankAndPerf('B1', 'V5', 1000000);
  await setRankAndPerf('B2', 'V5', 1000000);
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U`);
  L(`预期: A=V6 (holding≥5000, 2个V5, 团队≥1000000) ${st.rank === 'V6' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  // V7: need 10000U personal, 2xV6, 3000000 team
  L('### Steps 23-24: B1/B2 → V6, A → V7');
  await deposit('A', 10000);
  await setRankAndPerf('B1', 'V6', 3000000);
  await setRankAndPerf('B2', 'V6', 3000000);
  pr = await promote('A');
  st = await status('A');
  L(`A: rank=${st.rank}, holding=${st.holding}U, teamPerf=${st.teamPerf}U`);
  L(`预期: A=V7 (holding≥10000, 2个V6, 团队≥3000000) ${st.rank === 'V7' ? '✅' : '❌ 实际=' + st.rank}`);
  L('');

  // ═══════════════════════════════════════
  // Final Summary
  // ═══════════════════════════════════════
  L('## 最终状态汇总');
  L('');
  L('| 账户 | 钱包地址 | 等级 | 持仓 | 团队业绩 | 直推数 |');
  L('|------|---------|------|------|---------|-------|');
  for (const [name, addr] of Object.entries(ADDRS)) {
    const s = await status(name);
    L(`| ${name} | \`${addr}\` | ${s.rank} | ${s.holding}U | ${s.teamPerf.toLocaleString()}U | ${s.directRefs} |`);
  }

  const md = log.join('\n') + '\n';
  fs.writeFileSync('/Users/macbookpro/WebstormProjects/coinmax-dev/reports/rank_test_report.md', md);
  console.log('\n═══ Report saved to reports/rank_test_report.md ═══');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
