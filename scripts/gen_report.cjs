const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });
(async () => {
  await c.connect();

  const tree = await c.query(`
    WITH RECURSIVE team AS (
      SELECT id, wallet_address, rank, referrer_id, 0 as depth
      FROM profiles WHERE wallet_address = '0x3070063A913AF0b676BAcdeea2F73DA415614f4f'
      UNION ALL
      SELECT p.id, p.wallet_address, p.rank, p.referrer_id, t.depth+1
      FROM profiles p JOIN team t ON p.referrer_id = t.id WHERE t.depth < 6
    )
    SELECT t.id, t.wallet_address, t.rank, t.depth,
      (SELECT wallet_address FROM profiles WHERE id = t.referrer_id) as referrer_addr,
      (SELECT COALESCE(SUM(principal),0) FROM vault_positions WHERE user_id = t.id AND status='ACTIVE' AND plan_type!='BONUS_5D') as real_holding,
      (SELECT COALESCE(SUM(principal),0) FROM vault_positions WHERE user_id = t.id AND status='ACTIVE' AND plan_type='BONUS_5D') as bonus_holding,
      (SELECT COUNT(*) FROM profiles WHERE referrer_id = t.id) as direct_count
    FROM team t ORDER BY t.depth, real_holding DESC
  `);

  const ranked = tree.rows.filter(r => r.rank);
  const teamPerf = {};
  for (const r of ranked) {
    const tp = await c.query(`
      WITH RECURSIVE dl AS (
        SELECT id FROM profiles WHERE referrer_id = '${r.id}'
        UNION ALL
        SELECT p.id FROM profiles p JOIN dl d ON p.referrer_id = d.id
      )
      SELECT COALESCE(SUM(vp.principal),0) as tp
      FROM vault_positions vp JOIN dl d ON vp.user_id = d.id WHERE vp.status='ACTIVE' AND vp.plan_type!='BONUS_5D'
    `);
    teamPerf[r.wallet_address] = Number(tp.rows[0].tp);
  }

  const commissions = await c.query(`
    SELECT nr.user_id, p.wallet_address, p.rank, nr.amount, nr.details,
      (SELECT wallet_address FROM profiles WHERE id = (nr.details->>'source_user')::uuid) as source_addr
    FROM node_rewards nr JOIN profiles p ON p.id = nr.user_id
    WHERE nr.reward_type = 'TEAM_COMMISSION' AND nr.created_at > NOW() - INTERVAL '6 hours'
    ORDER BY (nr.details->>'type'), nr.amount DESC
  `);

  const yields = await c.query(`
    SELECT p.wallet_address, p.rank, SUM(vr.ar_amount) as ma_yield, SUM(vr.amount) as usd_yield
    FROM vault_rewards vr JOIN profiles p ON p.id = vr.user_id
    WHERE vr.reward_type='DAILY_YIELD' AND vr.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY p.id, p.wallet_address, p.rank ORDER BY ma_yield DESC
  `);

  const rc = await c.query(`SELECT value FROM system_config WHERE key='RANK_CONDITIONS'`);
  const rankConds = JSON.parse(rc.rows[0].value);
  const mp = await c.query(`SELECT value FROM system_config WHERE key='MA_TOKEN_PRICE'`);
  const maPrice = Number(mp.rows[0].value);

  const lines = [];
  const L = (s) => lines.push(s);

  L('# 4f4f 账户团队推荐树 & 奖励计算报告');
  L('');
  L('> 生成时间: ' + new Date().toISOString().slice(0,19) + ' UTC');
  L('> MA 价格: $' + maPrice);
  L('> Leader: `0x3070063A913AF0b676BAcdeea2F73DA415614f4f`');
  L('');
  L('---');
  L('');
  L('## 一、等级升级条件');
  L('');
  L('| 等级 | 个人持仓 | 直推要求 | 团队业绩 |');
  L('|------|---------|---------|---------|');
  rankConds.forEach(r => {
    const sub = r.requiredSubRanks ? r.requiredSubRanks + '个' + r.subRankLevel + '+' : r.directReferrals + '个有存入';
    L('| ' + r.level + ' | ≥' + r.personalHolding + 'U | ' + sub + ' | ≥' + Number(r.teamPerformance).toLocaleString() + 'U |');
  });
  L('');
  L('> 体验金(BONUS_5D)不计入任何业绩计算');
  L('');
  L('---');
  L('');
  L('## 二、完整推荐树');
  L('');
  L('| 层级 | 钱包地址 | 等级 | 实际持仓 | 体验金 | 直推数 | 团队业绩 |');
  L('|------|---------|------|---------|-------|-------|---------|');
  tree.rows.forEach(r => {
    const indent = '\u00b7'.repeat(r.depth);
    const tp = teamPerf[r.wallet_address] !== undefined ? Number(teamPerf[r.wallet_address]).toLocaleString() + 'U' : '-';
    const bonus = Number(r.bonus_holding) > 0 ? r.bonus_holding + 'U' : '-';
    L('| ' + indent + 'L' + r.depth + ' | `' + r.wallet_address + '` | ' + (r.rank||'-') + ' | ' + r.real_holding + 'U | ' + bonus + ' | ' + r.direct_count + ' | ' + tp + ' |');
  });
  L('');
  L('---');
  L('');
  L('## 三、等级达标验证');
  L('');
  for (const r of ranked) {
    const tp = teamPerf[r.wallet_address];
    const cond = rankConds.find(cc => cc.level === r.rank);
    if (!cond) continue;
    L('### `' + r.wallet_address + '` (' + r.rank + ')');
    L('');
    L('- **个人持仓**: ' + r.real_holding + 'U ' + (Number(r.real_holding) >= cond.personalHolding ? '✅ ≥' + cond.personalHolding : '❌ <' + cond.personalHolding));
    L('- **团队业绩**: ' + tp.toLocaleString() + 'U ' + (tp >= cond.teamPerformance ? '✅ ≥' + Number(cond.teamPerformance).toLocaleString() : '❌ <' + Number(cond.teamPerformance).toLocaleString()));
    if (cond.requiredSubRanks) {
      const subs = tree.rows.filter(s => s.referrer_addr === r.wallet_address && s.rank);
      const rankIdx = (rk) => ['V1','V2','V3','V4','V5','V6','V7'].indexOf(rk);
      const qualified = subs.filter(s => rankIdx(s.rank) >= rankIdx(cond.subRankLevel));
      L('- **达标直推**: ' + qualified.length + '/' + cond.requiredSubRanks + '个' + cond.subRankLevel + '+ ' + (qualified.length >= cond.requiredSubRanks ? '✅' : '❌'));
      qualified.forEach(s => { L('  - `' + s.wallet_address + '` (' + s.rank + ')'); });
    } else {
      const dwd = tree.rows.filter(s => s.referrer_addr === r.wallet_address && Number(s.real_holding) > 0);
      L('- **有存入直推**: ' + dwd.length + '/' + cond.directReferrals + ' ' + (dwd.length >= cond.directReferrals ? '✅' : '❌'));
    }
    L('');
  }
  L('---');
  L('');
  L('## 四、当日金库MA收益');
  L('');
  L('> 公式: 本金 x 日利率 / MA价格($' + maPrice + ') = MA收益');
  L('');
  L('| 钱包地址 | 等级 | USD收益 | MA收益 |');
  L('|---------|------|--------|--------|');
  let totalMA = 0;
  yields.rows.forEach(r => {
    L('| `' + r.wallet_address + '` | ' + (r.rank||'-') + ' | $' + Number(r.usd_yield).toFixed(2) + ' | ' + Number(r.ma_yield).toFixed(2) + ' MA |');
    totalMA += Number(r.ma_yield);
  });
  L('| **合计** | | | **' + totalMA.toFixed(2) + ' MA** |');
  L('');
  L('---');
  L('');
  L('## 五、当日奖励明细');
  L('');
  L('> 基数 = 下属当日MA收益全额');
  L('');

  const typeLabels = {
    direct_referral: '直推奖励 (10% x 下属MA收益)',
    differential: '级差奖励 (rank差额% x 下属MA收益)',
    same_rank: '同级奖励 (同级佣金率 x 10% x 下属MA收益)',
    override: '越级奖励 (5% x 下属MA收益)'
  };

  for (const type of ['direct_referral','differential','same_rank','override']) {
    const items = commissions.rows.filter(r => r.details && r.details.type === type);
    const total = items.reduce((s,i) => s + Number(i.amount), 0);
    L('### ' + typeLabels[type] + (items.length > 0 ? ' (' + items.length + '笔, ' + total.toFixed(4) + ' MA)' : ''));
    L('');
    if (items.length === 0) { L('本轮无'); L(''); continue; }
    L('| 获得者 | 等级 | 来源 | 金额(MA) | 层级 | 费率 |');
    L('|-------|------|------|---------|------|------|');
    items.forEach(i => {
      const rate = i.details.rate ? (i.details.rate * 100).toFixed(0) + '%' : '10%';
      L('| `' + i.wallet_address + '` | ' + (i.rank||'-') + ' | `' + (i.source_addr||'?') + '` | ' + Number(i.amount).toFixed(4) + ' | ' + (i.details.depth||'-') + ' | ' + rate + ' |');
    });
    L('');
  }

  L('---');
  L('');
  L('## 六、各账户奖励汇总');
  L('');
  L('| 钱包地址 | 等级 | 直推 | 级差 | 同级 | 越级 | 总计(MA) |');
  L('|---------|------|-----|------|------|------|---------|');
  const pp = {};
  commissions.rows.forEach(r => {
    if (!pp[r.wallet_address]) pp[r.wallet_address] = { rank: r.rank, d:0, f:0, s:0, o:0 };
    const t = r.details && r.details.type;
    if (t==='direct_referral') pp[r.wallet_address].d += Number(r.amount);
    if (t==='differential') pp[r.wallet_address].f += Number(r.amount);
    if (t==='same_rank') pp[r.wallet_address].s += Number(r.amount);
    if (t==='override') pp[r.wallet_address].o += Number(r.amount);
  });
  let gt = 0;
  Object.entries(pp).sort((a,b)=>(b[1].d+b[1].f+b[1].s+b[1].o)-(a[1].d+a[1].f+a[1].s+a[1].o)).forEach(([addr,v])=>{
    const tot = v.d+v.f+v.s+v.o; gt += tot;
    L('| `' + addr + '` | ' + (v.rank||'-') + ' | ' + v.d.toFixed(2) + ' | ' + v.f.toFixed(2) + ' | ' + v.s.toFixed(2) + ' | ' + v.o.toFixed(2) + ' | **' + tot.toFixed(2) + '** |');
  });
  L('| **合计** | | | | | | **' + gt.toFixed(2) + ' MA** |');

  const md = lines.join('\n') + '\n';
  fs.writeFileSync('/Users/macbookpro/WebstormProjects/coinmax-dev/reports/4f4f_team_report.md', md);
  console.log('Done:', lines.length, 'lines written');
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
