/**
 * Admin Copy Trading Management
 *
 * Overview of all users' copy trading status + ability to view individual configs.
 * Uses the shared CopyTradingFlow component in read-only mode.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/admin/admin-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyTradingFlow } from "@/components/strategy/copy-trading-flow";
import { Link2, Shield, Brain, Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Settings, ChevronLeft } from "lucide-react";
import { useState } from "react";

interface UserCopyConfig {
  user_id: string;
  wallet_address: string;
  copy_enabled: boolean;
  execution_mode: string;
  kill_switch: boolean;
  max_position_size_usd: number;
  max_leverage: number;
  max_drawdown_pct: number;
  max_concurrent_positions: number;
  selected_models: string[] | null;
  selected_strategies: string[] | null;
  min_signal_strength: string;
  updated_at: string;
}

interface UserExchangeKey {
  id: string;
  user_id: string;
  wallet_address: string;
  exchange: string;
  masked_key: string;
  testnet: boolean;
  is_valid: boolean;
  label: string;
}

const EXCHANGE_ICONS: Record<string, string> = {
  binance: "₿", bybit: "▲", okx: "◎", bitget: "◆", hyperliquid: "H", dydx: "D",
};

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  PAPER: { label: "模拟", color: "text-blue-400 bg-blue-500/10" },
  SIGNAL: { label: "信号", color: "text-yellow-400 bg-yellow-500/10" },
  SEMI_AUTO: { label: "半自动", color: "text-orange-400 bg-orange-500/10" },
  FULL_AUTO: { label: "全自动", color: "text-green-400 bg-green-500/10" },
};

export default function AdminCopyTrading() {
  const { adminUser } = useAdminAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const { data: configs = [], isLoading: configsLoading, refetch: refetchConfigs } = useQuery({
    queryKey: ["admin", "copy-trading", "configs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_risk_config").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      const userIds = (data ?? []).map(d => d.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, wallet_address").in("id", userIds);
      const walletMap = new Map((profiles ?? []).map(p => [p.id, p.wallet_address]));
      return (data ?? []).map(d => ({ ...d, wallet_address: walletMap.get(d.user_id) || "未知" })) as UserCopyConfig[];
    },
    enabled: !!adminUser,
  });

  const { data: keys = [], isLoading: keysLoading, refetch: refetchKeys } = useQuery({
    queryKey: ["admin", "copy-trading", "keys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_exchange_keys").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const userIds = (data ?? []).map(d => d.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, wallet_address").in("id", userIds);
      const walletMap = new Map((profiles ?? []).map(p => [p.id, p.wallet_address]));
      return (data ?? []).map(d => ({ ...d, wallet_address: walletMap.get(d.user_id) || "未知" })) as UserExchangeKey[];
    },
    enabled: !!adminUser,
  });

  // If viewing a specific user's config
  if (selectedUserId) {
    const config = configs.find(c => c.user_id === selectedUserId);
    return (
      <div className="space-y-4 lg:space-y-6 max-w-3xl">
        <button
          onClick={() => setSelectedUserId(null)}
          className="flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> 返回列表
        </button>
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-bold text-foreground/80">用户跟单配置</h1>
            <p className="text-[10px] text-foreground/30 font-mono">{config?.wallet_address}</p>
          </div>
        </div>
        <CopyTradingFlow userId={selectedUserId} readOnly />
      </div>
    );
  }

  // Stats
  const totalUsers = configs.length;
  const activeUsers = configs.filter(c => c.copy_enabled).length;
  const killSwitchUsers = configs.filter(c => c.kill_switch).length;
  const totalKeys = keys.length;
  const validKeys = keys.filter(k => k.is_valid).length;
  const fullAutoUsers = configs.filter(c => c.execution_mode === "FULL_AUTO" && c.copy_enabled).length;

  return (
    <div className="space-y-4 lg:space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="text-base lg:text-lg font-bold text-foreground/80">跟单交易管理</h1>
        </div>
        <button onClick={() => { refetchConfigs(); refetchKeys(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="配置用户" value={totalUsers} icon={<Activity className="h-4 w-4 text-primary" />} />
        <StatCard label="跟单中" value={activeUsers} icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} color="text-green-400" />
        <StatCard label="全自动" value={fullAutoUsers} icon={<Shield className="h-4 w-4 text-orange-400" />} color="text-orange-400" />
        <StatCard label="紧急停止" value={killSwitchUsers} icon={<AlertTriangle className="h-4 w-4 text-red-400" />} color={killSwitchUsers > 0 ? "text-red-400" : undefined} />
        <StatCard label="已绑交易所" value={totalKeys} icon={<Link2 className="h-4 w-4 text-blue-400" />} />
        <StatCard label="有效API" value={validKeys} icon={<CheckCircle2 className="h-4 w-4 text-green-400" />} color="text-green-400" />
      </div>

      {/* Exchange keys */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 lg:px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary/60" />
          <h2 className="text-sm font-bold text-foreground/60">交易所绑定 ({totalKeys})</h2>
        </div>
        <div className="p-4 lg:p-5">
          {keysLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
          ) : keys.length === 0 ? (
            <p className="text-xs text-foreground/20 text-center py-6">暂无用户绑定交易所</p>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{EXCHANGE_ICONS[k.exchange] || "?"}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground/60 capitalize">{k.exchange}</span>
                        {k.testnet && <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">测试网</span>}
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded", k.is_valid ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10")}>
                          {k.is_valid ? "有效" : "无效"}
                        </span>
                      </div>
                      <p className="text-[10px] text-foreground/20 font-mono mt-0.5">{k.wallet_address?.slice(0, 6)}...{k.wallet_address?.slice(-4)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-foreground/20 font-mono">{k.masked_key}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User configs */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 lg:px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary/60" />
          <h2 className="text-sm font-bold text-foreground/60">用户跟单配置 ({totalUsers})</h2>
        </div>
        <div className="p-4 lg:p-5">
          {configsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : configs.length === 0 ? (
            <p className="text-xs text-foreground/20 text-center py-6">暂无用户配置跟单</p>
          ) : (
            <div className="space-y-2">
              {configs.map(c => {
                const expanded = expandedUser === c.user_id;
                const mode = MODE_LABELS[c.execution_mode] || { label: c.execution_mode, color: "text-foreground/30" };
                const userKeys = keys.filter(k => k.user_id === c.user_id);

                return (
                  <div key={c.user_id} className={cn("rounded-xl border transition-colors", c.kill_switch ? "border-red-500/20 bg-red-500/5" : "border-white/[0.04] bg-white/[0.02]")}>
                    <button onClick={() => setExpandedUser(expanded ? null : c.user_id)} className="w-full text-left px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {c.kill_switch ? <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          : c.copy_enabled ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                          : <Activity className="h-4 w-4 text-foreground/20 shrink-0" />}
                        <div>
                          <p className="text-[11px] text-foreground/50 font-mono">{c.wallet_address?.slice(0, 6)}...{c.wallet_address?.slice(-4)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", mode.color)}>{mode.label}</span>
                            {c.kill_switch && <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-bold">已停止</span>}
                            <span className="text-[9px] text-foreground/20">{userKeys.length} 个交易所</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-foreground/20">{new Date(c.updated_at).toLocaleDateString("zh-CN")}</p>
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <MiniStat label="仓位上限" value={`$${c.max_position_size_usd?.toLocaleString()}`} />
                          <MiniStat label="杠杆" value={`${c.max_leverage}x`} />
                          <MiniStat label="最大回撤" value={`${c.max_drawdown_pct}%`} />
                          <MiniStat label="同时持仓" value={`${c.max_concurrent_positions}`} />
                        </div>

                        {c.selected_models?.length ? (
                          <div>
                            <p className="text-[10px] text-foreground/25 mb-1">AI 模型</p>
                            <div className="flex flex-wrap gap-1">
                              {c.selected_models.map(m => <span key={m} className="text-[10px] text-primary/60 bg-primary/8 px-2 py-0.5 rounded font-semibold">{m}</span>)}
                            </div>
                          </div>
                        ) : null}

                        {c.selected_strategies?.length ? (
                          <div>
                            <p className="text-[10px] text-foreground/25 mb-1">策略 ({c.selected_strategies.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {c.selected_strategies.map(s => <span key={s} className="text-[10px] text-foreground/35 bg-white/[0.04] px-2 py-0.5 rounded">{s}</span>)}
                            </div>
                          </div>
                        ) : null}

                        {userKeys.length > 0 && (
                          <div>
                            <p className="text-[10px] text-foreground/25 mb-1">已绑定交易所</p>
                            <div className="flex gap-2">
                              {userKeys.map(k => (
                                <span key={k.id} className="flex items-center gap-1.5 text-[10px] text-foreground/40 bg-white/[0.03] px-2 py-1 rounded border border-white/[0.04]">
                                  {EXCHANGE_ICONS[k.exchange]} <span className="capitalize">{k.exchange}</span>
                                  <span className={k.is_valid ? "text-green-400" : "text-red-400"}>{k.is_valid ? "✓" : "✗"}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => setSelectedUserId(c.user_id)}
                          className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                        >
                          查看完整配置向导 →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[10px] text-foreground/30">{label}</span></div>
      <p className={cn("text-xl font-black", color || "text-foreground/70")}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <p className="text-[9px] text-foreground/20">{label}</p>
      <p className="text-xs font-bold text-foreground/50 mt-0.5">{value}</p>
    </div>
  );
}
