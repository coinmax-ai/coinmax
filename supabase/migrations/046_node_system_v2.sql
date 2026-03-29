-- ═══════════════════════════════════════════════════════════════
-- Migration 046: Node System V2 — Activation + Milestone rules
--
-- Key changes:
-- 1. MAX activation: V1(100U+3MINI) V2-V6(vault deposit only)
-- 2. MINI activation: V1-V4(vault deposit only)
-- 3. MAX milestones: Day 15(V1) 30(V2) 60(V4) 120(V6)
-- 4. MINI milestones: Day 30(V2 unlock) 90(V2 full/V4 freeze)
-- 5. settle_node_fixed_yield: MAX=released, MINI=locked
-- 6. check_node_milestones: pass/fail actions updated
-- ═══════════════════════════════════════════════════════════════

-- A) Update activation tiers
INSERT INTO system_config (key, value) VALUES
  ('MAX_ACTIVATION_TIERS', '[
    {"rank":"V1","vault_deposit":100,"required_mini_referrals":3},
    {"rank":"V2","vault_deposit":300,"required_mini_referrals":0},
    {"rank":"V3","vault_deposit":500,"required_mini_referrals":0},
    {"rank":"V4","vault_deposit":600,"required_mini_referrals":0},
    {"rank":"V5","vault_deposit":800,"required_mini_referrals":0},
    {"rank":"V6","vault_deposit":1000,"required_mini_referrals":0}
  ]'),
  ('MINI_ACTIVATION_TIERS', '[
    {"rank":"V1","vault_deposit":100,"required_mini_referrals":0},
    {"rank":"V2","vault_deposit":300,"required_mini_referrals":0},
    {"rank":"V3","vault_deposit":500,"required_mini_referrals":0},
    {"rank":"V4","vault_deposit":600,"required_mini_referrals":0}
  ]'),
  ('MAX_MILESTONES', '[
    {"rank":"V1","days":15,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"16-30","desc":"V1达标继续领取收益"},
    {"rank":"V2","days":30,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"31-60","desc":"V2达标继续领取收益"},
    {"rank":"V4","days":60,"pass_action":"CONTINUE","fail_action":"PAUSE","earning_range":"61-120","desc":"V4达标继续领取收益"},
    {"rank":"V6","days":120,"pass_action":"UNLOCK_FROZEN","fail_action":"KEEP_FROZEN","earning_range":null,"desc":"V6达标解锁6000U铸造MA"}
  ]'),
  ('MINI_MILESTONES', '[
    {"rank":"V2","days":30,"pass_action":"UNLOCK_PARTIAL","fail_action":"KEEP_LOCKED","earning_range":"1-60","desc":"V2达标解锁1-60天收益"},
    {"rank":"V2","days":90,"pass_action":"UNLOCK_ALL","fail_action":"DESTROY","earning_range":"1-90","desc":"V2达标解锁全部收益"},
    {"rank":"V4","days":90,"pass_action":"UNLOCK_FROZEN","fail_action":"KEEP_FROZEN","earning_range":null,"desc":"V4达标解锁1000U铸造MA"}
  ]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
