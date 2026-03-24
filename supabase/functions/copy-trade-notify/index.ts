import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Copy Trade Notifier — Send Telegram alerts for new copy trade signals
 *
 * Called by copy-trade-executor when execution_mode = "signal"
 * Also sends alerts for position closes (SL/TP hit)
 *
 * Runs every 2 minutes via cron, checks for unnotified orders
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "8707941134:AAHVuVgFSv4x1DsesARmLtPLT3x_RVhQO9I";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegram(chatId: string, text: string) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.warn(`Telegram send failed for ${chatId}:`, e);
  }
}

function formatSignalMessage(order: any): string {
  const side = order.side === "LONG" ? "🟢 LONG" : "🔴 SHORT";
  const symbol = order.symbol.replace("-USDT", "");
  return `
<b>📊 CoinMax AI Signal</b>

${side} <b>${symbol}/USDT</b>
💰 Size: $${order.size_usd?.toFixed(0) || "?"}
📈 Entry: $${order.entry_price?.toFixed(2) || "?"}
🛑 SL: $${order.stop_loss?.toFixed(2) || "?"}
🎯 TP: $${order.take_profit?.toFixed(2) || "?"}
⚡ Leverage: ${order.leverage}x

🤖 Model: ${order.primary_model || "AI"}
📋 Strategy: ${order.strategy_type || "?"}

⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
`.trim();
}

function formatCloseMessage(order: any): string {
  const pnl = order.pnl_usd || 0;
  const emoji = pnl >= 0 ? "✅" : "❌";
  const symbol = order.symbol.replace("-USDT", "");
  return `
${emoji} <b>Position Closed</b>

<b>${symbol}/USDT</b> ${order.side}
Entry: $${order.entry_price?.toFixed(2)} → Exit: $${order.exit_price?.toFixed(2)}
PnL: <b>${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${order.pnl_pct?.toFixed(2)}%)</b>
Fee: $${order.fee_usd?.toFixed(2) || "0"}

🤖 ${order.primary_model} · ${order.strategy_type}
`.trim();
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let sent = 0;

  // Find users with Telegram chat_id who have signal mode
  // For now, get chat_ids from profiles table
  const { data: configs } = await supabase
    .from("user_trade_configs")
    .select("wallet_address, execution_mode")
    .eq("is_active", true)
    .in("execution_mode", ["signal", "semi-auto", "full-auto"]);

  if (!configs?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "no active signal configs" }));
  }

  // Get telegram chat_ids for these wallets
  const wallets = configs.map(c => c.wallet_address);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("wallet_address, telegram_chat_id")
    .in("wallet_address", wallets)
    .not("telegram_chat_id", "is", null);

  const chatMap = new Map<string, string>();
  for (const p of (profiles || [])) {
    if (p.telegram_chat_id) chatMap.set(p.wallet_address, p.telegram_chat_id);
  }

  // Find recent unnotified open orders (last 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: newOrders } = await supabase
    .from("copy_trade_orders")
    .select("*")
    .in("user_wallet", wallets)
    .in("status", ["filled", "queued"])
    .gte("opened_at", fiveMinAgo)
    .is("exchange_response", null); // not yet notified

  for (const order of (newOrders || [])) {
    const chatId = chatMap.get(order.user_wallet);
    if (!chatId) continue;
    await sendTelegram(chatId, formatSignalMessage(order));
    sent++;
  }

  // Find recently closed orders (last 5 min)
  const { data: closedOrders } = await supabase
    .from("copy_trade_orders")
    .select("*")
    .in("user_wallet", wallets)
    .eq("status", "closed")
    .gte("closed_at", fiveMinAgo);

  for (const order of (closedOrders || [])) {
    const chatId = chatMap.get(order.user_wallet);
    if (!chatId) continue;
    await sendTelegram(chatId, formatCloseMessage(order));
    sent++;
  }

  return new Response(JSON.stringify({ sent, users: chatMap.size }), {
    headers: { "Content-Type": "application/json" },
  });
});
