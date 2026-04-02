import type { Env, BotUser, ToolResult } from "../types";
import { getDb } from "../db";
import { shouldMaskData } from "../auth";

export async function queryTeam(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const wallet = params.wallet;
  if (!wallet) return { text: "请提供钱包地址" };

  const mask = shouldMaskData(user.role);

  // Get team stats via RPC
  const { data: stats, error } = await db.rpc("get_user_team_stats", { addr: wallet });
  if (error) return { text: `查询失败: ${error.message}` };

  const s = stats as Record<string, unknown>;

  // Get direct referrals (推荐)
  const { data: profile } = await db.from("profiles").select("id").ilike("wallet_address", wallet).single();
  if (!profile) return { text: `未找到 ${wallet}` };

  const { data: directRefs } = await db
    .from("profiles")
    .select("wallet_address, rank, node_type, total_deposited, created_at")
    .eq("referrer_id", profile.id)
    .order("created_at", { ascending: false });

  // Get placement tree (安置)
  const { data: placements } = await db
    .from("profiles")
    .select("wallet_address, rank, node_type, total_deposited, created_at")
    .eq("placement_id", profile.id)
    .order("created_at", { ascending: false });

  // Commissions/earnings
  const { data: commissions } = await db
    .from("transactions")
    .select("type, amount, details, created_at")
    .eq("user_id", profile.id)
    .in("type", ["REFERRAL_COMMISSION", "NODE_COMMISSION", "TEAM_COMMISSION", "BROKER_REWARD"])
    .order("created_at", { ascending: false })
    .limit(15);

  const totalCommission = (commissions || []).reduce((s, c) => s + Number(c.amount), 0);

  // Format direct referrals
  const refLines = (directRefs || []).slice(0, 10).map(r => {
    const addr = mask ? `${r.wallet_address.slice(0, 6)}...${r.wallet_address.slice(-4)}` : r.wallet_address.slice(0, 12) + "...";
    return `  ${addr} | ${r.node_type || "无节点"} | $${Number(r.total_deposited || 0).toLocaleString()} | ${r.rank || "-"}`;
  });

  const placeLines = (placements || []).slice(0, 10).map(r => {
    const addr = mask ? `${r.wallet_address.slice(0, 6)}...${r.wallet_address.slice(-4)}` : r.wallet_address.slice(0, 12) + "...";
    return `  ${addr} | ${r.node_type || "无节点"} | $${Number(r.total_deposited || 0).toLocaleString()}`;
  });

  const commLines = (commissions || []).slice(0, 10).map(c => {
    const detail = c.details as Record<string, unknown> || {};
    return `  ${c.type} | $${Number(c.amount).toFixed(2)} | ${detail.from_wallet ? String(detail.from_wallet).slice(0, 8) + "..." : ""} | ${new Date(c.created_at).toLocaleDateString()}`;
  });

  return {
    text: `<b>📊 ${wallet.slice(0, 10)}... 团队数据</b>

<b>团队概览</b>
直推人数: ${s.directSponsorCount || 0}
安置人数: ${s.directPlacementCount || 0}
团队总人数: ${s.teamSize || 0}
团队业绩: $${s.teamPerformance || "0"}
个人持仓: $${s.personalHolding || "0"}

<b>节点统计</b>
自己节点: ${s.ownNode || "无"}
直推MAX: ${s.directMaxNodes || 0} | 直推MINI: ${s.directMiniNodes || 0}
团队节点: ${s.totalTeamNodes || 0}

<b>直推列表 (${directRefs?.length || 0})</b>
${refLines.join("\n") || "  无"}${(directRefs?.length || 0) > 10 ? "\n  ...更多" : ""}

<b>安置列表 (${placements?.length || 0})</b>
${placeLines.join("\n") || "  无"}${(placements?.length || 0) > 10 ? "\n  ...更多" : ""}

<b>佣金/收益记录 (共$${totalCommission.toFixed(2)})</b>
${commLines.join("\n") || "  无"}`,
  };
}

export async function queryEarnings(env: Env, user: BotUser, params: Record<string, string>): Promise<ToolResult> {
  const db = getDb(env);
  const wallet = params.wallet;
  if (!wallet) return { text: "请提供钱包地址" };

  const { data: profile } = await db.from("profiles")
    .select("id, referral_earnings, rank, node_type")
    .ilike("wallet_address", wallet).single();
  if (!profile) return { text: `未找到 ${wallet}` };

  // Vault yields (from vault_rewards)
  const { data: vaultRewards } = await db
    .from("vault_rewards")
    .select("ar_amount, created_at, position_id")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const totalVaultYield = (vaultRewards || []).reduce((s, r) => s + Number(r.ar_amount || 0), 0);

  // Node earnings
  const { data: nodes } = await db
    .from("node_memberships")
    .select("node_type, available_balance, locked_earnings, released_earnings, daily_rate, frozen_amount")
    .eq("user_id", profile.id);

  const totalNodeEarnings = (nodes || []).reduce((s, n) => s + Number(n.available_balance || 0) + Number(n.released_earnings || 0), 0);

  // Broker/referral commissions
  const { data: commissions } = await db
    .from("transactions")
    .select("type, amount")
    .eq("user_id", profile.id)
    .in("type", ["REFERRAL_COMMISSION", "NODE_COMMISSION", "TEAM_COMMISSION", "BROKER_REWARD"]);

  const commByType: Record<string, number> = {};
  for (const c of commissions || []) {
    commByType[c.type] = (commByType[c.type] || 0) + Number(c.amount);
  }

  // Node daily yield calculation
  const nodeYieldLines = (nodes || []).map(n => {
    const dailyYield = Number(n.frozen_amount) * Number(n.daily_rate);
    return `  ${n.node_type}: 日产 $${dailyYield.toFixed(2)} (${Number(n.frozen_amount)}×${(Number(n.daily_rate)*100).toFixed(1)}%)
    可用: $${Number(n.available_balance).toFixed(2)} | 锁定: $${Number(n.locked_earnings).toFixed(2)} | 已释放: $${Number(n.released_earnings).toFixed(2)}`;
  });

  const recentYieldLines = (vaultRewards || []).slice(0, 10).map(r =>
    `  $${Number(r.ar_amount).toFixed(4)} MA | ${new Date(r.created_at).toLocaleDateString()}`
  );

  return {
    text: `<b>💰 ${wallet.slice(0, 10)}... 收益明细</b>

<b>金库收益</b>
总产出: ${totalVaultYield.toFixed(4)} MA
最近记录:
${recentYieldLines.join("\n") || "  无"}

<b>节点收益</b>
${nodeYieldLines.join("\n") || "  无节点"}

<b>推荐/团队佣金</b>
${Object.entries(commByType).map(([k, v]) => `  ${k}: $${v.toFixed(2)}`).join("\n") || "  无"}
推荐收益(profile): $${Number(profile.referral_earnings || 0).toFixed(2)}

<b>收益汇总</b>
金库: ${totalVaultYield.toFixed(2)} MA
节点: $${totalNodeEarnings.toFixed(2)}
佣金: $${Object.values(commByType).reduce((s, v) => s + v, 0).toFixed(2)}`,
  };
}
