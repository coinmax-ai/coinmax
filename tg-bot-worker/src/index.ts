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
import { queryTeam, queryEarnings } from "./tools/team";
import { verifyOnchain } from "./tools/onchain";

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
      // Auto-approve as admin (read-only) — per business requirement
      user = await registerBotUser(env, chatId, username);
      const db = getDb(env);
      await db.from("bot_users").update({
        role: "admin",
        is_active: true,
        approved_by: "auto",
      }).eq("telegram_chat_id", chatId);
      user.role = "admin";
      user.is_active = true;

      // Notify superadmins
      const { data: admins } = await db.from("bot_users").select("telegram_chat_id").eq("role", "superadmin").eq("is_active", true);
      for (const admin of admins || []) {
        await sendMessage(env, admin.telegram_chat_id,
          `🆕 新管理员加入 (自动审批):\n@${username || "无"} | Chat ID: <code>${chatId}</code>\n角色: admin (只读)`);
      }

      await sendMessage(env, chatId,
        `👋 欢迎使用 CoinMax Bot!\n\n你已自动获得 <b>管理员</b> 权限（只读，不可修改数据）。\n\n你可以：\n• 查询用户/金库/节点数据\n• 查看团队和收益\n• 验证链上数据\n• 提交工单\n• 查看操作日志\n\n直接用中文跟我说你想做什么就行！`);
      return c.text("ok");
    }
    const roleDesc = user.role === "superadmin"
      ? "你拥有完整管理权限"
      : user.role === "admin"
        ? "你可以查看所有数据（只读），提交工单"
        : `当前角色: ${getRoleLabel(user.role)}`;
    await sendMessage(env, chatId,
      `你好 ${msg.from.first_name}! 角色: <b>${getRoleLabel(user.role)}</b>\n${roleDesc}\n\n直接跟我说你想做什么！`);
    return c.text("ok");
  }

  // Reject if somehow not registered
  if (!user || !user.is_active) {
    await sendMessage(env, chatId, "请先发 /start 注册。");
    return c.text("ok");
  }

  // Handle image/document (vision + file analysis)
  if (msg.photo?.length || msg.document) {
    const isPhoto = !!msg.photo?.length;
    const fileId = isPhoto ? msg.photo![msg.photo!.length - 1].file_id : msg.document!.file_id;
    const fileName = msg.document?.file_name || "photo";
    const mimeType = msg.document?.mime_type || "image/jpeg";
    const isImage = mimeType.startsWith("image/") || isPhoto;
    const isPdf = mimeType === "application/pdf";
    const isSpreadsheet = mimeType.includes("spreadsheet") || mimeType.includes("excel") || fileName.endsWith(".xlsx") || fileName.endsWith(".csv");
    const isText = mimeType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".json") || fileName.endsWith(".log") || fileName.endsWith(".csv");

    await sendMessage(env, chatId, isImage ? "🔍 正在识别图片..." : `📄 正在分析文件 ${fileName}...`);

    const fileData = await downloadFile(env, fileId);
    if (!fileData) {
      await sendMessage(env, chatId, "无法下载文件，可能文件过大（>20MB限制）");
      return c.text("ok");
    }

    const history = await loadConversation(env, chatId);
    const historyContext = history.slice(-3).map(h => `${h.role}: ${h.content}`).join("\n");

    let analysis: string;
    const userPrompt = text || "";

    if (isImage) {
      // GPT-4o Vision for images/screenshots
      const bytes = new Uint8Array(fileData);
      // Chunk base64 encoding to avoid stack overflow on large files
      let base64 = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        base64 += btoa(String.fromCharCode(...bytes.slice(i, i + 8192)));
      }
      const dataUrl = `data:${mimeType};base64,${base64}`;

      analysis = await chat(env, [
        {
          role: "system",
          content: `你是 CoinMax 的智能助手"小C"。用户发了一张图片，请仔细识别内容。
你擅长识别：
- 交易截图（提取钱包地址、金额、时间、交易hash）
- 错误截图（识别错误信息、分析原因、建议修复方案）
- 区块链浏览器截图（提取交易详情）
- 表格/数据截图（提取数据整理成文字）
- 聊天截图（提取关键信息）
- 任何其他内容（描述并分析）

如果识别到钱包地址或交易hash，主动提供可以进一步查询的建议。
用 HTML 格式回复（<b>粗体</b> <code>代码</code>），中文。

对话上下文：
${historyContext}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt || "请识别并分析这张图片的内容" },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ], { model: "gpt-4o", maxTokens: 2000 });

    } else if (isText || isSpreadsheet) {
      // Text/CSV/JSON files — read content directly
      const decoder = new TextDecoder("utf-8");
      let content = decoder.decode(fileData);
      if (content.length > 10000) content = content.slice(0, 10000) + "\n...(截断，共" + content.length + "字符)";

      analysis = await chat(env, [
        {
          role: "system",
          content: `你是 CoinMax 的智能助手"小C"。用户上传了文件 "${fileName}" (${mimeType})。
分析文件内容，提取关键信息。如果是：
- CSV/表格数据：整理成可读格式，统计关键数据
- JSON：解析并总结结构和关键字段
- 日志文件：找出错误和异常
- 配置文件：检查是否有问题
用 HTML 格式回复，中文。

对话上下文：
${historyContext}`,
        },
        { role: "user", content: `${userPrompt ? userPrompt + "\n\n" : ""}文件内容:\n${content}` },
      ], { maxTokens: 2000 });

    } else if (isPdf) {
      // PDF — can't parse directly, use vision if small enough
      const bytes = new Uint8Array(fileData);
      if (bytes.length > 5 * 1024 * 1024) {
        analysis = "PDF 文件过大（>5MB），暂时无法分析。请截图发送关键页面，或转成文本/CSV格式。";
      } else {
        let base64 = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          base64 += btoa(String.fromCharCode(...bytes.slice(i, i + 8192)));
        }
        // Try sending PDF as image to GPT-4o (works for single-page PDFs)
        analysis = await chat(env, [
          { role: "system", content: `分析用户上传的PDF文件。用 HTML 格式中文回复。\n对话上下文：\n${historyContext}` },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt || `请分析这个PDF文件 "${fileName}"` },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
            ],
          },
        ], { model: "gpt-4o", maxTokens: 2000 });
      }
    } else {
      analysis = `暂不支持 ${mimeType} 格式的文件分析。支持的格式：图片(jpg/png/gif)、文本(txt/csv/json/log)、PDF`;
    }

    await saveMessage(env, chatId, "user", `[上传${isImage ? "图片" : "文件"}: ${fileName}] ${userPrompt}`);
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

  const CTO_CHAT_ID = 7120732225; // CTO superadmin

  const systemPrompt = `你是 CoinMax 的智能运维助手，名叫"小C"。你的风格：
- 像一个专业但友好的同事在跟管理员沟通
- 中文回复，简洁有条理
- 查询结果用清晰的格式展示，但不要太机械
- 如果数据有异常要主动提醒
- 回复用 HTML 格式（Telegram支持 <b>粗体</b> <code>代码</code> <i>斜体</i>）
- 不要用 Markdown 格式

用户角色: ${getRoleLabel(user.role)}
${user.role === "admin" ? "⚠️ 此用户是管理员（只读），不能修改/删除数据。如果他们要修改数据，告诉他们需要联系 superadmin。" : ""}

<b>客服引导规则</b>（当用户描述的问题你无法直接解决时）：
1. 先询问关键信息：钱包地址、问题截图、详细描述
2. 用你的查询能力初步排查（查数据库、查链上）
3. 如果确认是 bug 或需要代码修改，自动创建工单
4. 把工单和你的初步分析发给 CTO (tg:${CTO_CHAT_ID})
${knowledgeStr}`;

  let finalResponse: string;

  if (intent.tool === "chat") {
    // Pure conversation — with escalation detection
    finalResponse = await chat(env, [
      {
        role: "system",
        content: systemPrompt + `

如果你判断用户在描述一个问题/bug但信息不够，引导他们提供：
1. 相关钱包地址
2. 截图（让他们直接发图片）
3. 问题详细描述（什么时间发生、预期结果 vs 实际结果）

如果你已经收集够信息并且判断需要技术处理，在回复末尾加上这行（一字不差）：
[ESCALATE:需要技术处理的简短描述]

这会自动创建工单发给 CTO。`,
      },
      ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: text },
    ]);

    // Check for escalation trigger
    const escalateMatch = finalResponse.match(/\[ESCALATE:(.+?)\]/);
    if (escalateMatch) {
      finalResponse = finalResponse.replace(/\[ESCALATE:.+?\]/, "").trim();

      // Collect conversation context for the ticket
      const recentHistory = history.slice(-6).map(h => `${h.role}: ${h.content}`).join("\n");

      // Create ticket
      const ticketResult = await submitTicket(env, user, {
        title: escalateMatch[1],
        description: `用户 @${username || chatId} 报告的问题:\n\n${recentHistory}\n\n最新消息: ${text}`,
        priority: "high",
        category: "bug",
      });

      // Notify CTO
      const CTO_CHAT_ID = 7120732225;
      await sendMessage(env, CTO_CHAT_ID,
        `🚨 <b>新工单 (Bot自动创建)</b>\n\n标题: ${escalateMatch[1]}\n来源: @${username || "tg:" + chatId}\n\n<b>对话上下文:</b>\n${recentHistory.slice(-1000)}\n\n<b>小C初步分析:</b>\n${finalResponse.slice(0, 500)}`);

      finalResponse += `\n\n📋 我已经帮你创建了工单并通知了技术负责人，他们会尽快处理。`;
    }
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
    case "query_team": return queryTeam(env, user, params);
    case "query_earnings": return queryEarnings(env, user, params);
    case "verify_onchain": return verifyOnchain(env, user, params);
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
