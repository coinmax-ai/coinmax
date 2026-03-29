const { Client } = require('pg');
const ExcelJS = require('exceljs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

const ROOT = '0x6A38C45d599AB4B93935B321dD3Ba7462d7C00Fe';

(async () => {
  await c.connect();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CoinMax';
  wb.created = new Date();

  const rootRow = await c.query(`SELECT id FROM profiles WHERE wallet_address = '${ROOT}'`);
  const rootId = rootRow.rows[0].id;
  const mp = await c.query(`SELECT value FROM system_config WHERE key='MA_TOKEN_PRICE'`);
  const maPrice = Number(mp.rows[0].value);

  // ═══ Tree data ═══
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

  const userIds = tree.rows.map(r => `'${r.id}'`).join(',');

  // ═══ Yields ═══
  const yields = await c.query(`
    SELECT vr.user_id, p.wallet_address, p.rank, SUM(vr.ar_amount) as ma_yield, SUM(vr.amount) as usd_yield
    FROM vault_rewards vr JOIN profiles p ON p.id = vr.user_id
    WHERE vr.reward_type='DAILY_YIELD' AND vr.created_at > NOW() - INTERVAL '30 minutes'
      AND vr.user_id IN (${userIds})
    GROUP BY vr.user_id, p.wallet_address, p.rank ORDER BY ma_yield DESC
  `);

  // ═══ Commissions ═══
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

  // Header style
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: { bottom: { style: 'thin', color: { argb: 'FF666666' } } },
  };
  const numFmt = '#,##0.00';

  function styleHeader(ws) {
    ws.getRow(1).eachCell(cell => {
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });
    ws.getRow(1).height = 22;
  }

  // ═══ Sheet 1: 团队推荐树 ═══
  const ws1 = wb.addWorksheet('团队推荐树');
  ws1.columns = [
    { header: '层级', key: 'depth', width: 8 },
    { header: '钱包地址', key: 'addr', width: 46 },
    { header: '等级', key: 'rank', width: 8 },
    { header: '持仓(U)', key: 'holding', width: 14 },
    { header: '推荐人', key: 'referrer', width: 46 },
  ];
  styleHeader(ws1);
  tree.rows.forEach(r => {
    const row = ws1.addRow({
      depth: 'L' + r.depth,
      addr: r.wallet_address,
      rank: r.rank || '-',
      holding: Number(r.holding),
      referrer: r.referrer_addr || '-',
    });
    row.getCell('holding').numFmt = numFmt;
    if (r.depth === 0) row.font = { bold: true };
  });

  // ═══ Sheet 2: 当日MA收益 ═══
  const ws2 = wb.addWorksheet('当日MA收益');
  ws2.columns = [
    { header: '钱包地址', key: 'addr', width: 46 },
    { header: '等级', key: 'rank', width: 8 },
    { header: 'USD收益', key: 'usd', width: 14 },
    { header: 'MA收益', key: 'ma', width: 14 },
  ];
  styleHeader(ws2);
  let totalYieldMA = 0;
  yields.rows.forEach(r => {
    const row = ws2.addRow({
      addr: r.wallet_address,
      rank: r.rank || '-',
      usd: Number(r.usd_yield),
      ma: Number(r.ma_yield),
    });
    row.getCell('usd').numFmt = '$#,##0.00';
    row.getCell('ma').numFmt = numFmt;
    totalYieldMA += Number(r.ma_yield);
  });
  const totalRow = ws2.addRow({ addr: '合计', rank: '', usd: '', ma: totalYieldMA });
  totalRow.font = { bold: true };
  totalRow.getCell('ma').numFmt = numFmt;

  // ═══ Sheet 3: 直推奖励 ═══
  // ═══ Sheet 4: 级差奖励 ═══
  // ═══ Sheet 5: 同级奖励 ═══
  // ═══ Sheet 6: 越级奖励 ═══
  const types = [
    { key: 'direct_referral', name: '直推奖励', desc: '10% x 直推下属MA收益' },
    { key: 'differential', name: '级差奖励', desc: 'rank差额% x 下属MA收益' },
    { key: 'same_rank', name: '同级奖励', desc: '同级佣金率x10%' },
    { key: 'override', name: '越级奖励', desc: '5% x 下属MA收益' },
  ];

  for (const t of types) {
    const ws = wb.addWorksheet(t.name);
    ws.columns = [
      { header: '获得者', key: 'recipient', width: 46 },
      { header: '获得者等级', key: 'rRank', width: 12 },
      { header: '来源', key: 'source', width: 46 },
      { header: '来源等级', key: 'sRank', width: 12 },
      { header: '金额(MA)', key: 'amount', width: 14 },
      { header: '层级', key: 'depth', width: 8 },
      { header: '费率', key: 'rate', width: 8 },
    ];
    styleHeader(ws);

    const items = commissions.rows.filter(r => r.details && r.details.type === t.key);
    items.forEach(i => {
      const rate = i.details.rate ? (i.details.rate * 100).toFixed(0) + '%' : '10%';
      const row = ws.addRow({
        recipient: i.recipient_addr,
        rRank: i.recipient_rank || '-',
        source: i.source_addr || '?',
        sRank: i.source_rank || '-',
        amount: Number(i.amount),
        depth: i.details.depth || '-',
        rate: rate,
      });
      row.getCell('amount').numFmt = numFmt;
    });

    const total = items.reduce((s, i) => s + Number(i.amount), 0);
    const tRow = ws.addRow({ recipient: '合计', rRank: '', source: '', sRank: '', amount: total, depth: '', rate: '' });
    tRow.font = { bold: true };
    tRow.getCell('amount').numFmt = numFmt;
  }

  // ═══ Sheet 7: 各账户汇总 ═══
  const ws7 = wb.addWorksheet('各账户汇总');
  ws7.columns = [
    { header: '钱包地址', key: 'addr', width: 46 },
    { header: '等级', key: 'rank', width: 8 },
    { header: '直推(MA)', key: 'd', width: 14 },
    { header: '级差(MA)', key: 'f', width: 14 },
    { header: '同级(MA)', key: 's', width: 14 },
    { header: '越级(MA)', key: 'o', width: 14 },
    { header: '总计(MA)', key: 'total', width: 14 },
  ];
  styleHeader(ws7);

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

  let gt = 0;
  Object.entries(pp)
    .sort((a, b) => (b[1].d + b[1].f + b[1].s + b[1].o) - (a[1].d + a[1].f + a[1].s + a[1].o))
    .forEach(([addr, v]) => {
      const tot = v.d + v.f + v.s + v.o;
      gt += tot;
      const row = ws7.addRow({ addr, rank: v.rank || '-', d: v.d, f: v.f, s: v.s, o: v.o, total: tot });
      ['d', 'f', 's', 'o', 'total'].forEach(k => { row.getCell(k).numFmt = numFmt; });
    });
  const gRow = ws7.addRow({ addr: '合计', rank: '', d: '', f: '', s: '', o: '', total: gt });
  gRow.font = { bold: true };
  gRow.getCell('total').numFmt = numFmt;

  // ═══ Sheet 8: A奖励拆解 ═══
  const ws8 = wb.addWorksheet('根账户A奖励拆解');
  ws8.columns = [
    { header: '奖励类型', key: 'type', width: 12 },
    { header: '来源钱包', key: 'source', width: 46 },
    { header: '来源等级', key: 'sRank', width: 12 },
    { header: '金额(MA)', key: 'amount', width: 14 },
    { header: '层级', key: 'depth', width: 8 },
    { header: '费率', key: 'rate', width: 8 },
  ];
  styleHeader(ws8);

  const typeLabels = { direct_referral: '直推', differential: '级差', same_rank: '同级', override: '越级' };
  const aComm = commissions.rows.filter(r => r.recipient_addr === ROOT);
  let aTotal = 0;
  aComm.sort((a, b) => Number(b.amount) - Number(a.amount)).forEach(i => {
    const rate = i.details.rate ? (i.details.rate * 100).toFixed(0) + '%' : '10%';
    aTotal += Number(i.amount);
    const row = ws8.addRow({
      type: typeLabels[i.details.type] || i.details.type,
      source: i.source_addr || '?',
      sRank: i.source_rank || '-',
      amount: Number(i.amount),
      depth: i.details.depth || '-',
      rate: rate,
    });
    row.getCell('amount').numFmt = numFmt;
  });
  const aRow = ws8.addRow({ type: '合计', source: '', sRank: '', amount: aTotal, depth: '', rate: '' });
  aRow.font = { bold: true };
  aRow.getCell('amount').numFmt = numFmt;

  // Save
  const filePath = '/Users/macbookpro/WebstormProjects/coinmax-dev/reports/root_a_commission_report.xlsx';
  await wb.xlsx.writeFile(filePath);
  console.log('Done → ' + filePath);
  console.log('Sheets: 团队推荐树, 当日MA收益, 直推奖励, 级差奖励, 同级奖励, 越级奖励, 各账户汇总, 根账户A奖励拆解');
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
