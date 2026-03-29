const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:onelong53541314@db.enedbksmftcgtszrkppc.supabase.co:5432/postgres' });

(async () => {
  await c.connect();

  // 1. Update activation tiers
  await c.query(`
    UPDATE system_config SET value = '[
      {"rank":"V1","vault_deposit":100,"required_mini_referrals":3},
      {"rank":"V2","vault_deposit":300,"required_mini_referrals":0},
      {"rank":"V3","vault_deposit":500,"required_mini_referrals":0},
      {"rank":"V4","vault_deposit":600,"required_mini_referrals":0},
      {"rank":"V5","vault_deposit":800,"required_mini_referrals":0},
      {"rank":"V6","vault_deposit":1000,"required_mini_referrals":0}
    ]', updated_at = NOW() WHERE key = 'MAX_ACTIVATION_TIERS'
  `);
  console.log('✅ MAX_ACTIVATION_TIERS');

  await c.query(`
    UPDATE system_config SET value = '[
      {"rank":"V1","vault_deposit":100,"required_mini_referrals":0},
      {"rank":"V2","vault_deposit":300,"required_mini_referrals":0},
      {"rank":"V3","vault_deposit":500,"required_mini_referrals":0},
      {"rank":"V4","vault_deposit":600,"required_mini_referrals":0}
    ]', updated_at = NOW() WHERE key = 'MINI_ACTIVATION_TIERS'
  `);
  console.log('✅ MINI_ACTIVATION_TIERS');

  // 2. Update milestones
  await c.query(`
    UPDATE system_config SET value = '[
      {"rank":"V1","days":15,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"16-30","desc":"V1达标继续领取收益"},
      {"rank":"V2","days":30,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"31-60","desc":"V2达标继续领取收益"},
      {"rank":"V4","days":60,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"61-120","desc":"V4达标继续领取收益"},
      {"rank":"V6","days":120,"pass_action":"UNLOCK_FROZEN","fail_action":"KEEP_FROZEN","earning_range":null,"desc":"V6达标解锁6000U铸造MA"}
    ]', updated_at = NOW() WHERE key = 'MAX_MILESTONES'
  `);
  console.log('✅ MAX_MILESTONES');

  await c.query(`
    UPDATE system_config SET value = '[
      {"rank":"V2","days":30,"pass_action":"UNLOCK_PARTIAL","fail_action":"KEEP_LOCKED","earning_range":"1-60","desc":"V2达标解锁1-60天收益"},
      {"rank":"V2","days":90,"pass_action":"UNLOCK_ALL","fail_action":"DESTROY","earning_range":"1-90","desc":"V2达标解锁全部收益"},
      {"rank":"V4","days":90,"pass_action":"UNLOCK_FROZEN","fail_action":"KEEP_FROZEN","earning_range":null,"desc":"V4达标解锁1000U铸造MA"}
    ]', updated_at = NOW() WHERE key = 'MINI_MILESTONES'
  `);
  console.log('✅ MINI_MILESTONES');

  // 3. Update settle_node_fixed_yield to enforce activation check + correct yield
  await c.query(`
    CREATE OR REPLACE FUNCTION settle_node_fixed_yield()
    RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    AS $fn$
    DECLARE
      node RECORD;
      daily_profit NUMERIC;
      total_settled NUMERIC := 0;
      nodes_processed INT := 0;
      days_since_start INT;
    BEGIN
      FOR node IN
        SELECT nm.*, p.id AS profile_id, p.rank AS user_rank
        FROM node_memberships nm
        JOIN profiles p ON p.id = nm.user_id
        WHERE nm.status IN ('ACTIVE', 'PENDING_MILESTONES')
          AND nm.activated_rank IS NOT NULL
          AND (nm.end_date IS NULL OR nm.end_date > NOW())
      LOOP
        IF COALESCE(node.earnings_paused, FALSE) THEN
          nodes_processed := nodes_processed + 1;
          CONTINUE;
        END IF;

        -- Daily yield: frozen_amount * daily_rate
        -- MAX: 6000 * 0.009 = 54U/day
        -- MINI: 1000 * 0.009 = 9U/day
        daily_profit := node.frozen_amount * COALESCE(node.daily_rate, 0.009);
        IF daily_profit <= 0 THEN CONTINUE; END IF;

        days_since_start := EXTRACT(DAY FROM (NOW() - node.start_date));
        IF days_since_start < 1 THEN CONTINUE; END IF;

        IF node.node_type = 'MINI' THEN
          -- MINI: all earnings LOCKED until V2 qualification
          UPDATE node_memberships
          SET locked_earnings = locked_earnings + daily_profit
          WHERE id = node.id;

          INSERT INTO node_rewards (user_id, reward_type, amount, details)
          VALUES (node.user_id, 'FIXED_YIELD', daily_profit,
            jsonb_build_object('node_type', 'MINI', 'frozen_amount', node.frozen_amount,
              'daily_rate', node.daily_rate, 'status', 'LOCKED', 'day', days_since_start));
        ELSE
          -- MAX: earnings directly released (claimable)
          UPDATE node_memberships
          SET released_earnings = released_earnings + daily_profit,
              available_balance = available_balance + daily_profit
          WHERE id = node.id;

          INSERT INTO node_rewards (user_id, reward_type, amount, details)
          VALUES (node.user_id, 'FIXED_YIELD', daily_profit,
            jsonb_build_object('node_type', 'MAX', 'frozen_amount', node.frozen_amount,
              'daily_rate', node.daily_rate, 'status', 'RELEASED', 'day', days_since_start));
        END IF;

        total_settled := total_settled + daily_profit;
        nodes_processed := nodes_processed + 1;
      END LOOP;

      RETURN jsonb_build_object('nodesProcessed', nodes_processed, 'totalSettled', ROUND(total_settled, 6)::TEXT);
    END;
    $fn$;
  `);
  console.log('✅ settle_node_fixed_yield updated');

  // 4. Update check_node_milestones
  await c.query(`
    CREATE OR REPLACE FUNCTION check_node_milestones(addr TEXT)
    RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    AS $fn$
    DECLARE
      profile_row profiles%ROWTYPE;
      ms RECORD;
      user_rank_index INT;
      required_rank_index INT;
      achieved_count INT := 0;
      failed_count INT := 0;
      days_since_start INT;
      rank_levels TEXT[] := ARRAY['V1','V2','V3','V4','V5','V6','V7'];
    BEGIN
      SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;
      IF profile_row.id IS NULL THEN
        RETURN jsonb_build_object('error', 'Profile not found');
      END IF;

      -- Run activation check first
      PERFORM check_node_activation(addr);
      SELECT * INTO profile_row FROM profiles WHERE wallet_address = addr;

      user_rank_index := COALESCE(array_position(rank_levels, profile_row.rank), 0);

      FOR ms IN
        SELECT nm_ms.*, nm.user_id, nm.node_type, nm.total_milestones, nm.id AS mem_id,
               nm.locked_earnings, nm.frozen_amount, nm.start_date AS node_start_date,
               nm.activated_rank, nm.earnings_paused
        FROM node_milestones nm_ms
        JOIN node_memberships nm ON nm.id = nm_ms.membership_id
        WHERE nm.user_id = profile_row.id
          AND nm.status = 'PENDING_MILESTONES'
          AND nm_ms.status = 'PENDING'
          AND nm.activated_rank IS NOT NULL
        ORDER BY nm_ms.deadline_days ASC, nm_ms.milestone_index ASC
      LOOP
        days_since_start := EXTRACT(DAY FROM (NOW() - ms.node_start_date));
        IF days_since_start < ms.deadline_days THEN CONTINUE; END IF;

        required_rank_index := COALESCE(array_position(rank_levels, ms.required_rank), 0);

        IF user_rank_index >= required_rank_index THEN
          -- PASSED
          UPDATE node_milestones SET status = 'ACHIEVED', achieved_at = NOW() WHERE id = ms.id;
          UPDATE node_memberships SET milestone_stage = milestone_stage + 1 WHERE id = ms.mem_id;

          IF COALESCE(ms.pass_action, 'CONTINUE') = 'UNLOCK_PARTIAL' THEN
            -- MINI Day 30 V2 pass: unlock locked earnings
            UPDATE node_memberships
            SET released_earnings = released_earnings + COALESCE(locked_earnings, 0),
                available_balance = available_balance + COALESCE(locked_earnings, 0),
                locked_earnings = 0
            WHERE id = ms.mem_id;
          ELSIF ms.pass_action = 'UNLOCK_ALL' THEN
            -- MINI Day 90 V2 pass: unlock all remaining
            UPDATE node_memberships
            SET released_earnings = released_earnings + COALESCE(locked_earnings, 0),
                available_balance = available_balance + COALESCE(locked_earnings, 0),
                locked_earnings = 0
            WHERE id = ms.mem_id;
          ELSIF ms.pass_action = 'UNLOCK_FROZEN' THEN
            -- MAX Day 120 V6 / MINI Day 90 V4: unlock frozen as MA
            UPDATE node_memberships
            SET frozen_unlocked = TRUE,
                available_balance = available_balance + frozen_amount
            WHERE id = ms.mem_id AND NOT frozen_unlocked;
          ELSIF ms.pass_action = 'CONTINUE' THEN
            -- MAX: resume earnings
            UPDATE node_memberships SET earnings_paused = FALSE WHERE id = ms.mem_id;
          END IF;

          achieved_count := achieved_count + 1;
        ELSE
          -- FAILED
          UPDATE node_milestones SET status = 'FAILED' WHERE id = ms.id;

          IF COALESCE(ms.fail_action, 'PAUSE') = 'KEEP_LOCKED' THEN
            -- MINI Day 30 V2 fail: keep locked, rank drops to actual
            NULL;
          ELSIF ms.fail_action = 'DESTROY' THEN
            -- MINI Day 90 V2 fail: destroy all locked earnings
            UPDATE node_memberships
            SET destroyed_earnings = COALESCE(destroyed_earnings, 0) + COALESCE(locked_earnings, 0),
                locked_earnings = 0
            WHERE id = ms.mem_id;
          ELSIF ms.fail_action = 'PAUSE' THEN
            -- MAX: pause earnings, rank drops to actual
            UPDATE node_memberships SET earnings_paused = TRUE WHERE id = ms.mem_id;
          ELSIF ms.fail_action = 'KEEP_FROZEN' THEN
            NULL; -- Cannot unlock frozen
          END IF;

          -- Rank drops to actual level (re-check via rank promotion)
          PERFORM check_rank_promotion(addr);

          failed_count := failed_count + 1;
        END IF;
      END LOOP;

      -- Promote fully-achieved nodes to ACTIVE
      UPDATE node_memberships SET status = 'ACTIVE'
      WHERE user_id = profile_row.id
        AND status = 'PENDING_MILESTONES'
        AND milestone_stage >= total_milestones;

      RETURN jsonb_build_object('achieved', achieved_count, 'failed', failed_count);
    END;
    $fn$;
  `);
  console.log('✅ check_node_milestones updated');

  // Verify
  for (const fn of ['settle_node_fixed_yield', 'check_node_milestones', 'check_node_activation']) {
    const r = await c.query(`SELECT proname FROM pg_proc WHERE proname = '${fn}'`);
    console.log(fn + ':', r.rows.length > 0 ? 'exists ✅' : 'MISSING ❌');
  }

  await c.end();
  console.log('\nDone. Node system config + functions updated.');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
