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
import { adminGetReferralPairs } from "@/admin/admin-api";
import { useAdminAuth } from "@/admin/admin-auth";
import { shortenAddress } from "@/lib/constants";

const PAGE_SIZE = 20;

export default function AdminReferrals() {
  const { t } = useTranslation();
  const { adminUser } = useAdminAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "referral-pairs", page],
    queryFn: () => adminGetReferralPairs(page, PAGE_SIZE),
    enabled: !!adminUser,
  });

  const pairs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 lg:space-y-6">
      <h1 className="text-lg lg:text-xl font-bold text-foreground">
        {t("admin.referrals", "推荐管理")}
        {total > 0 && <span className="text-sm font-normal text-foreground/40 ml-2">({total})</span>}
      </h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 lg:h-10 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {pairs.length === 0 ? (
              <p className="text-center text-foreground/40 py-8 text-sm">{t("admin.noData", "暂无数据")}</p>
            ) : pairs.map((p: any) => (
              <MobileDataCard
                key={p.id}
                header={
                  <span className="font-mono text-xs text-primary">{shortenAddress(p.walletAddress)}</span>
                }
                fields={[
                  { label: "推荐人", value: p.referrerWallet ? shortenAddress(p.referrerWallet) : "-", mono: true },
                  { label: "等级", value: <Badge variant="outline" className="text-[10px] h-5">{p.rank}</Badge> },
                  { label: "节点", value: p.nodeType || "-" },
                  { label: "注册时间", value: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "-" },
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
                  <TableHead>推荐人钱包</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>节点类型</TableHead>
                  <TableHead>注册时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-foreground/40 py-8">暂无数据</TableCell></TableRow>
                ) : pairs.map((p: any) => (
                  <TableRow key={p.id} className="border-border/10">
                    <TableCell className="font-mono text-xs text-foreground/70">{shortenAddress(p.walletAddress)}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/70">{p.referrerWallet ? shortenAddress(p.referrerWallet) : "-"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{p.rank}</Badge></TableCell>
                    <TableCell className="text-foreground/70">{p.nodeType || "-"}</TableCell>
                    <TableCell className="text-foreground/40 text-xs">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "-"}</TableCell>
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
