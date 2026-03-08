import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { MobileDataCard } from "@/admin/components/mobile-card";
import { adminGetVaultPositions } from "@/admin/admin-api";
import { useAdminAuth } from "@/admin/admin-auth";
import { shortenAddress, formatUSD } from "@/lib/constants";

const PAGE_SIZE = 20;
const STATUS_FILTERS = ["ALL", "ACTIVE", "COMPLETED", "WITHDRAWN"] as const;

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    COMPLETED: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    WITHDRAWN: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  };
  return <Badge className={map[s] || ""}>{status}</Badge>;
}

export default function AdminVaults() {
  const { t } = useTranslation();
  const { adminUser } = useAdminAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "vault-positions", page, statusFilter],
    queryFn: () => adminGetVaultPositions(page, PAGE_SIZE, statusFilter === "ALL" ? undefined : statusFilter),
    enabled: !!adminUser,
  });

  const positions = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-lg lg:text-xl font-bold text-foreground">
        {t("admin.vaults", "金库管理")}
        {total > 0 && <span className="text-sm font-normal text-foreground/40 ml-2">({total})</span>}
      </h1>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s === "ALL" ? "全部" : s}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 lg:h-10 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {positions.length === 0 ? (
              <p className="text-center text-foreground/40 py-8 text-sm">暂无数据</p>
            ) : positions.map((pos: any) => (
              <MobileDataCard
                key={pos.id}
                header={
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-primary">{shortenAddress(pos.userWallet ?? pos.userId)}</span>
                    {statusBadge(pos.status)}
                  </div>
                }
                fields={[
                  { label: "方案", value: pos.planType || "-" },
                  { label: "本金", value: formatUSD(Number(pos.principal)) },
                  { label: "日利率", value: `${(Number(pos.dailyRate) * 100).toFixed(2)}%` },
                  { label: "开始", value: pos.startDate ? new Date(pos.startDate).toLocaleDateString() : "-" },
                  { label: "结束", value: pos.endDate ? new Date(pos.endDate).toLocaleDateString() : "-" },
                ]}
              />
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block rounded-2xl border border-border/30 backdrop-blur-sm overflow-x-auto" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="border-border/20 hover:bg-transparent">
                  <TableHead>用户钱包</TableHead>
                  <TableHead>方案</TableHead>
                  <TableHead>本金</TableHead>
                  <TableHead>日利率</TableHead>
                  <TableHead>开始</TableHead>
                  <TableHead>结束</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-foreground/40 py-8">暂无数据</TableCell></TableRow>
                ) : positions.map((pos: any) => (
                  <TableRow key={pos.id} className="border-border/10">
                    <TableCell className="font-mono text-xs text-foreground/70">{shortenAddress(pos.userWallet ?? pos.userId)}</TableCell>
                    <TableCell className="text-foreground/70">{pos.planType}</TableCell>
                    <TableCell className="text-foreground/70">{formatUSD(Number(pos.principal))}</TableCell>
                    <TableCell className="text-foreground/70">{(Number(pos.dailyRate) * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-foreground/40 text-xs">{pos.startDate ? new Date(pos.startDate).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-foreground/40 text-xs">{pos.endDate ? new Date(pos.endDate).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>{statusBadge(pos.status)}</TableCell>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一页</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
}
