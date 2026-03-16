import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/admin/admin-auth";
import { supabase } from "@/lib/supabase";
import { Activity, TrendingUp, TrendingDown, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useMemo } from "react";

const ASSETS = ["全部", "BTC", "ETH", "SOL", "BNB"];
const TABS = ["持仓中", "历史记录", "信号流"] as const;
type Tab = typeof TABS[number];

const PAGE_SIZE = 20;

interface PaperTrade {
  id: string;
  signal_id: string | null;
  asset: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  size: number;
  leverage: number;
  stop_loss: number;
  take_profit: number;
  pnl: number | null;
  pnl_pct: number | null;
  close_reason: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

interface TradeSignal {
  id: string;
  asset: string;
  action: string;
  direction: string;
  confidence: number;
  strength: string;
  leverage: number;
  strategy_type: string;
  source_models: string[];
  status: string;
  created_at: string;
}

function formatPrice(price: number | null | undefined): string {
  if (!price || price <= 0) return "—";
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatPnl(pnl: number | null | undefined): string {
  if (pnl === null || pnl === undefined) return "—";
  const prefix = pnl >= 0 ? "+" : "";
  return `${prefix}${pnl.toFixed(4)}`;
}

function formatPnlPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "";
  const prefix = pct >= 0 ? "+" : "";
  return `${prefix}${pct.toFixed(2)}%`;
}

function pnlColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-foreground/30";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

function SideBadge({ side }: { side: string }) {
  if (side === "LONG") return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded"><TrendingUp className="h-2.5 w-2.5" />做多</span>;
  return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded"><TrendingDown className="h-2.5 w-2.5" />做空</span>;
}

function StrengthBadge({ strength }: { strength: string }) {
  const cls = strength === "STRONG" ? "text-green-400 bg-green-500/10" : strength === "MEDIUM" ? "text-yellow-400 bg-yellow-500/10" : "text-orange-400 bg-orange-500/10";
  const label = strength === "STRONG" ? "强" : strength === "MEDIUM" ? "中" : "弱";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  return `${days}天`;
}

export default function AdminAITrades() {
  const { adminUser } = useAdminAuth();
  const [tab, setTab] = useState<Tab>("持仓中");
  const [assetFilter, setAssetFilter] = useState("全部");
  const [historyPage, setHistoryPage] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Fetch live prices from Binance
  useEffect(() => {
    async function fetchPrices() {
      const assets = ["BTC", "ETH", "SOL", "BNB"];
      const results: Record<string, number> = {};
      await Promise.all(assets.map(async (a) => {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${a}USDT`);
          const data = await res.json();
          if (data?.price) results[a] = parseFloat(data.price);
        } catch { /* ignore */ }
      }));
      setPrices(results);
    }
    fetchPrices();
    const interval = setInterval(fetchPrices, 15000);
    return () => clearInterval(interval);
  }, []);

  // Open positions
  const { data: openTrades, isLoading: openLoading, refetch: refetchOpen } = useQuery({
    queryKey: ["admin", "paper-trades-open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paper_trades")
        .select("*")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return data as PaperTrade[];
    },
    enabled: !!adminUser,
    refetchInterval: 30000,
  });

  // Closed trades (paginated)
  const { data: closedTrades, isLoading: closedLoading } = useQuery({
    queryKey: ["admin", "paper-trades-closed", historyPage, assetFilter],
    queryFn: async () => {
      let q = supabase
        .from("paper_trades")
        .select("*", { count: "exact" })
        .eq("status", "CLOSED")
        .order("closed_at", { ascending: false })
        .range(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE - 1);
      if (assetFilter !== "全部") q = q.eq("asset", assetFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data as PaperTrade[], count: count ?? 0 };
    },
    enabled: !!adminUser,
  });

  // Recent signals
  const { data: signals, isLoading: sigLoading } = useQuery({
    queryKey: ["admin", "trade-signals", assetFilter],
    queryFn: async () => {
      let q = supabase
        .from("trade_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (assetFilter !== "全部") q = q.eq("asset", assetFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as TradeSignal[];
    },
    enabled: !!adminUser,
  });

  // Compute summary stats
  const summary = useMemo(() => {
    const openCount = openTrades?.length ?? 0;
    const signalCount = signals?.length ?? 0;

    // Today PnL from closed trades
    const today = new Date().toISOString().slice(0, 10);
    const todayClosed = closedTrades?.data?.filter(t => t.closed_at?.startsWith(today)) ?? [];
    const todayPnl = todayClosed.reduce((s, t) => s + (t.pnl ?? 0), 0);

    // Total PnL and win rate from all closed
    const totalPnl = closedTrades?.data?.reduce((s, t) => s + (t.pnl ?? 0), 0) ?? 0;
    const totalClosed = closedTrades?.count ?? 0;
    const wins = closedTrades?.data?.filter(t => (t.pnl ?? 0) > 0).length ?? 0;
    const winRate = totalClosed > 0 ? ((wins / Math.min(totalClosed, closedTrades?.data?.length ?? 1)) * 100) : 0;

    return { openCount, signalCount, todayPnl, totalPnl, winRate, totalClosed };
  }, [openTrades, signals, closedTrades]);

  // Filter open trades by asset
  const filteredOpen = useMemo(() => {
    if (!openTrades) return [];
    if (assetFilter === "全部") return openTrades;
    return openTrades.filter(t => t.asset === assetFilter);
  }, [openTrades, assetFilter]);

  const totalHistoryPages = Math.ceil((closedTrades?.count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">AI 模拟开单</h1>
        </div>
        <button onClick={() => refetchOpen()} className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:bg-white/[0.05] transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] text-foreground/35 mb-1">持仓数</p>
          <p className="text-xl font-bold">{summary.openCount}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] text-foreground/35 mb-1">今日盈亏</p>
          <p className={`text-xl font-bold ${pnlColor(summary.todayPnl)}`}>{formatPnl(summary.todayPnl)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] text-foreground/35 mb-1">累计盈亏</p>
          <p className={`text-xl font-bold ${pnlColor(summary.totalPnl)}`}>{formatPnl(summary.totalPnl)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] text-foreground/35 mb-1">胜率</p>
          <p className="text-xl font-bold text-primary">{summary.winRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] text-foreground/35 mb-1">信号数</p>
          <p className="text-xl font-bold">{summary.signalCount}</p>
        </div>
      </div>

      {/* Asset Filter + Tabs */}
      <div className="space-y-2">
        <div className="flex rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          {ASSETS.map((a) => (
            <button key={a} onClick={() => { setAssetFilter(a); setHistoryPage(0); }}
              className={`px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${assetFilter === a ? "bg-primary/15 text-primary" : "text-foreground/35 hover:text-foreground/60"}`}
            >{a}</button>
          ))}
        </div>
        <div className="flex rounded-xl border border-white/[0.06] overflow-hidden">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-semibold transition-all ${tab === t ? "bg-primary/15 text-primary" : "text-foreground/35 hover:text-foreground/60"}`}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === "持仓中" && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-foreground/70">当前持仓 ({filteredOpen.length})</h2>
          </div>
          {openLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : filteredOpen.length === 0 ? (
            <div className="p-8 text-center text-foreground/25 text-sm">暂无持仓</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="lg:hidden divide-y divide-white/[0.04]">
                {filteredOpen.map((t) => {
                  const currentPrice = prices[t.asset] ?? 0;
                  const unrealizedPnl = currentPrice > 0
                    ? (t.side === "LONG" ? (currentPrice - t.entry_price) : (t.entry_price - currentPrice)) * t.size * t.leverage
                    : null;
                  const unrealizedPct = currentPrice > 0 && t.entry_price > 0
                    ? ((t.side === "LONG" ? (currentPrice - t.entry_price) : (t.entry_price - currentPrice)) / t.entry_price) * 100 * t.leverage
                    : null;
                  return (
                    <div key={t.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground/80">{t.asset}</span>
                          <SideBadge side={t.side} />
                          <span className="text-[10px] text-foreground/25">{t.leverage}x</span>
                        </div>
                        <span className="text-[10px] text-foreground/20">{timeSince(t.opened_at)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <p className="text-foreground/25">入场价</p>
                          <p className="text-foreground/50 font-mono">{formatPrice(t.entry_price)}</p>
                        </div>
                        <div>
                          <p className="text-foreground/25">现价</p>
                          <p className="text-foreground/50 font-mono">{currentPrice > 0 ? formatPrice(currentPrice) : "加载中..."}</p>
                        </div>
                        <div>
                          <p className="text-foreground/25">未实现盈亏</p>
                          <p className={`font-mono font-bold ${pnlColor(unrealizedPnl)}`}>
                            {unrealizedPnl !== null ? formatPnl(unrealizedPnl) : "—"}
                            {unrealizedPct !== null && <span className="text-[9px] ml-0.5">({formatPnlPct(unrealizedPct)})</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-foreground/20">
                        <span>SL: {formatPrice(t.stop_loss)}</span>
                        <span>TP: {formatPrice(t.take_profit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-foreground/30 border-b border-white/[0.04]">
                      <th className="text-left px-4 py-2 font-medium">资产</th>
                      <th className="text-left px-4 py-2 font-medium">方向</th>
                      <th className="text-right px-4 py-2 font-medium">入场价</th>
                      <th className="text-right px-4 py-2 font-medium">现价</th>
                      <th className="text-right px-4 py-2 font-medium">未实现盈亏</th>
                      <th className="text-center px-4 py-2 font-medium">杠杆</th>
                      <th className="text-right px-4 py-2 font-medium">止损</th>
                      <th className="text-right px-4 py-2 font-medium">止盈</th>
                      <th className="text-right px-4 py-2 font-medium">持仓时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {filteredOpen.map((t) => {
                      const currentPrice = prices[t.asset] ?? 0;
                      const unrealizedPnl = currentPrice > 0
                        ? (t.side === "LONG" ? (currentPrice - t.entry_price) : (t.entry_price - currentPrice)) * t.size * t.leverage
                        : null;
                      const unrealizedPct = currentPrice > 0 && t.entry_price > 0
                        ? ((t.side === "LONG" ? (currentPrice - t.entry_price) : (t.entry_price - currentPrice)) / t.entry_price) * 100 * t.leverage
                        : null;
                      return (
                        <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5 font-bold text-foreground/70">{t.asset}</td>
                          <td className="px-4 py-2.5"><SideBadge side={t.side} /></td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground/50">{formatPrice(t.entry_price)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground/50">{currentPrice > 0 ? formatPrice(currentPrice) : "—"}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${pnlColor(unrealizedPnl)}`}>
                            {unrealizedPnl !== null ? `${formatPnl(unrealizedPnl)} (${formatPnlPct(unrealizedPct)})` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center text-foreground/40">{t.leverage}x</td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground/30">{formatPrice(t.stop_loss)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-foreground/30">{formatPrice(t.take_profit)}</td>
                          <td className="px-4 py-2.5 text-right text-foreground/30">{timeSince(t.opened_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "历史记录" && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground/70">交易历史 ({closedTrades?.count ?? 0})</h2>
            {totalHistoryPages > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0}
                  className="px-2 py-1 rounded text-foreground/40 hover:text-foreground/70 disabled:opacity-30 disabled:cursor-not-allowed">上一页</button>
                <span className="text-foreground/30">{historyPage + 1}/{totalHistoryPages}</span>
                <button onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))} disabled={historyPage >= totalHistoryPages - 1}
                  className="px-2 py-1 rounded text-foreground/40 hover:text-foreground/70 disabled:opacity-30 disabled:cursor-not-allowed">下一页</button>
              </div>
            )}
          </div>
          {closedLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
          ) : !closedTrades?.data || closedTrades.data.length === 0 ? (
            <div className="p-8 text-center text-foreground/25 text-sm">暂无历史记录</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="lg:hidden divide-y divide-white/[0.04]">
                {closedTrades.data.map((t) => (
                  <div key={t.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground/80">{t.asset}</span>
                        <SideBadge side={t.side} />
                      </div>
                      <span className={`text-sm font-bold ${pnlColor(t.pnl)}`}>{formatPnl(t.pnl)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <p className="text-foreground/25">入场</p>
                        <p className="text-foreground/50 font-mono">{formatPrice(t.entry_price)}</p>
                      </div>
                      <div>
                        <p className="text-foreground/25">出场</p>
                        <p className="text-foreground/50 font-mono">{formatPrice(t.exit_price)}</p>
                      </div>
                      <div>
                        <p className="text-foreground/25">盈亏%</p>
                        <p className={`font-mono ${pnlColor(t.pnl_pct)}`}>{formatPnlPct(t.pnl_pct)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-foreground/20">
                      <span>{t.close_reason ?? "—"}</span>
                      <span>{t.closed_at ? new Date(t.closed_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-foreground/30 border-b border-white/[0.04]">
                      <th className="text-left px-4 py-2 font-medium">资产</th>
                      <th className="text-left px-4 py-2 font-medium">方向</th>
                      <th className="text-right px-4 py-2 font-medium">入场价</th>
                      <th className="text-right px-4 py-2 font-medium">出场价</th>
                      <th className="text-right px-4 py-2 font-medium">盈亏</th>
                      <th className="text-right px-4 py-2 font-medium">盈亏%</th>
                      <th className="text-left px-4 py-2 font-medium">平仓原因</th>
                      <th className="text-right px-4 py-2 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {closedTrades.data.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 font-bold text-foreground/70">{t.asset}</td>
                        <td className="px-4 py-2.5"><SideBadge side={t.side} /></td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground/50">{formatPrice(t.entry_price)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground/50">{formatPrice(t.exit_price)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${pnlColor(t.pnl)}`}>{formatPnl(t.pnl)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${pnlColor(t.pnl_pct)}`}>{formatPnlPct(t.pnl_pct)}</td>
                        <td className="px-4 py-2.5 text-foreground/35">{t.close_reason ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-foreground/30 whitespace-nowrap">
                          {t.closed_at ? new Date(t.closed_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "信号流" && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-foreground/70">最近信号 (最新50条)</h2>
          </div>
          {sigLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
          ) : !signals || signals.length === 0 ? (
            <div className="p-8 text-center text-foreground/25 text-sm">暂无信号</div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="lg:hidden divide-y divide-white/[0.04]">
                {signals.map((s) => (
                  <div key={s.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground/80">{s.asset}</span>
                        <SideBadge side={s.direction === "LONG" ? "LONG" : s.direction === "SHORT" ? "SHORT" : s.direction} />
                        <StrengthBadge strength={s.strength} />
                      </div>
                      <span className="text-[10px] text-foreground/20">{timeSince(s.created_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-foreground/35">
                      <span>信心 <strong className="text-foreground/50">{s.confidence}%</strong></span>
                      <span>杠杆 <strong className="text-foreground/50">{s.leverage}x</strong></span>
                      <span>策略 <strong className="text-foreground/50">{s.strategy_type}</strong></span>
                      <span>状态 <strong className={s.status === "executed" ? "text-green-400/60" : "text-foreground/50"}>{s.status}</strong></span>
                    </div>
                    {s.source_models?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.source_models.map((m, i) => (
                          <span key={i} className="text-[9px] text-foreground/25 bg-white/[0.04] rounded px-1.5 py-0.5">{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-foreground/30 border-b border-white/[0.04]">
                      <th className="text-left px-4 py-2 font-medium">资产</th>
                      <th className="text-left px-4 py-2 font-medium">方向</th>
                      <th className="text-center px-4 py-2 font-medium">强度</th>
                      <th className="text-right px-4 py-2 font-medium">信心</th>
                      <th className="text-center px-4 py-2 font-medium">杠杆</th>
                      <th className="text-left px-4 py-2 font-medium">策略</th>
                      <th className="text-left px-4 py-2 font-medium">来源模型</th>
                      <th className="text-center px-4 py-2 font-medium">状态</th>
                      <th className="text-right px-4 py-2 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {signals.map((s) => (
                      <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 font-bold text-foreground/70">{s.asset}</td>
                        <td className="px-4 py-2.5"><SideBadge side={s.direction === "LONG" ? "LONG" : s.direction === "SHORT" ? "SHORT" : s.direction} /></td>
                        <td className="px-4 py-2.5 text-center"><StrengthBadge strength={s.strength} /></td>
                        <td className="px-4 py-2.5 text-right text-foreground/50">{s.confidence}%</td>
                        <td className="px-4 py-2.5 text-center text-foreground/40">{s.leverage}x</td>
                        <td className="px-4 py-2.5 text-foreground/40">{s.strategy_type}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {s.source_models?.map((m, i) => (
                              <span key={i} className="text-[10px] text-foreground/30 bg-white/[0.04] rounded px-1 py-0.5">{m}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.status === "executed" ? "text-green-400/60 bg-green-500/8" : "text-foreground/35 bg-white/[0.04]"}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground/30 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
