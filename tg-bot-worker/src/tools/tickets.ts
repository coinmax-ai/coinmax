import type { Env, BotUser, ToolResult } from "../types";
import { getDb, addOperationLog } from "../db";

export async function submitTicket(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const { data, error } = await db.from("support_tickets").insert({
    title: params.title || "未命名工单",
    description: params.description || "",
    submitted_by: user.telegram_chat_id,
    priority: params.priority || "medium",
    category: params.category || "inquiry",
  }).select("id").single();

  if (error) return { text: `工单创建失败: ${error.message}` };

  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "create", "support_ticket", data!.id, { title: params.title, priority: params.priority });

  return { text: `✅ 工单已创建\nID: <code>${data!.id.slice(0, 8)}</code>\n标题: ${params.title}\n优先级: ${params.priority || "medium"}` };
}

export async function listTickets(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  let query = db.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(10);

  if (params.status) query = query.eq("status", params.status);
  if (params.assignedToMe === "true") query = query.eq("assigned_to", user.telegram_chat_id);

  const { data } = await query;

  if (!data?.length) return { text: "暂无工单" };

  const lines = data.map(t => {
    const pMap: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
    const pIcon = pMap[t.priority as string] || "⚪";
    return `${pIcon} <b>${t.title}</b>\n   ${t.status} | ${t.category || "-"} | ${new Date(t.created_at).toLocaleDateString()}` +
      (t.assigned_to ? `\n   → 分配给 tg:${t.assigned_to}` : "");
  });

  return { text: `<b>工单列表 (${data.length})</b>\n\n${lines.join("\n\n")}` };
}

export async function assignTicket(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const { error } = await db.from("support_tickets").update({
    assigned_to: parseInt(params.assignTo),
    status: "in_progress",
    updated_at: new Date().toISOString(),
  }).eq("id", params.ticketId);

  if (error) return { text: `分配失败: ${error.message}` };

  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "update", "support_ticket", params.ticketId, { assignedTo: params.assignTo });

  return { text: `✅ 工单已分配给 tg:${params.assignTo}` };
}
