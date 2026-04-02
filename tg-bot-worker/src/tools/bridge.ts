import type { Env, BotUser, ToolResult } from "../types";
import { addOperationLog } from "../db";

export async function triggerBridge(env: Env, user: BotUser): Promise<ToolResult> {
  // Call vault-bridge-flush edge function
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/vault-bridge-flush`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });

  const data = await res.json() as Record<string, unknown>;

  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "bridge", "vault_bridge_flush", null as unknown as string,
    { status: data.status, bridged: data.bridged, source: "tg_bot" });

  if (data.status === "skipped") {
    return { text: `⏭️ 跳过: ${data.reason}\nSW余额: $${data.swBalance || 0}\nBB余额: $${data.bbBalance || 0}` };
  }

  if (data.status === "FLUSHED") {
    return { text: `✅ 跨链+分配完成!\n金额: $${data.bridged}\nARB到账: $${data.arbBal}\nflushTx: ${data.flushTx}` };
  }

  return { text: `Bridge 状态: ${data.status}\n详情: ${JSON.stringify(data).slice(0, 500)}` };
}
