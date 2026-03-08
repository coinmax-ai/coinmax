import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, Wallet, Server, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { StatsCard } from "@/admin/components/stats-card";
import { MobileDataCard } from "@/admin/components/mobile-card";
import { adminGetPerformanceStats, adminGetCommissions } from "@/admin/admin-api";
import { useAdminAuth } from "@/admin/admin-auth";
import { shortenAddress, formatUSD } from "@/lib/constants";

const PAGE_SIZE = 20;

function typeBadge(type: string) {
  const t = type?.toLowerCase();
  if (t === "direct") return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px] h-5">直推</Badge>;
  if (t === "differential") return <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/20 text-[10px] h-5">差级</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">{type}</Badge>;
}

export default function AdminPerformance() {
  const { t } = useTranslation();
  const { adminUser } = useAdminAuth();
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "performance-stats"],
    queryFn: () => adminGetPerformanceStats(),
    enabled: !!adminUser,
  });

  const { data: commissionData, isLoading: commissionsLoading } = useQuery({
    queryKey: ["admin", "commissions", page],
    queryFn: () => adminGetCommissions(page, PAGE_SIZE),
    enabled: !!adminUser,
  });

  const commissions = commissionData?.data ?? [];
  const total = commissionData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-lg lg:text-xl font-bold text-foreground">业绩管理</h1>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[90px] lg:h-[120px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatsCard title="总用户" value={stats?.totalUsers ?? 0} icon={Users} />
          <StatsCard title="总存入" value={formatUSD(Number(stats?.totalDeposited ?? 0))} icon={Wallet} />
          <StatsCard title="活跃节点" value={stats?.activeNodes ?? 0} icon={Server} />
          <StatsCard title="总佣金" value={formatUSD(Number(stats?.totalCommissions ?? 0))} icon={TrendingUp} />
        </div>
      )}

      {/* Commission Records */}
      <h2 className="text-sm lg:text-lg font-semibold text-foreground/80">佣金记录</h2>

      {commissionsLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 lg:h-10 w-full rounded-xl" />)}</div>
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {commissions.length === 0 ? (
              <p className="text-center text-foreground/40 py-8 text-sm">暂无佣金记录</p>
            ) : commissions.map((r: any) => (
              <MobileDataCard
                key={r.id}
                header={
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-primary">{shortenAddress(r.userWallet ?? r.userId)}</span>
                    {typeBadge(r.details?.type ?? r.rewardType)}
                  </div>
                }
                fields={[
                  { label: "金额", value: formatUSD(Number(r.amount)) },
                  { label: "来源", value: r.sourceWallet ? shortenAddress(r.sourceWallet) : r.details?.sourceUser ? shortenAddress(r.details.sourceUser) : "-", mono: true },
                  { label: "时间", value: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-" },
                ]}
              />
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block rounded-2xl border border-border/30 backdrop-blur-sm overflow-x-auto" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="border-border/20 hover:bg-transparent">
                  <TableHead>用户钱包</TableHead><TableHead>金额</TableHead><TableHead>类型</TableHead>
                  <TableHead>来源</TableHead><TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-foreground/40 py-8">暂无佣金记录</TableCell></TableRow>
                ) : commissions.map((r: any) => (
                  <TableRow key={r.id} className="border-border/10 hover:bg-white/[0.015]">
                    <TableCell className="font-mono text-xs text-foreground/70">{shortenAddress(r.userWallet ?? r.userId)}</TableCell>
                    <TableCell className="text-foreground/70 font-medium">{formatUSD(Number(r.amount))}</TableCell>
                    <TableCell>{typeBadge(r.details?.type ?? r.rewardType)}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/40">{r.sourceWallet ? shortenAddress(r.sourceWallet) : r.details?.sourceUser ? shortenAddress(r.details.sourceUser) : "-"}</TableCell>
                    <TableCell className="text-foreground/40 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/40">{page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>上一页</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
}
