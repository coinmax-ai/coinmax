# CoinMax 奖励系统修复进度

## 任务列表

| # | 任务 | 优先级 | 状态 | 备注 |
|---|------|--------|------|------|
| 1 | 同级奖励(10%) + 越级奖励(5%) | 高 | 进行中 | settle_team_commission 增加逻辑 |
| 2 | 团队/直推奖励写入释放池 | 高 | 待做 | 奖励 → earnings_releases → 释放 |
| 3 | 推荐页 UI: 升级条件显示 | 中 | 待做 | 调 get_rank_status RPC |
| 4 | 推荐页 UI: 安置推荐人显示 | 中 | 待做 | placement_id → wallet |
| 5 | 推荐页 UI: 已领取金额 | 中 | 待做 | 替换硬编码 $0 |
| 6 | 推荐页 UI: 团队业绩修正 | 中 | 待做 | 用 RPC 替代前端2层 sum |
| 7 | VIP 价格统一 | 中 | 待做 | data.ts vs SQL 不匹配 |
| 8 | 360天金库计划加入前端 | 低 | 待做 | data.ts 缺 360_DAYS |
| 9 | 邀请链接支持自定义安置 | 中 | 待做 | UI + 链接生成 |
| 10 | 交易记录类型完善 | 低 | 待做 | 加直推/团队/节点奖励类型 |
| 11 | referral_earnings 列更新 | 低 | 待做 | 死字段修复 |
| 12 | API wrapper: getRankStatus + getUserTeamStats | 中 | 待做 | 前端无法调用 |
| 13 | vault_deposits 与 vault_positions 表统一 | 低 | 待做 | distribute-revenue 用错表 |

## 修复记录

### Task 1: 同级奖励 + 越级奖励
- 日期: 2026-03-28
- 状态: 进行中
- 改动: settle_team_commission 增加 same_rank_bonus(10%) + override_bonus(5%)
