import { Hono } from "hono";
import type { Env, TelegramUpdate, BotUser } from "./types";
import { getBotUser, registerBotUser, loadConversation, saveMessage, getDb, addOperationLog } from "./db";
import { sendMessage, confirmButtons, answerCallback, downloadFile } from "./telegram";
import { hasPermission, getRoleLabel, canQuery } from "./auth";
import { chat, analyzeImage } from "./ai/openai";
import { parseIntent } from "./ai/intent";
import { searchKnowledge, addKnowledge } from "./ai/memory";
import { queryUser, queryVault, queryNode, queryTransaction } from "./tools/query";
import { createNode, modifyData } from "./tools/modify";
import { submitTicket, listTickets, assignTicket } from "./tools/tickets";
import { viewLogs } from "./tools/logs";
import { diagnose } from "./tools/diagnose";
import { triggerBridge } from "./tools/bridge";

const app = new Hono<{ Bindings: Env }>();

// Pending confirmations: chatId → { tool, params, expires }
const pendingActions = new Map<number, { tool: string; params: Record<string, string>; user: BotUser; expires: number }>();

app.post("/webhook", async (c) => {
  const env = c.env;
  const update: TelegramUpdate = await c.req.json();

  // Handle callback queries (confirm/cancel)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id;
    if (!chatId || !cb.data) return c.text("ok");

    await answerCallback(env, cb.id);

    if (cb.data.startsWith("confirm:")) {
      const pending = pendingActions.get(chatId);
      if (!pending || Date.now() > pending.expires) {
        await sendMessage(env, chatId, "⏰ 操作已过期，请重新发起");
        return c.text("ok");
      }
      pendingActions.delete(chatId);
      const result = await executeTool(env, pending.user, pending.tool, pending.params);
      await sendMessage(env, chatId, result.text);
    } else if (cb.data.startsWith("cancel:")) {
      pendingActions.delete(chatId);
      await sendMessage(env, chatId, "❌ 已取消");
    } else if (cb.data.startsWith("approve:")) {
      // Admin approves a user role
      const [, targetChatId, role] = cb.data.split(":");
      const db = getDb(env);
      await db.from("bot_users").update({ role, is_active: true, approved_by: `tg:${cb.from.id}` })
        .eq("telegram_chat_id", parseInt(targetChatId));
      await sendMessage(env, chatId, `✅ 已授予 tg:${targetChatId} ${getRoleLabel(role as any)} 角色`);
      await sendMessage(env, parseInt(targetChatId), `🎉 你的角色已被审批为: <b>${getRoleLabel(role as any)}</b>\n现在可以开始使用 Bot 了！`);
    }

    return c.text("ok");
  }

  const msg = update.message;
  if (!msg || !msg.chat) return c.text("ok");

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const text = msg.text || msg.caption || "";

  // Get or register user
  let user = await getBotUser(env, chatId);

  // Handle /start command
  if (text === "/start") {
    if (!user) {
      user = await registerBotUser(env, chatId, username);
      await sendMessage(env, chatId,
        `👋 欢迎使用 CoinMax Bot!\n\n你已注册，当前状态: <b>待审批</b>\n请等待管理员审批你的角色。\n\n你的 Telegram ID: <code>${chatId}</code>`);
      // Notify superadmins
      const db = getDb(env);
      const { data: admins } = await db.from("bot_users").select("telegram_chat_id").eq("role", "superadmin").eq("is_active", true);
      for (const admin of admins || []) {
        await sendMessage(env, admin.telegram_chat_id,
          `🆕 新用户申请:\nUsername: @${username || "无"}\nChat ID: <code>${chatId}</code>`,
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: "授予 Admin", callback_data: `approve:${chatId}:admin` },
                  { text: "授予 Engineer", callback_data: `approve:${chatId}:engineer` },
                ],
                [
                  { text: "授予 Support", callback_data: `approve:${chatId}:support` },
                  { text: "授予 Customer", callback_data: `approve:${chatId}:customer` },
                ],
              ],
            },
          });
      }
      return c.text("ok");
    }
    await sendMessage(env, chatId,
      `你好 ${msg.from.first_name}! 角色: <b>${getRoleLabel(user.role)}</b>\n\n可以直接用自然语言跟我说你想做什么，例如:\n• 查一下 0x1C78... 的金库数据\n• 系统状态\n• 提交工单：用户提现失败\n• 查看最近操作日志`);
    return c.text("ok");
  }

  // Reject pending users
  if (!user || user.role === "pending" || !user.is_active) {
    await sendMessage(env, chatId, "⏳ 你的账号还未审批，请等待管理员处理。发 /start 查看状态。");
    return c.text("ok");
  }

  // Handle image/document (vision)
  if (msg.photo?.length || msg.document) {
    const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document!.file_id;
    await sendMessage(env, chatId, "🔍 正在分析图片/文档...");

    const fileData = await downloadFile(env, fileId);
    if (!fileData) {
      await sendMessage(env, chatId, "无法下载文件");
      return c.text("ok");
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileData)));
    const mimeType = msg.document?.mime_type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const prompt = text || "请描述这张图片/文档的内容，如果是截图请识别关键信息";
    const analysis = await analyzeImage(env, dataUrl, prompt);

    await saveMessage(env, chatId, "user", `[发送了图片] ${text || ""}`);
    await saveMessage(env, chatId, "assistant", analysis);
    await sendMessage(env, chatId, analysis);
    return c.text("ok");
  }

  if (!text) return c.text("ok");

  // Save user message
  await saveMessage(env, chatId, "user", text);

  // Load context
  const history = await loadConversation(env, chatId);
  const historyStr = history.map(h => `${h.role}: ${h.content}`).join("\n").slice(-2000);

  // Parse intent
  const intent = await parseIntent(env, user, text, historyStr);

  // If confirmation required, store and ask
  if (intent.confirmRequired) {
    const actionId = Date.now().toString(36);
    pendingActions.set(chatId, {
      tool: intent.tool,
      params: intent.params,
      user,
      expires: Date.now() + 120_000, // 2 min
    });

    await sendMessage(env, chatId,
      `⚠️ <b>确认操作</b>\n\n${intent.rawIntent}\n\n工具: ${intent.tool}\n参数: ${JSON.stringify(intent.params, null, 2)}`,
      { replyMarkup: confirmButtons(actionId) });
    return c.text("ok");
  }

  // Execute tool
  const result = await executeTool(env, user, intent.tool, intent.params);

  // ALL responses go through GPT-4o for natural language formatting
  const knowledge = await searchKnowledge(env, text);
  const knowledgeStr = knowledge.length ? `\n相关知识:\n${knowledge.join("\n")}` : "";

  const systemPrompt = `你是 CoinMax 的智能运维助手，名叫"小C"。你的风格：
- 像一个专业但友好的同事在跟管理员沟通
- 中文回复，简洁有条理
- 查询结果用清晰的格式展示，但不要太机械
- 如果数据有异常要主动提醒
- 回复用 HTML 格式（Telegram支持 <b>粗体</b> <code>代码</code> <i>斜体</i>）
- 不要用 Markdown 格式
${knowledgeStr}

用户角色: ${getRoleLabel(user.role)}`;

  let finalResponse: string;

  if (intent.tool === "chat") {
    // Pure conversation
    finalResponse = await chat(env, [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: text },
    ]);
  } else {
    // Tool result → GPT-4o natural language wrap
    finalResponse = await chat(env, [
      { role: "system", content: systemPrompt + "\n\n你刚刚执行了一个操作，下面是原始数据结果。请用自然、专业的语言重新组织这些信息回复用户。保留关键数据但让表达更人性化。如果数据显示有问题要指出。" },
      ...history.slice(-4).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: text },
      { role: "assistant", content: `[工具 ${intent.tool} 执行结果]\n${result.text}` },
      { role: "user", content: "请用自然语言重新整理上面的结果回复给我" },
    ], { maxTokens: 2000 });
  }

  await saveMessage(env, chatId, "assistant", finalResponse);
  await sendMessage(env, chatId, finalResponse);

  // Auto-learn: save useful interactions to knowledge base
  if (intent.tool !== "chat" && result.text.length > 50) {
    try {
      await addKnowledge(env,
        intent.tool.startsWith("query") ? "faq" : "workflow",
        `${intent.rawIntent}`,
        `用户问: ${text.slice(0, 200)}\n工具: ${intent.tool}\n结果摘要: ${result.text.slice(0, 500)}`
      );
    } catch { /* non-critical */ }
  }
  return c.text("ok");
});

async function executeTool(env: Env, user: BotUser, tool: string, params: Record<string, string>) {
  switch (tool) {
    case "query_user": return queryUser(env, user, params);
    case "query_vault": return queryVault(env, user, params);
    case "query_node": return queryNode(env, user, params);
    case "query_transaction": return queryTransaction(env, user, params);
    case "create_node": return createNode(env, user, params);
    case "modify_data": return modifyData(env, user, params);
    case "submit_ticket": return submitTicket(env, user, params);
    case "list_tickets": return listTickets(env, user, params);
    case "assign_ticket": return assignTicket(env, user, params);
    case "view_logs": return viewLogs(env, user, params);
    case "diagnose": return diagnose(env, user, params);
    case "bridge_flush": return triggerBridge(env, user);
    case "manage_role": return manageRole(env, user, params);
    default: return { text: params.message || "我不太理解你的意思，请再说详细一些？" };
  }
}

async function manageRole(env: Env, user: BotUser, params: Record<string, string>) {
  if (!hasPermission(user.role, "manage_roles")) return { text: "❌ 无权限管理角色" };

  const db = getDb(env);
  const targetChatId = parseInt(params.chatId);
  const newRole = params.role;

  const { error } = await db.from("bot_users")
    .update({ role: newRole, approved_by: `tg:${user.telegram_chat_id}` })
    .eq("telegram_chat_id", targetChatId);

  if (error) return { text: `失败: ${error.message}` };

  await addOperationLog(env, user.telegram_username || `tg:${user.telegram_chat_id}`, user.role,
    "update", "bot_user", String(targetChatId), { newRole, source: "tg_bot" });

  await sendMessage(env, targetChatId, `📢 你的角色已更新为: <b>${getRoleLabel(newRole as any)}</b>`);

  return { text: `✅ 已将 tg:${targetChatId} 角色改为 ${getRoleLabel(newRole as any)}` };
}

// Health check
app.get("/", (c) => c.json({ status: "ok", bot: "CoinMax TG Bot" }));

export default app;
