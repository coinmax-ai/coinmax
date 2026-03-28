/**
 * Admin Fund Details — Transaction flow list with filters and search
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/admin/admin-auth";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, RefreshCw, Search, ArrowDownToLine, ArrowUpFromLine,
  Sparkles, ShieldCheck, Server, Gift, Coins, ExternalLink,
} from "lucide-react";

const TX_TYPES = [
  { key: "ALL", label: "全部", icon: DollarSign },
  { key: "VAULT_DEPOSIT", label: "金库存入", icon: ArrowDownToLine },
  { key: "VAULT_REDEEM,WITHDRAW", label: "赎回/提取", icon: ArrowUpFromLine },
  { key: "YIELD,YIELD_CLAIM", label: "收益", icon: Sparkles },
  { key: "VIP_PURCHASE", label: "VIP", icon: ShieldCheck },
  { key: "NODE_PURCHASE", label: "节点", icon: Server },
  { key: "TEAM_COMMISSION,DIRECT_REFERRAL", label: "奖励", icon: Gift },
];

const TYPE_COLORS: Record<string, string> = {
  DEPOSIT: "text-primary bg-primary/10",
  VAULT_DEPOSIT: "text-cyan-400 bg-cyan-500/10",
  WITHDRAW: "text-red-400 bg-red-500/10",
  VAULT_REDEEM: "text-orange-400 bg-orange-500/10",
  YIELD: "text-blue-400 bg-blue-500/10",
  YIELD_CLAIM: "text-emerald-400 bg-emerald-500/10",
  VIP_PURCHASE: "text-purple-400 bg-purple-500/10",
  NODE_PURCHASE: "text-amber-400 bg-amber-500/10",
  TEAM_COMMISSION: "text-indigo-400 bg-indigo-500/10",
  DIRECT_REFERRAL: "text-pink-400 bg-pink-500/10",
  FIXED_YIELD: "text-yellow-400 bg-yellow-500/10",
  REWARD_RELEASE: "text-teal-400 bg-teal-500/10",
  COMPLETED: "text-green-400 bg-green-500/10",
  CONFIRMED: "text-green-400 bg-green-500/10",
};

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "入金", VAULT_DEPOSIT: "金库存入", WITHDRAW: "提取",
  VAULT_REDEEM: "金库赎回", YIELD: "收益", YIELD_CLAIM: "收益提取",
  VIP_PURCHASE: "VIP购买", NODE_PURCHASE: "节点购买",
  TEAM_COMMISSION: "团队奖励", DIRECT_REFERRAL: "直推奖励",
  FIXED_YIELD: "节点收益", REWARD_RELEASE: "释放到账",
};

export default function AdminFunds() {
  const { adminUser } = useAdminAuth();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "funds", "txs", filter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*, profiles!inner(wallet_address)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filter !== "ALL") {
        const types = filter.split(",");
        query = query.in("type", types);
      }

      if (search) {
        // Search by wallet address or tx hash
        query = query.or(`tx_hash.ilike.%${search}%,profiles.wallet_address.ilike.%${search}%`);
      }

      const { data: txs, count, error } = await query;
      if (error) throw error;
      return { txs: txs || [], total: count || 0 };
    },
    enabled: !!adminUser,
  });

  const txs = data?.txs || [];
  const total = data?.total || 0;

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["admin", "funds", "stats"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_fund_stats").single();
      return data;
    },
    enabled: !!adminUser,
  });

  return (
    <div className="space-y-4 lg:space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins className="h-5 w-5 text-primary" />
          <h1 className="text-base lg:text-lg font-bold text-foreground/80">资金详情</h1>
          <Badge className="text-[9px] bg-foreground/5 text-foreground/30">{total} 笔</Badge>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/20" />
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="搜索钱包地址 / 交易哈希"
          className="pl-9 text-xs"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TX_TYPES.map(f => {
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(0); }}
              className={cn(
                "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border",
                filter === f.key
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-white/[0.02] text-foreground/30 border-white/[0.06] hover:text-foreground/50"
              )}
            >
              <Icon className="h-3 w-3" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Transaction list */}
      <div className="space-y-1.5">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
        ) : txs.length === 0 ? (
          <div className="text-center py-12 text-foreground/20 text-sm">暂无记录</div>
        ) : (
          txs.map((tx: any) => {
            const wallet = tx.profiles?.wallet_address || "";
            const color = TYPE_COLORS[tx.type] || "text-foreground/40 bg-white/[0.03]";
            const label = TYPE_LABELS[tx.type] || tx.type;
            const hasHash = tx.tx_hash && !tx.tx_hash.startsWith("trial") && !tx.tx_hash.startsWith("backfill") && !tx.tx_hash.startsWith("yield_") && !tx.tx_hash.startsWith("redeem_");

            return (
              <div key={tx.id} className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Badge className={cn("text-[9px] shrink-0", color)}>{label}</Badge>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold font-mono text-foreground/70">
                        {Number(tx.amount).toFixed(2)} {tx.token}
                      </span>
                      <Badge className={cn("text-[8px]", tx.status === "COMPLETED" || tx.status === "CONFIRMED" ? "text-green-400 bg-green-500/10" : "text-yellow-400 bg-yellow-500/10")}>
                        {tx.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-foreground/20 font-mono truncate max-w-[120px]">
                        {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "-"}
                      </span>
                      {hasHash && (
                        <a
                          href={`https://bscscan.com/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-primary/50 hover:text-primary flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[9px] text-foreground/20 shrink-0">
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-foreground/30">
          <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} / {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30">上一页</button>
            <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30">下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
