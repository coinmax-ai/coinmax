import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, Check, Download, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MobileDataCard } from "@/admin/components/mobile-card";
import {
  adminGetAuthCodes, adminGetAuthCodeStats,
  adminBatchCreateAuthCodes, adminDeactivateAuthCode,
} from "@/admin/admin-api";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/admin/admin-auth";
import { shortenAddress } from "@/lib/constants";
import { copyText } from "@/lib/copy";

const PAGE_SIZE = 20;

type StatusFilter = "ALL" | "ACTIVE" | "USED" | "INACTIVE";

function downloadFile(blob: Blob, filename: string) {
  // Try navigator.share for mobile first
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).catch(() => {
        fallbackDownload(blob, filename);
      });
      return;
    }
  }
  fallbackDownload(blob, filename);
}

function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

function buildCSV(headers: string[], rows: string[][]): Blob {
  const bom = "\uFEFF";
  const csv = bom + [
    headers.join(","),
    ...rows.map(r => r.map(v => `"${(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

function codeBadge(status: string) {
  const s = status.toUpperCase();
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    USED: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    INACTIVE: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return <Badge className={`text-[10px] h-5 ${map[s] || ""}`}>{s}</Badge>;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "ACTIVE", label: "可用" },
  { value: "USED", label: "已用" },
  { value: "INACTIVE", label: "已停用" },
];

export default function AdminAuthCodes() {
  const { adminUser } = useAdminAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchCount, setBatchCount] = useState("10");
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchNodeType, setBatchNodeType] = useState("MAX");
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // List query — includes status filter
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "auth-codes", page, statusFilter],
    queryFn: () => adminGetAuthCodes(page, PAGE_SIZE, statusFilter),
    enabled: !!adminUser,
  });

  const { data: codeStats } = useQuery({
    queryKey: ["admin", "auth-code-stats"],
    queryFn: () => adminGetAuthCodeStats(),
    enabled: !!adminUser,
  });

  // Reset page when filter changes
  const handleFilterChange = (val: StatusFilter) => {
    setStatusFilter(val);
    setPage(1);
  };

  // Batch create
  const [autoExport, setAutoExport] = useState(false);
  const batchCreateMutation = useMutation({
    mutationFn: () => adminBatchCreateAuthCodes(Number(batchCount), batchNodeType, batchPrefix, adminUser ?? "admin"),
    onSuccess: (newCodes: any[]) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "auth-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "auth-code-stats"] });

      if (autoExport && newCodes && newCodes.length > 0) {
        const headers = ["授权码", "节点类型", "状态", "创建人", "创建时间"];
        const rows = newCodes.map((c: any) => [
          c.code, c.nodeType || batchNodeType, "ACTIVE", adminUser || "admin",
          new Date().toLocaleString("zh-CN"),
        ]);
        const date = new Date().toISOString().slice(0, 10);
        const blob = buildCSV(headers, rows);
        downloadFile(blob, `新生成授权码_${newCodes.length}个_${date}.csv`);
      }

      setDialogOpen(false);
      setBatchCount("10"); setBatchPrefix(""); setBatchNodeType("MAX"); setAutoExport(false);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminDeactivateAuthCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "auth-codes"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "auth-code-stats"] });
    },
  });

  const copyCode = async (code: string, id: string) => {
    await copyText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Export all (respects current filter)
  const handleExport = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from("node_auth_codes")
        .select("code, node_type, status, created_by, used_by, used_at, created_at")
        .order("created_at", { ascending: false });

      if (statusFilter !== "ALL") query = query.eq("status", statusFilter);

      const { data: allCodes, error } = await query;
      if (error) throw error;
      if (!allCodes || allCodes.length === 0) { alert("没有数据可导出"); return; }

      const headers = ["授权码", "节点类型", "状态", "创建人", "使用者", "使用时间", "创建时间"];
      const rows = allCodes.map((c: any) => [
        c.code, c.node_type, c.status, c.created_by || "",
        c.used_by || "",
        c.used_at ? new Date(c.used_at).toLocaleString("zh-CN") : "",
        new Date(c.created_at).toLocaleString("zh-CN"),
      ]);

      const filterLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || "全部";
      const date = new Date().toISOString().slice(0, 10);
      const blob = buildCSV(headers, rows);
      downloadFile(blob, `授权码_${filterLabel}_${allCodes.length}条_${date}.csv`);
    } catch (e: any) {
      alert("导出失败: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const codes = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg lg:text-xl font-bold text-foreground">
          授权码管理
          {total > 0 && <span className="text-sm font-normal text-foreground/40 ml-2">({total})</span>}
        </h1>
        <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 批量生成
        </Button>
      </div>

      {/* Stats */}
      {codeStats && (
        <div className="grid grid-cols-3 gap-2.5 text-center">
          {[
            { label: "总数", value: codeStats.total ?? 0, sub: "/ 2000", color: "text-foreground", accent: "#6366f1" },
            { label: "已用", value: codeStats.used ?? 0, color: "text-amber-400", accent: "#f59e0b" },
            { label: "可用", value: codeStats.available ?? 0, color: "text-emerald-400", accent: "#22c55e" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] py-2.5 px-3 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-6 opacity-[0.08]" style={{ background: `radial-gradient(circle, ${s.accent}, transparent 70%)`, filter: "blur(8px)" }} />
              <div className="text-[10px] text-foreground/40 mb-1 font-medium">{s.label}</div>
              <div className={`text-lg font-bold ${s.color}`}>
                {s.value}
                {s.sub && <span className="text-xs text-foreground/20 ml-0.5">{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter + Export bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-foreground/30" />
          <div className="flex rounded-lg border border-white/[0.06] overflow-hidden">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFilterChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all ${statusFilter === opt.value ? "bg-primary/15 text-primary" : "text-foreground/35 hover:text-foreground/60"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={exporting}>
          <Download className="h-3.5 w-3.5 mr-1" /> {exporting ? "导出中..." : `导出${statusFilter !== "ALL" ? ` (${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label})` : ""}`}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 lg:h-10 w-full rounded-xl" />)}</div>
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {codes.length === 0 ? (
              <p className="text-center text-foreground/40 py-8 text-sm">暂无授权码</p>
            ) : codes.map((c: any) => (
              <MobileDataCard
                key={c.id}
                header={
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-semibold text-foreground/80 truncate">{c.code}</span>
                      <button onClick={() => copyCode(c.code, c.id)} className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
                        {copiedId === c.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-foreground/40" />}
                      </button>
                    </div>
                    {codeBadge(c.status)}
                  </div>
                }
                fields={[
                  { label: "节点类型", value: <Badge variant="outline" className="text-[10px] h-5 capitalize">{c.nodeType}</Badge> },
                  { label: "创建人", value: c.createdBy || "-" },
                  { label: "使用者", value: c.usedBy ? shortenAddress(c.usedBy) : "-", mono: true },
                  { label: "使用时间", value: c.usedAt ? new Date(c.usedAt).toLocaleDateString() : "-" },
                ]}
                actions={
                  c.status?.toUpperCase() === "ACTIVE" ? (
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                      onClick={() => deactivateMutation.mutate(c.id)} disabled={deactivateMutation.isPending}>
                      停用
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block rounded-2xl border border-white/[0.06] overflow-x-auto" style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)" }}>
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="border-border/20 hover:bg-transparent">
                  <TableHead>授权码</TableHead><TableHead>节点类型</TableHead><TableHead>状态</TableHead>
                  <TableHead>创建人</TableHead><TableHead>使用者</TableHead><TableHead>使用时间</TableHead><TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-foreground/40 py-8">暂无授权码</TableCell></TableRow>
                ) : codes.map((c: any) => (
                  <TableRow key={c.id} className="border-border/10 hover:bg-white/[0.015]">
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-foreground/70 font-semibold">{c.code}</span>
                        <button onClick={() => copyCode(c.code, c.id)} className="p-1 rounded hover:bg-white/10 transition-colors">
                          {copiedId === c.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-foreground/30 hover:text-foreground/60" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{c.nodeType}</Badge></TableCell>
                    <TableCell>{codeBadge(c.status)}</TableCell>
                    <TableCell className="text-foreground/50 text-xs">{c.createdBy}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/40">{c.usedBy ? shortenAddress(c.usedBy) : "-"}</TableCell>
                    <TableCell className="text-foreground/40 text-xs">{c.usedAt ? new Date(c.usedAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>
                      {c.status?.toUpperCase() === "ACTIVE" && (
                        <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20 h-7 text-xs"
                          onClick={() => deactivateMutation.mutate(c.id)} disabled={deactivateMutation.isPending}>停用</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/40">{page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>上一页</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页</Button>
          </div>
        </div>
      )}

      {/* Batch Generate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[340px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量生成授权码</DialogTitle>
            <DialogDescription>生成6位纯数字授权码</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground/70">数量</label>
              <Input type="number" min={1} max={100} value={batchCount} onChange={(e) => setBatchCount(e.target.value)} placeholder="10" className="bg-background/50 border-border/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground/70">节点类型</label>
              <Select value={batchNodeType} onValueChange={setBatchNodeType}>
                <SelectTrigger className="bg-background/50 border-border/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAX">大节点 (MAX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={batchCreateMutation.isPending}>取消</Button>
            <Button variant="outline" onClick={() => { setAutoExport(false); batchCreateMutation.mutate(); }} disabled={batchCreateMutation.isPending || !batchCount || Number(batchCount) < 1}>
              {batchCreateMutation.isPending && !autoExport ? "生成中..." : "仅生成"}
            </Button>
            <Button onClick={() => { setAutoExport(true); batchCreateMutation.mutate(); }} disabled={batchCreateMutation.isPending || !batchCount || Number(batchCount) < 1}>
              <Download className="h-3.5 w-3.5 mr-1" />
              {batchCreateMutation.isPending && autoExport ? "生成导出中..." : "生成并导出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
