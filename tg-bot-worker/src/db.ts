import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Env, BotUser } from "./types";

let _client: SupabaseClient | null = null;

export function getDb(env: Env): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  return _client;
}

export async function getBotUser(env: Env, chatId: number): Promise<BotUser | null> {
  const db = getDb(env);
  const { data } = await db
    .from("bot_users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .single();
  return data;
}

export async function registerBotUser(env: Env, chatId: number, username?: string): Promise<BotUser> {
  const db = getDb(env);
  const { data } = await db
    .from("bot_users")
    .upsert({
      telegram_chat_id: chatId,
      telegram_username: username || null,
      role: "pending",
    }, { onConflict: "telegram_chat_id" })
    .select()
    .single();
  return data!;
}

export async function loadConversation(env: Env, chatId: number): Promise<{ role: string; content: string }[]> {
  const db = getDb(env);
  const { data } = await db
    .from("bot_conversations")
    .select("message_history")
    .eq("telegram_chat_id", chatId)
    .single();
  if (!data) return [];
  const history = data.message_history as { role: string; content: string }[];
  return history.slice(-10); // last 10 messages
}

export async function saveMessage(env: Env, chatId: number, role: string, content: string) {
  const db = getDb(env);
  const { data: existing } = await db
    .from("bot_conversations")
    .select("id, message_history")
    .eq("telegram_chat_id", chatId)
    .single();

  const msg = { role, content, ts: new Date().toISOString() };

  if (existing) {
    const history = [...(existing.message_history as unknown[]), msg].slice(-20);
    await db.from("bot_conversations").update({
      message_history: history,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await db.from("bot_conversations").insert({
      telegram_chat_id: chatId,
      message_history: [msg],
    });
  }
}

export async function addOperationLog(
  env: Env, username: string, role: string,
  action: string, targetType: string, targetId?: string, details?: Record<string, unknown>,
) {
  const db = getDb(env);
  await db.from("operation_logs").insert({
    admin_username: username,
    admin_role: role,
    action,
    target_type: targetType,
    target_id: targetId || null,
    details: details || {},
  });
}
