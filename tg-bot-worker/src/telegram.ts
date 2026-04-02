import type { Env } from "./types";

const TG = "https://api.telegram.org/bot";

export async function sendMessage(env: Env, chatId: number, text: string, opts?: {
  parseMode?: "HTML" | "Markdown";
  replyMarkup?: unknown;
}) {
  // Telegram 4096 char limit — chunk if needed
  const chunks = chunkText(text, 4000);
  for (const chunk of chunks) {
    await fetch(`${TG}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: opts?.parseMode || "HTML",
        reply_markup: opts?.replyMarkup,
      }),
    });
  }
}

export async function editMessage(env: Env, chatId: number, messageId: number, text: string) {
  await fetch(`${TG}${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
    }),
  });
}

export async function answerCallback(env: Env, callbackId: string, text?: string) {
  await fetch(`${TG}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

export async function downloadFile(env: Env, fileId: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`${TG}${env.TELEGRAM_BOT_TOKEN}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data: any = await res.json();
  if (!data.ok) return null;
  const filePath = data.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  return fileRes.arrayBuffer();
}

export function confirmButtons(actionId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ 确认执行", callback_data: `confirm:${actionId}` },
      { text: "❌ 取消", callback_data: `cancel:${actionId}` },
    ]],
  };
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > i + max / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
