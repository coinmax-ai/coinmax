import type { Env, BotUser } from "../types";
import { chat } from "./openai";
import { hasPermission } from "../auth";

export interface ParsedIntent {
  tool: string;
  params: Record<string, string>;
  confirmRequired: boolean;
  rawIntent: string;
}

const TOOL_DESCRIPTIONS = `
Available tools (respond with JSON):
- query_user: 查询用户信息 {wallet: "0x..."} — requires: query
- query_vault: 查询金库数据 {wallet?: "0x...", summary?: true} — requires: query
- query_node: 查询节点数据 {wallet?: "0x...", summary?: true} — requires: query
- query_transaction: 查询交易记录 {wallet?: "0x...", type?: "VAULT_DEPOSIT"|"NODE_PURCHASE", limit?: 10} — requires: query
- create_node: 创建节点订单 {wallet: "0x...", nodeType: "MAX"|"MINI", tag?: "string"} — requires: create_node, CONFIRM
- modify_data: 修改数据库 {table: "...", id: "...", updates: {...}} — requires: modify, CONFIRM
- submit_ticket: 提交工单 {title: "...", description: "...", priority?: "critical"|"high"|"medium"|"low", category?: "bug"|"feature"|"inquiry"} — requires: tickets
- list_tickets: 查看工单 {status?: "open"|"in_progress", assignedToMe?: true} — requires: tickets
- assign_ticket: 分配工单 {ticketId: "...", assignTo: telegram_chat_id} — requires: assign_tickets, CONFIRM
- view_logs: 查看操作日志 {action?: "...", limit?: 20} — requires: view_logs
- diagnose: 系统诊断 {check?: "funds"|"crons"|"health"|"all"} — requires: diagnose
- bridge_flush: 触发跨链分配 {} — requires: bridge, CONFIRM
- manage_role: 管理Bot角色 {chatId: number, role: "admin"|"engineer"|"support"|"customer"} — requires: manage_roles, CONFIRM
- chat: 普通对话/问答 {message: "..."} — no special permission
- vision: 图片/文档识别 — auto-detected from media
`;

export async function parseIntent(env: Env, user: BotUser, message: string, conversationHistory: string): Promise<ParsedIntent> {
  const permList = Object.entries({
    query: hasPermission(user.role, "query") || hasPermission(user.role, "query_masked"),
    create_node: hasPermission(user.role, "create_node"),
    modify: hasPermission(user.role, "modify"),
    tickets: hasPermission(user.role, "tickets"),
    assign_tickets: hasPermission(user.role, "assign_tickets"),
    view_logs: hasPermission(user.role, "view_logs"),
    diagnose: hasPermission(user.role, "diagnose"),
    bridge: hasPermission(user.role, "bridge"),
    manage_roles: hasPermission(user.role, "manage_roles"),
  }).filter(([, v]) => v).map(([k]) => k);

  const prompt = `You are an intent parser for CoinMax admin bot.
User role: ${user.role} (permissions: ${permList.join(", ")})

Recent conversation:
${conversationHistory}

${TOOL_DESCRIPTIONS}

Parse the user's message into a tool call. If the user doesn't have permission, use "chat" tool and explain they need a higher role.
If the message is general conversation/question, use "chat" tool.

Respond ONLY with JSON: {"tool": "...", "params": {...}, "confirmRequired": true/false, "rawIntent": "one-line summary"}

User message: ${message}`;

  const result = await chat(env, [
    { role: "system", content: prompt },
  ], { temperature: 0.1, maxTokens: 500 });

  try {
    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { tool: "chat", params: { message }, confirmRequired: false, rawIntent: message };
  }
}
