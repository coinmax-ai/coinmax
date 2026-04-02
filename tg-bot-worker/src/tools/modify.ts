import type { Env, BotUser, ToolResult } from "../types";
import { getDb, addOperationLog } from "../db";

export async function createNode(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const wallet = params.wallet;
  const nodeType = (params.nodeType || "MAX").toUpperCase();
  const tag = params.tag || "Bot创建";

  if (!wallet) return { text: "请提供钱包地址" };
  if (nodeType !== "MAX" && nodeType !== "MINI") return { text: "节点类型必须是 MAX 或 MINI" };

  // Check if user exists
  const { data: profile } = await db.from("profiles").select("id").ilike("wallet_address", wallet).single();
  if (!profile) return { text: `用户 ${wallet} 不存在` };

  // Check existing node
  const { data: existing } = await db
    .from("node_memberships")
    .select("id")
    .eq("user_id", profile.id)
    .eq("node_type", nodeType)
    .in("status", ["ACTIVE", "PENDING_MILESTONES"]);

  if (existing?.length) return { text: `${wallet.slice(0, 10)}... 已有 ${nodeType} 节点` };

  // Create via purchase_node RPC
  const { error } = await db.rpc("purchase_node", {
    addr: wallet,
    node_type_param: nodeType,
    tx_hash: null,
    payment_mode_param: "FULL",
  });

  if (error) return { text: `创建失败: ${error.message}` };

  // Tag it
  await db.from("node_memberships")
    .update({ tag })
    .eq("user_id", profile.id)
    .is("tx_hash", null)
    .is("tag", null);

  // Log
  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "create", "node_membership", wallet,
    { nodeType, tag, source: "tg_bot", operator: user.telegram_chat_id });

  return { text: `✅ 已为 ${wallet.slice(0, 10)}... 创建 ${nodeType} 节点 (标签: ${tag})` };
}

export async function modifyData(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const { table, id } = params;
  let updates: Record<string, unknown>;

  try {
    updates = JSON.parse(params.updates || "{}");
  } catch {
    return { text: "updates 参数格式错误，需要 JSON" };
  }

  const allowedTables = ["profiles", "node_memberships", "vault_positions", "system_config"];
  if (!allowedTables.includes(table)) {
    return { text: `不允许修改表 ${table}。允许: ${allowedTables.join(", ")}` };
  }

  const { error } = await db.from(table).update(updates).eq("id", id);
  if (error) return { text: `修改失败: ${error.message}` };

  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "update", table, id,
    { updates, source: "tg_bot", operator: user.telegram_chat_id });

  return { text: `✅ 已更新 ${table}.${id}\n修改: ${JSON.stringify(updates)}` };
}
