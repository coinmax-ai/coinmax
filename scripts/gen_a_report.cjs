const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

const ROOT = '0x6A38C45d599AB4B93935B321dD3Ba7462d7C00Fe';

(async () => {
  await c.connect();

  const lines = [];
  const L = (s) => lines.push(s);

  // Get root id
  const rootRow = await c.query(`SELECT id FROM profiles WHERE wallet_address = '${ROOT}'`);
  const rootId = rootRow.rows[0].id;

  // Get MA price
  const mp = await c.query(`SELECT value FROM system_config WHERE key='MA_TOKEN_PRICE'`);
  const maPrice = Number(mp.rows[0].value);

  // Recursive team tree
  const tree = await c.query(`
    WITH RECURSIVE team AS (
      SELECT id, wallet_address, rank, referrer_id, 0 as depth
      FROM profiles WHERE wallet_address = '${ROOT}'
      UNION ALL
      SELECT p.id, p.wallet_address, p.rank, p.referrer_id, t.depth+1
      FROM profiles p JOIN team t ON p.referrer_id = t.id WHERE t.depth < 8
    )
    SELECT t.id, t.wallet_address, t.rank, t.depth,
      (SELECT wallet_address FROM profiles WHERE id = t.referrer_id) as referrer_addr,
      (SELECT COALESCE(SUM(principal),0) FROM vault_positions WHERE user_id = t.id AND status='ACTIVE' AND plan_type!='BONUS_5D') as holding
    FROM team t ORDER BY t.depth, holding DESC
  `);

  // Get yields for these users
  const userIds = tree.rows.map(r => `'${r.id}'`).join(',');
  const yields = await c.query(`
    SELECT vr.user_id, p.wallet_address, p.rank, SUM(vr.ar_amount) as ma_yield, SUM(vr.amount) as usd_yield
    FROM vault_rewards vr JOIN profiles p ON p.id = vr.user_id
    WHERE vr.reward_type='DAILY_YIELD' AND vr.created_at > NOW() - INTERVAL '30 minutes'
      AND vr.user_id IN (${userIds})
    GROUP BY vr.user_id, p.wallet_address, p.rank ORDER BY ma_yield DESC
  `);

  // Get commissions where recipient OR source is in this tree
  const commissions = await c.query(`
    SELECT nr.user_id, p.wallet_address as recipient_addr, p.rank as recipient_rank,
      nr.amount, nr.details,
      (SELECT wallet_address FROM profiles WHERE id = (nr.details->>'source_user')::uuid) as source_addr,
      (SELECT rank FROM profiles WHERE id = (nr.details->>'source_user')::uuid) as source_rank
    FROM node_rewards nr JOIN profiles p ON p.id = nr.user_id
    WHERE nr.reward_type = 'TEAM_COMMISSION' AND nr.created_at > NOW() - INTERVAL '30 minutes'
      AND (nr.user_id IN (${userIds}) OR (nr.details->>'source_user')::uuid IN (${userIds}))
    ORDER BY nr.amount DESC
  `);

  // ═══ Build Report ═══
  L('# 根账户 A 团队奖励详细报告');
  L('');
  L('> 根账户: `' + ROOT + '`');
  L('> 生成时间: ' + new Date().toISOString().slice(0, 19) + ' UTC');
  L('> MA 价格: $' + maPrice);
  L('');

  // Team tree
  L('---');
  L('');
  L('## 一、团队推荐树');
  L('');
  L('```');
  const nameMap = {};
  let nameIdx = 0;
  const nameLabels = ['A','B1','B2','C1','C2','C3','C4','D1','D2','E1','E2','F1','F2','M1','M2'];
  tree.rows.forEach(r => {
    const lbl = nameIdx < nameLabels.length ? nameLabels[nameIdx] : 'X' + nameIdx;
    nameMap[r.wallet_address] = lbl;
    nameIdx++;
    const indent = '  '.repeat(r.depth);
    const rank = r.rank ? `(${r.rank})` : '';
    const hold = Number(r.holding) > 0 ? ` ${r.holding}U` : '';
    L(`${indent}${lbl} ${r.wallet_address.slice(0,6)}...${r.wallet_address.slice(-4)} ${rank}${hold}`);
  });
  L('```');
  L('');

  // Yields
  L('---');
  L('');
  L('## 二、当日MA收益');
  L('');
  L('| 账户 | 钱包地址 | 等级 | 持仓(U) | USD收益 | MA收益 |');
  L('|------|---------|------|---------|--------|--------|');
  let totalYieldMA = 0;
  yields.rows.forEach(r => {
    const name = nameMap[r.wallet_address] || '?';
    const ma = Number(r.ma_yield);
    totalYieldMA += ma;
    L(`| ${name} | \`${r.wallet_address}\` | ${r.rank || '-'} | - | $${Number(r.usd_yield).toFixed(2)} | ${ma.toFixed(2)} MA |`);
  });
  L(`| **合计** | | | | | **${totalYieldMA.toFixed(2)} MA** |`);
  L('');

  // Commission detail by type
  L('---');
  L('');
  L('## 三、奖励明细');
  L('');

  const typeConfig = {
    direct_referral: { label: '直推奖励', desc: '10% x 直推下属MA收益' },
    differential: { label: '级差奖励', desc: 'rank差额% x 下属MA收益 (V1=5%, V2=10%, V3=15%, V4=20%, V5=25%, V6=30%, V7=50%)' },
    same_rank: { label: '同级奖励', desc: '同级佣金率 x 10% x 下属MA收益' },
    override: { label: '越级奖励', desc: '5% x 下属MA收益 (低等级在高等级上方时触发)' },
  };

  for (const [type, cfg] of Object.entries(typeConfig)) {
    const items = commissions.rows.filter(r => r.details && r.details.type === type);
    const total = items.reduce((s, i) => s + Number(i.amount), 0);

    L(`### ${cfg.label} — ${cfg.desc}`);
    L('');
    if (items.length === 0) {
      L('本轮无');
      L('');
      continue;
    }
    L(`> ${items.length}笔, 合计 ${total.toFixed(4)} MA`);
    L('');
    L('| 获得者 | 等级 | 来源 | 来源等级 | 金额(MA) | 层级 | 费率 | 计算说明 |');
    L('|-------|------|------|---------|---------|------|------|---------|');
    items.forEach(i => {
      const recName = nameMap[i.recipient_addr] || '?';
      const srcName = nameMap[i.source_addr] || '?';
      const rate = i.details.rate ? (i.details.rate * 100).toFixed(0) + '%' : '10%';
      const depth = i.details.depth || '-';

      // Calculate explanation
      let explain = '';
      if (type === 'direct_referral') {
        explain = `${srcName}的MA收益 x 10%`;
      } else if (type === 'differential') {
        const recRankPct = { V1: 5, V2: 10, V3: 15, V4: 20, V5: 25, V6: 30, V7: 50 };
        explain = `差额${rate}`;
      } else if (type === 'same_rank') {
        explain = `同级${i.details.matched_rank || ''}`;
      } else if (type === 'override') {
        explain = `低级在高级上方`;
      }

      L(`| ${recName} \`...${i.recipient_addr.slice(-4)}\` | ${i.recipient_rank || '-'} | ${srcName} \`...${i.source_addr ? i.source_addr.slice(-4) : '?'}\` | ${i.source_rank || '-'} | ${Number(i.amount).toFixed(4)} | ${depth} | ${rate} | ${explain} |`);
    });
    L('');
  }

  // Summary per person
  L('---');
  L('');
  L('## 四、各账户奖励汇总');
  L('');
  L('| 账户 | 钱包地址 | 等级 | 直推(MA) | 级差(MA) | 同级(MA) | 越级(MA) | 总计(MA) |');
  L('|------|---------|------|---------|---------|---------|---------|---------|');
  const pp = {};
  commissions.rows.forEach(r => {
    const addr = r.recipient_addr;
    if (!pp[addr]) pp[addr] = { rank: r.recipient_rank, d: 0, f: 0, s: 0, o: 0 };
    const t = r.details && r.details.type;
    if (t === 'direct_referral') pp[addr].d += Number(r.amount);
    if (t === 'differential') pp[addr].f += Number(r.amount);
    if (t === 'same_rank') pp[addr].s += Number(r.amount);
    if (t === 'override') pp[addr].o += Number(r.amount);
  });
  let grandTotal = 0;
  Object.entries(pp)
    .sort((a, b) => (b[1].d + b[1].f + b[1].s + b[1].o) - (a[1].d + a[1].f + a[1].s + a[1].o))
    .forEach(([addr, v]) => {
      const name = nameMap[addr] || '?';
      const tot = v.d + v.f + v.s + v.o;
      grandTotal += tot;
      L(`| ${name} | \`${addr}\` | ${v.rank || '-'} | ${v.d.toFixed(2)} | ${v.f.toFixed(2)} | ${v.s.toFixed(2)} | ${v.o.toFixed(2)} | **${tot.toFixed(2)}** |`);
    });
  L(`| **合计** | | | | | | | **${grandTotal.toFixed(2)} MA** |`);
  L('');

  // Root account A detail
  L('---');
  L('');
  L('## 五、根账户 A 奖励拆解');
  L('');
  const aComm = commissions.rows.filter(r => r.recipient_addr === ROOT);
  if (aComm.length === 0) {
    L('A 本轮无奖励');
  } else {
    let aTotal = 0;
    L('| 类型 | 来源 | 来源等级 | 金额(MA) | 层级 | 说明 |');
    L('|------|------|---------|---------|------|------|');
    aComm.sort((a, b) => Number(b.amount) - Number(a.amount)).forEach(i => {
      const srcName = nameMap[i.source_addr] || '?';
      const type = { direct_referral: '直推', differential: '级差', same_rank: '同级', override: '越级' }[i.details.type] || i.details.type;
      const rate = i.details.rate ? (i.details.rate * 100).toFixed(0) + '%' : '10%';
      aTotal += Number(i.amount);
      L(`| ${type} | ${srcName} \`${i.source_addr}\` | ${i.source_rank || '-'} | ${Number(i.amount).toFixed(4)} | ${i.details.depth || '-'} | ${rate} |`);
    });
    L(`| **合计** | | | **${aTotal.toFixed(4)} MA** | | |`);
  }

  const md = lines.join('\n') + '\n';
  fs.writeFileSync('/Users/macbookpro/WebstormProjects/coinmax-dev/reports/root_a_commission_report.md', md);
  console.log('Done:', lines.length, 'lines → reports/root_a_commission_report.md');
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
