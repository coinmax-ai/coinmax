export type BotRole = "superadmin" | "admin" | "engineer" | "support" | "customer" | "pending";

export interface BotUser {
  id: string;
  telegram_chat_id: number;
  telegram_username: string | null;
  role: BotRole;
  permissions: string[];
  is_active: boolean;
}

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OPENAI_API_KEY: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from: { id: number; username?: string; first_name: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: { file_id: string }[];
  document?: { file_id: string; file_name?: string; mime_type?: string };
  caption?: string;
}

export interface CallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

export interface ToolResult {
  text: string;
  data?: unknown;
}
