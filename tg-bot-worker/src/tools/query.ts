import type { Env, BotUser, ToolResult } from "../types";
import { getDb } from "../db";
import { shouldMaskData } from "../auth";

export async function queryUser(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const walletInput = params.wallet || params.wallets || "";

  // Support multiple wallets (comma or space separated)
  const wallets = walletInput.split(/[,\s\n]+/).filter(w => w.startsWith("0x"));
  if (!wallets.length) return { text: "请提供钱包地址" };

  const results: string[] = [];
  const mask = shouldMaskData(user.role);

  for (const wallet of wallets) {
    const { data: profile } = await db
      .from("profiles")
      .select("id, wallet_address, display_name, rank, node_type, referrer_id, total_deposited, referral_earnings, created_at")
      .ilike("wallet_address", wallet.trim())
      .single();

    if (!profile) {
      results.push(`❌ <code>${wallet.slice(0, 10)}...</code> — 数据库中不存在`);
      continue;
    }

    const addr = mask ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;

    // Vault positions
    const { data: vaults } = await db
      .from("vault_positions")
      .select("principal, plan_type, daily_rate, status, start_date")
      .eq("user_id", profile.id);

    const activeVaults = (vaults || []).filter(v => v.status === "ACTIVE");
    const totalVault = activeVaults.reduce((s, v) => s + Number(v.principal), 0);

    // Node memberships
    const { data: nodes } = await db
      .from("node_memberships")
      .select("node_type, status, contribution_amount, frozen_amount, tag, tx_hash, created_at")
      .eq("user_id", profile.id);

    // Recent transactions
    const { data: txs } = await db
      .from("transactions")
      .select("type, amount, status, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5);

    const nodeLines = (nodes || []).map(n => {
      const source = n.tx_hash ? "链上支付" : "手动创建";
      return `  ${n.node_type} | $${n.contribution_amount}+$${n.frozen_amount}冻结 | ${n.status} | ${source}${n.tag ? ` | ${n.tag}` : ""}`;
    });

    const vaultLines = activeVaults.map(v =>
      `  $${Number(v.principal).toLocaleString()} | ${v.plan_type} | ${(Number(v.daily_rate) * 100).toFixed(1)}%/天 | ${new Date(v.start_date).toLocaleDateString()}`
    );

    const txLines = (txs || []).map(t =>
      `  ${t.type} | $${Number(t.amount).toLocaleString()} | ${t.status} | ${new Date(t.created_at).toLocaleDateString()}`
    );

    results.push(`<b>📋 ${addr}</b>
等级: ${profile.rank || "无"} | 注册: ${new Date(profile.created_at).toLocaleDateString()}

<b>💰 金库</b> (${activeVaults.length}个活跃, 总计$${totalVault.toLocaleString()})
${vaultLines.length ? vaultLines.join("\n") : "  无活跃仓位"}
累计存入: $${Number(profile.total_deposited || 0).toLocaleString()}

<b>🖥 节点</b> (${nodes?.length || 0}个)
${nodeLines.length ? nodeLines.join("\n") : "  无节点"}

<b>📝 最近交易</b>
${txLines.length ? txLines.join("\n") : "  无"}${!mask ? `\n\n推荐收益: $${Number(profile.referral_earnings || 0).toFixed(2)}` : ""}`);
  }

  return { text: results.join("\n\n━━━━━━━━━━━━━━\n\n"), data: { count: wallets.length } };
}

export async function queryVault(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);

  if (params.summary === "true" || !params.wallet) {
    // Summary stats
    const { data, count } = await db
      .from("vault_positions")
      .select("principal", { count: "exact" })
      .eq("status", "ACTIVE");

    const total = (data || []).reduce((s, v) => s + Number(v.principal), 0);

    const { data: recent } = await db
      .from("transactions")
      .select("amount, created_at")
      .eq("type", "VAULT_DEPOSIT")
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      text: `<b>金库总览</b>
活跃仓位: ${count || 0} 个
总锁仓: $${total.toLocaleString()}

<b>最近存入</b>
${(recent || []).map(r => `  $${Number(r.amount).toLocaleString()} | ${new Date(r.created_at).toLocaleString()}`).join("\n")}`,
    };
  }

  // Specific user vault
  const { data: profile } = await db.from("profiles").select("id").ilike("wallet_address", params.wallet).single();
  if (!profile) return { text: `未找到 ${params.wallet}` };

  const { data: positions } = await db
    .from("vault_positions")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const lines = (positions || []).map(p =>
    `  $${Number(p.principal).toLocaleString()} | ${p.plan_type} | ${p.status} | ${new Date(p.created_at).toLocaleDateString()}`
  );

  return { text: `<b>${params.wallet.slice(0, 10)}... 金库仓位</b>\n${lines.join("\n") || "无"}` };
}

export async function queryNode(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);

  if (params.summary === "true" || !params.wallet) {
    const { count: maxCount } = await db.from("node_memberships").select("*", { count: "exact", head: true }).eq("node_type", "MAX");
    const { count: miniCount } = await db.from("node_memberships").select("*", { count: "exact", head: true }).eq("node_type", "MINI");
    const { count: manualCount } = await db.from("node_memberships").select("*", { count: "exact", head: true }).is("tx_hash", null);

    return {
      text: `<b>节点总览</b>
MAX 节点: ${maxCount || 0}
MINI 节点: ${miniCount || 0}
手动创建: ${manualCount || 0}
链上支付: ${(maxCount || 0) + (miniCount || 0) - (manualCount || 0)}`,
    };
  }

  const { data: profile } = await db.from("profiles").select("id").ilike("wallet_address", params.wallet).single();
  if (!profile) return { text: `未找到 ${params.wallet}` };

  const { data: nodes } = await db.from("node_memberships").select("*").eq("user_id", profile.id);
  const lines = (nodes || []).map(n =>
    `  ${n.node_type} | $${n.contribution_amount} | ${n.status} | ${n.tag || "-"} | ${n.tx_hash ? "链上" : "手动"}`
  );

  return { text: `<b>${params.wallet.slice(0, 10)}... 节点</b>\n${lines.join("\n") || "无"}` };
}

export async function queryTransaction(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const limit = parseInt(params.limit || "10");

  let query = db.from("transactions").select("amount, type, status, tx_hash, created_at, user_id").order("created_at", { ascending: false }).limit(limit);

  if (params.type) query = query.eq("type", params.type);
  if (params.wallet) {
    const { data: profile } = await db.from("profiles").select("id").ilike("wallet_address", params.wallet).single();
    if (profile) query = query.eq("user_id", profile.id);
  }

  const { data } = await query;
  const lines = (data || []).map(t =>
    `  ${t.type} | $${Number(t.amount).toLocaleString()} | ${t.status} | ${new Date(t.created_at).toLocaleString().slice(0, 16)}`
  );

  return { text: `<b>交易记录 (${data?.length || 0})</b>\n${lines.join("\n") || "无"}` };
}
