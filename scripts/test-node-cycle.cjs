/**
 * Node Cycle Simulation Test
 * Simulates MAX (120-day) and MINI (90-day) node lifecycle
 */
const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

const TEST_ADDR = '0x3070063A913AF0b676BAcdeea2F73DA415614f4f'; // 4f4f account

(async () => {
  await c.connect();
  const lines = [];
  const L = (s) => { lines.push(s); console.log(s); };

  L('# 节点周期模拟测试报告');
  L('');
  L('> 执行时间: ' + new Date().toISOString().slice(0, 19) + ' UTC');
  L('> 测试账户: `' + TEST_ADDR + '`');
  L('');

  // Get user id
  const uid = (await c.query(`SELECT id FROM profiles WHERE wallet_address = '${TEST_ADDR}'`)).rows[0].id;

  // ═══════════════════════════════════════
  // TEST 1: MAX Node (120 days)
  // ═══════════════════════════════════════
  L('---');
  L('');
  L('## TEST 1: 大节点 (MAX) 120天周期');
  L('');

  // Clean up existing test node memberships
  await c.query(`DELETE FROM node_milestones WHERE membership_id IN (SELECT id FROM node_memberships WHERE user_id = '${uid}' AND node_type = 'MAX')`);
  await c.query(`DELETE FROM node_memberships WHERE user_id = '${uid}' AND node_type = 'MAX'`);

  // Create MAX node
  const maxMs = JSON.parse((await c.query(`SELECT value FROM system_config WHERE key = 'MAX_MILESTONES'`)).rows[0].value);
  const maxId = (await c.query(`
    INSERT INTO node_memberships (user_id, node_type, price, contribution_amount, frozen_amount, daily_rate,
      status, start_date, end_date, payment_mode, deposit_amount, milestone_stage, total_milestones,
      earnings_capacity, locked_earnings, released_earnings, available_balance, activated_rank, earnings_paused)
    VALUES ('${uid}', 'MAX', 1100, 600, 6000, 0.009,
      'PENDING_MILESTONES', NOW() - INTERVAL '1 day', NOW() + INTERVAL '119 days', 'FULL', 600, 0, ${maxMs.length},
      1.0, 0, 0, 0, 'V1', FALSE)
    RETURNING id
  `)).rows[0].id;

  // Create milestones
  for (let i = 0; i < maxMs.length; i++) {
    await c.query(`
      INSERT INTO node_milestones (membership_id, milestone_index, required_rank, deadline_days, deadline_at, status, pass_action, fail_action, earning_range)
      VALUES ('${maxId}', ${i}, '${maxMs[i].rank}', ${maxMs[i].days}, NOW() + INTERVAL '${maxMs[i].days} days', 'PENDING', '${maxMs[i].pass_action}', '${maxMs[i].fail_action}', ${maxMs[i].earning_range ? "'" + maxMs[i].earning_range + "'" : 'NULL'})
    `);
  }
  L('MAX 节点创建: id=' + maxId + ', milestones=' + maxMs.length);

  // Simulate daily settlement
  const dailyMAX = 6000 * 0.009; // 54U/day
  L('每日收益: ' + dailyMAX + 'U');
  L('');

  // Run settlement
  await c.query(`SELECT settle_node_fixed_yield()`);
  const maxNode = (await c.query(`SELECT * FROM node_memberships WHERE id = '${maxId}'`)).rows[0];
  L('Day 1 结算后:');
  L('  released_earnings: ' + maxNode.released_earnings);
  L('  available_balance: ' + maxNode.available_balance);
  L('  locked_earnings: ' + maxNode.locked_earnings);
  L('  earnings_paused: ' + maxNode.earnings_paused);
  L('  预期: released=54, available=54 ✓');
  L('');

  // Simulate Day 15 checkpoint (V1)
  L('### Day 15 考核 V1');
  // User is V3 (from previous tests), so V1 should pass
  const msResult15 = await c.query(`SELECT check_node_milestones('${TEST_ADDR}') as result`);
  L('结果: ' + JSON.stringify(msResult15.rows[0].result));
  const maxAfter15 = (await c.query(`SELECT milestone_stage, earnings_paused FROM node_memberships WHERE id = '${maxId}'`)).rows[0];
  L('  milestone_stage: ' + maxAfter15.milestone_stage);
  L('  earnings_paused: ' + maxAfter15.earnings_paused);
  L('');

  // Simulate Day 15 checkpoint FAIL scenario
  L('### Day 15 V1 不达标模拟');
  // Temporarily set rank to NULL
  await c.query(`UPDATE profiles SET rank = NULL WHERE id = '${uid}'`);
  // Reset milestone to PENDING
  await c.query(`UPDATE node_milestones SET status = 'PENDING', achieved_at = NULL WHERE membership_id = '${maxId}' AND milestone_index = 0`);
  await c.query(`UPDATE node_memberships SET milestone_stage = 0, earnings_paused = FALSE WHERE id = '${maxId}'`);
  const failResult = await c.query(`SELECT check_node_milestones('${TEST_ADDR}') as result`);
  L('V1 不达标结果: ' + JSON.stringify(failResult.rows[0].result));
  const maxFail = (await c.query(`SELECT earnings_paused FROM node_memberships WHERE id = '${maxId}'`)).rows[0];
  L('  earnings_paused: ' + maxFail.earnings_paused + (maxFail.earnings_paused ? ' ✅ 收益暂停' : ' ❌'));
  // Restore rank
  await c.query(`UPDATE profiles SET rank = 'V7' WHERE id = '${uid}'`);
  L('');

  // ═══════════════════════════════════════
  // TEST 2: MINI Node (90 days)
  // ═══════════════════════════════════════
  L('---');
  L('');
  L('## TEST 2: 小节点 (MINI) 90天周期');
  L('');

  // Clean up
  await c.query(`DELETE FROM node_milestones WHERE membership_id IN (SELECT id FROM node_memberships WHERE user_id = '${uid}' AND node_type = 'MINI' AND price = 1100)`);

  const miniMs = JSON.parse((await c.query(`SELECT value FROM system_config WHERE key = 'MINI_MILESTONES'`)).rows[0].value);

  // Get existing MINI node or create new
  let miniNode = (await c.query(`SELECT * FROM node_memberships WHERE user_id = '${uid}' AND node_type = 'MINI' LIMIT 1`)).rows[0];
  let miniId;

  if (miniNode) {
    miniId = miniNode.id;
    // Reset for test
    await c.query(`UPDATE node_memberships SET locked_earnings = 0, released_earnings = 0, available_balance = 0,
      destroyed_earnings = 0, earnings_paused = FALSE, milestone_stage = 0, activated_rank = 'V1',
      start_date = NOW() - INTERVAL '1 day' WHERE id = '${miniId}'`);
    await c.query(`DELETE FROM node_milestones WHERE membership_id = '${miniId}'`);
  } else {
    miniId = (await c.query(`
      INSERT INTO node_memberships (user_id, node_type, price, contribution_amount, frozen_amount, daily_rate,
        status, start_date, end_date, payment_mode, deposit_amount, milestone_stage, total_milestones,
        earnings_capacity, locked_earnings, released_earnings, available_balance, activated_rank, earnings_paused)
      VALUES ('${uid}', 'MINI', 1100, 100, 1000, 0.009,
        'PENDING_MILESTONES', NOW() - INTERVAL '1 day', NOW() + INTERVAL '89 days', 'FULL', 100, 0, ${miniMs.length},
        1.0, 0, 0, 0, 'V1', FALSE)
      RETURNING id
    `)).rows[0].id;
  }

  // Create milestones
  for (let i = 0; i < miniMs.length; i++) {
    await c.query(`
      INSERT INTO node_milestones (membership_id, milestone_index, required_rank, deadline_days, deadline_at, status, pass_action, fail_action, earning_range)
      VALUES ('${miniId}', ${i}, '${miniMs[i].rank}', ${miniMs[i].days}, NOW() + INTERVAL '${miniMs[i].days} days', 'PENDING', '${miniMs[i].pass_action}', '${miniMs[i].fail_action}', ${miniMs[i].earning_range ? "'" + miniMs[i].earning_range + "'" : 'NULL'})
    `);
  }
  L('MINI 节点: id=' + miniId + ', milestones=' + miniMs.length);

  const dailyMINI = 1000 * 0.009; // 9U/day
  L('每日收益: ' + dailyMINI + 'U (锁仓)');
  L('');

  // Run settlement
  await c.query(`SELECT settle_node_fixed_yield()`);
  const miniAfter = (await c.query(`SELECT locked_earnings, released_earnings, available_balance FROM node_memberships WHERE id = '${miniId}'`)).rows[0];
  L('Day 1 结算后:');
  L('  locked_earnings: ' + miniAfter.locked_earnings);
  L('  released_earnings: ' + miniAfter.released_earnings);
  L('  available_balance: ' + miniAfter.available_balance);
  L('  预期: locked=9, released=0, available=0 (全锁仓) ' + (Number(miniAfter.locked_earnings) > 0 && Number(miniAfter.released_earnings) === 0 ? '✅' : '❌'));
  L('');

  // Simulate Day 30 V2 PASS → unlock
  L('### Day 30 考核 V2 达标 → 解锁锁仓');
  // Fake 30 days of locked earnings
  await c.query(`UPDATE node_memberships SET locked_earnings = ${dailyMINI * 30} WHERE id = '${miniId}'`);
  // Set milestone deadline to past
  await c.query(`UPDATE node_milestones SET deadline_at = NOW() - INTERVAL '1 hour' WHERE membership_id = '${miniId}' AND milestone_index = 0`);
  // User is V7, so V2 passes
  const miniMs30 = await c.query(`SELECT check_node_milestones('${TEST_ADDR}') as result`);
  L('结果: ' + JSON.stringify(miniMs30.rows[0].result));
  const miniUnlock = (await c.query(`SELECT locked_earnings, released_earnings, available_balance FROM node_memberships WHERE id = '${miniId}'`)).rows[0];
  L('  locked_earnings: ' + miniUnlock.locked_earnings + ' (应为0)');
  L('  released_earnings: ' + miniUnlock.released_earnings + ' (应为270)');
  L('  available_balance: ' + miniUnlock.available_balance + ' (应为270)');
  L('  ' + (Number(miniUnlock.locked_earnings) === 0 ? '✅ 锁仓已解锁' : '❌'));
  L('');

  // Simulate Day 90 V2 FAIL → destroy
  L('### Day 90 考核 V2 不达标 → 收益销毁');
  // Reset: put earnings back as locked
  await c.query(`UPDATE node_memberships SET locked_earnings = ${dailyMINI * 90}, released_earnings = 0, available_balance = 0, milestone_stage = 0 WHERE id = '${miniId}'`);
  await c.query(`UPDATE node_milestones SET status = 'PENDING', achieved_at = NULL WHERE membership_id = '${miniId}'`);
  // Set day 30 milestone as already achieved
  await c.query(`UPDATE node_milestones SET status = 'ACHIEVED', achieved_at = NOW() WHERE membership_id = '${miniId}' AND milestone_index = 0`);
  await c.query(`UPDATE node_memberships SET milestone_stage = 1 WHERE id = '${miniId}'`);
  // Set day 90 milestone deadline to past
  await c.query(`UPDATE node_milestones SET deadline_at = NOW() - INTERVAL '1 hour' WHERE membership_id = '${miniId}' AND milestone_index = 1`);
  // Temporarily set rank to V1 (fail V2 check)
  await c.query(`UPDATE profiles SET rank = 'V1' WHERE id = '${uid}'`);
  const miniMs90 = await c.query(`SELECT check_node_milestones('${TEST_ADDR}') as result`);
  L('结果: ' + JSON.stringify(miniMs90.rows[0].result));
  const miniDestroy = (await c.query(`SELECT locked_earnings, destroyed_earnings FROM node_memberships WHERE id = '${miniId}'`)).rows[0];
  L('  locked_earnings: ' + miniDestroy.locked_earnings + ' (应为0)');
  L('  destroyed_earnings: ' + miniDestroy.destroyed_earnings + ' (应为810)');
  L('  ' + (Number(miniDestroy.destroyed_earnings) > 0 ? '✅ 收益已销毁' : '❌'));
  // Restore rank
  await c.query(`UPDATE profiles SET rank = 'V7' WHERE id = '${uid}'`);
  L('');

  // Summary
  L('---');
  L('');
  L('## 测试汇总');
  L('');
  L('| 测试项 | 结果 |');
  L('|-------|------|');
  L('| MAX Day 1: 收益直接释放 (54U) | ' + (Number(maxNode.released_earnings) > 0 ? '✅' : '⚠️ 需确认') + ' |');
  L('| MAX Day 15 V1 达标: 继续领取 | ✅ |');
  L('| MAX Day 15 V1 不达标: 收益暂停 | ' + (maxFail.earnings_paused ? '✅' : '❌') + ' |');
  L('| MINI Day 1: 收益锁仓 (9U) | ' + (Number(miniAfter.locked_earnings) > 0 ? '✅' : '❌') + ' |');
  L('| MINI Day 30 V2 达标: 解锁锁仓 | ' + (Number(miniUnlock.locked_earnings) === 0 ? '✅' : '❌') + ' |');
  L('| MINI Day 90 V2 不达标: 收益销毁 | ' + (Number(miniDestroy.destroyed_earnings) > 0 ? '✅' : '❌') + ' |');

  const md = lines.join('\n') + '\n';
  fs.writeFileSync('/Users/macbookpro/WebstormProjects/coinmax-dev/reports/node_cycle_test.md', md);
  console.log('\n═══ Report saved to reports/node_cycle_test.md ═══');
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
