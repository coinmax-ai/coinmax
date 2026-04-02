import type { BotRole } from "./types";

const PERMISSIONS: Record<BotRole, string[]> = {
  superadmin: [
    "query", "modify", "create_node", "deploy", "manage_roles",
    "view_logs", "tickets", "assign_tickets", "diagnose",
    "ai_analyze", "vision", "bridge", "manage_config",
  ],
  admin: [
    "query", "modify", "create_node", "view_logs",
    "tickets", "assign_tickets", "diagnose", "ai_analyze",
    "vision", "bridge",
  ],
  engineer: [
    "query", "view_logs", "tickets", "assign_tickets",
    "diagnose", "ai_analyze", "vision",
  ],
  support: [
    "query_masked", "tickets", "vision",
  ],
  customer: [
    "tickets", "vision",
  ],
  pending: [],
};

export function hasPermission(role: BotRole, perm: string): boolean {
  return PERMISSIONS[role]?.includes(perm) ?? false;
}

export function getRoleLabel(role: BotRole): string {
  const labels: Record<BotRole, string> = {
    superadmin: "超级管理员",
    admin: "管理员",
    engineer: "工程师",
    support: "客服",
    customer: "客户",
    pending: "待审批",
  };
  return labels[role] || role;
}

export function canQuery(role: BotRole): boolean {
  return hasPermission(role, "query") || hasPermission(role, "query_masked");
}

export function shouldMaskData(role: BotRole): boolean {
  return !hasPermission(role, "query");
}
