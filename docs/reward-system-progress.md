# CoinMax 奖励系统修复进度

## 任务列表

| # | 任务 | 状态 | 日期 |
|---|------|------|------|
| 1 | 同级奖励(10%) + 越级奖励(5%) | ✅ 完成 | 2026-03-28 |
| 2 | 团队/直推奖励写入释放池 | ✅ 完成 | 2026-03-28 |
| 3 | 推荐页 UI: 升级条件 + 团队业绩 + 已领取 | ✅ 完成 | 2026-03-28 |
| 4 | VIP 价格统一 ($49月/$250半年) | ✅ 完成 | 2026-03-28 |
| 5 | 邀请链接支持自定义安置 | ✅ 已有 | 团队树UI已实现 |
| 6 | 交易记录类型完善 + 筛选 | ✅ 完成 | 2026-03-28 |
| 7 | referral_earnings 列自动更新 | ✅ 完成 | trigger 自动更新 |
| 8 | getRankStatus/getUserTeamStats API | ✅ 完成 | 2026-03-28 |

## 修改记录

### Migration 039: settle_team_commission V2
- 新增 same_rank bonus (同级10%)
- 新增 override bonus (越级5%)
- system_config: SAME_RANK_RATE=0.10, OVERRIDE_RATE=0.05

### Migration 040: 奖励进释放池
- trigger trg_commission_to_release: node_rewards INSERT → earnings_releases
- trigger trg_update_referral_earnings: 自动更新 profiles.referral_earnings

### subscribe_vip 价格更新
- monthly: $49
- halfyear: $250 (49×6×0.85)
- trial: $0 (7天)

### 前端修改
- profile-referral.tsx: 升级条件、团队业绩(RPC)、已领取金额
- profile-transactions.tsx: 直推奖励/团队奖励/节点收益/释放到账 类型 + 筛选
- api.ts: getRankStatus(), getUserTeamStats()

## 待确认/后续
- 节点系统 NODE_SYSTEM_ACTIVE 需要开启才能触发节点收益
- vault_deposits 与 vault_positions 表需统一 (distribute-revenue 用错表)
- 无降级机制 (设计决策)
