import type { Env, BotUser, ToolResult } from "../types";
import { getDb } from "../db";

export async function viewLogs(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const limit = Math.min(parseInt(params.limit || "15"), 30);

  let query = db.from("operation_logs")
    .select("admin_username, admin_role, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.action) query = query.eq("action", params.action);

  const { data } = await query;

  if (!data?.length) return { text: "暂无操作日志" };

  const lines = data.map(l => {
    const time = new Date(l.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `<code>${time}</code> ${l.action} ${l.target_type} ${l.target_id?.slice(0, 8) || ""}\n  by ${l.admin_username} (${l.admin_role})`;
  });

  return { text: `<b>操作日志 (${data.length})</b>\n\n${lines.join("\n\n")}` };
}
