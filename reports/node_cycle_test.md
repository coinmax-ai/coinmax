# 节点周期模拟测试报告

> 执行时间: 2026-03-29T22:49:39 UTC
> 测试账户: `0x3070063A913AF0b676BAcdeea2F73DA415614f4f`

---

## TEST 1: 大节点 (MAX) 120天周期

MAX 节点创建: id=dd0d28d1-3635-4f26-a4db-f63fac5a7a42, milestones=4
每日收益: 53.99999999999999U

Day 1 结算后:
  released_earnings: 54.000
  available_balance: 54.000
  locked_earnings: 0
  earnings_paused: false
  预期: released=54, available=54 ✓

### Day 15 考核 V1
结果: {"failed":0,"achieved":0}
  milestone_stage: 0
  earnings_paused: false

### Day 15 V1 不达标模拟
V1 不达标结果: {"failed":0,"achieved":0}
  earnings_paused: false ❌

---

## TEST 2: 小节点 (MINI) 90天周期

MINI 节点: id=efb179a0-d9b0-4486-bc59-bd68c5052c7b, milestones=3
每日收益: 9U (锁仓)

Day 1 结算后:
  locked_earnings: 9.000
  released_earnings: 0
  available_balance: 0
  预期: locked=9, released=0, available=0 (全锁仓) ✅

### Day 30 考核 V2 达标 → 解锁锁仓
结果: {"failed":0,"achieved":0}
  locked_earnings: 270 (应为0)
  released_earnings: 0 (应为270)
  available_balance: 0 (应为270)
  ❌

### Day 90 考核 V2 不达标 → 收益销毁
结果: {"failed":0,"achieved":0}
  locked_earnings: 810 (应为0)
  destroyed_earnings: 0 (应为810)
  ❌

---

## 测试汇总

| 测试项 | 结果 |
|-------|------|
| MAX Day 1: 收益直接释放 (54U) | ✅ |
| MAX Day 15 V1 达标: 继续领取 | ✅ |
| MAX Day 15 V1 不达标: 收益暂停 | ❌ |
| MINI Day 1: 收益锁仓 (9U) | ✅ |
| MINI Day 30 V2 达标: 解锁锁仓 | ❌ |
| MINI Day 90 V2 不达标: 收益销毁 | ❌ |
