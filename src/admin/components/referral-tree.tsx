import { useState, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, User, Users, Loader2, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReferralNode } from "@/admin/admin-api";
import { adminGetChildren, adminGetUserTeamStats } from "@/admin/admin-api";
import { shortenAddress, formatCompact } from "@/lib/constants";

const LEVEL_COLORS = [
  "border-primary/40",
  "border-blue-500/40",
  "border-purple-500/40",
  "border-amber-500/40",
  "border-rose-500/40",
  "border-cyan-500/40",
  "border-emerald-500/40",
];

const DOT_COLORS = [
  "bg-primary",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-emerald-500",
];

interface UserPopup {
  node: ReferralNode;
  depth: number;
  stats: { teamSize: number; teamPerformance: string; personalHolding: string; directCount: number } | null;
  loading: boolean;
  x: number;
  y: number;
}

function countDescendants(node: ReferralNode): number {
  let count = node.children.length;
  for (const c of node.children) count += countDescendants(c);
  return count;
}

function TreeNode({
  node,
  depth = 0,
  collapseBelow,
  onUserClick,
}: {
  node: ReferralNode;
  depth?: number;
  collapseBelow: number;
  onUserClick: (node: ReferralNode, depth: number, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(depth < collapseBelow);
  const [children, setChildren] = useState<ReferralNode[]>(node.children);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(node.children.length > 0 || node.childCount === 0);

  const hasChildren = node.childCount > 0 || children.length > 0;
  const levelColor = LEVEL_COLORS[depth % LEVEL_COLORS.length];
  const dotColor = DOT_COLORS[depth % DOT_COLORS.length];

  const handleToggle = useCallback(async () => {
    if (!hasChildren) return;
    if (!expanded && !loaded) {
      setLoading(true);
      try {
        const fetched = await adminGetChildren(node.id);
        setChildren(fetched);
        setLoaded(true);
      } catch {}
      setLoading(false);
    }
    setExpanded(!expanded);
  }, [expanded, loaded, hasChildren, node.id]);

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUserClick(node, depth, e);
  };

  return (
    <div className={depth > 0 ? `ml-3 lg:ml-5 pl-3 lg:pl-4 border-l-2 ${levelColor}` : ""}>
      <div
        className={`flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors ${hasChildren ? "cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05]" : ""}`}
        onClick={handleToggle}
      >
        <div className="w-4 shrink-0 flex items-center justify-center">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          ) : hasChildren ? (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-foreground/40" />
              : <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />
          ) : (
            <div className={`h-2 w-2 rounded-full ${dotColor}`} />
          )}
        </div>

        <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${depth === 0 ? "bg-primary/15" : "bg-white/[0.04]"}`}>
          {hasChildren ? <Users className="h-3 w-3 text-foreground/50" /> : <User className="h-3 w-3 text-foreground/35" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-mono text-xs text-primary/90 hover:text-primary hover:underline cursor-pointer"
              onClick={handleNameClick}
            >
              {shortenAddress(node.walletAddress)}
            </span>
            <Badge
              className={`text-[9px] h-4 px-1.5 border ${
                !node.rank || node.rank === "V0" ? "bg-white/[0.04] text-foreground/40 border-border/20"
                : "bg-primary/10 text-primary border-primary/20"
              }`}
            >
              {node.rank || "V0"}
            </Badge>
            {node.nodeType && (
              <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                {node.nodeType}
              </Badge>
            )}
            <span className="text-[9px] text-foreground/20">L{depth}</span>
          </div>
        </div>

        {hasChildren && (
          <span className="text-[10px] text-foreground/30 shrink-0 tabular-nums">
            {node.childCount > 0 ? `${node.childCount}人` : `${countDescendants({ ...node, children })}人`}
          </span>
        )}
      </div>

      {expanded && children.length > 0 && (
        <div className="mt-0.5">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} collapseBelow={collapseBelow} onUserClick={onUserClick} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReferralTreeViewProps {
  tree: ReferralNode;
  onNavigateToUser?: (walletAddress: string) => void;
}

const COLLAPSE_LEVELS = [
  { label: "5层", value: 5 },
  { label: "10层", value: 10 },
  { label: "20层", value: 20 },
  { label: "30层", value: 30 },
  { label: "40层", value: 40 },
];

export function ReferralTreeView({ tree, onNavigateToUser }: ReferralTreeViewProps) {
  const total = tree.childCount || countDescendants(tree);
  const [collapseBelow, setCollapseBelow] = useState(2);
  const [popup, setPopup] = useState<UserPopup | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUserClick = useCallback(async (node: ReferralNode, depth: number, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);

    setPopup({ node, depth, stats: null, loading: true, x, y });

    try {
      const stats = await adminGetUserTeamStats(node.id);
      setPopup(prev => prev?.node.id === node.id ? { ...prev, stats, loading: false } : prev);
    } catch {
      setPopup(prev => prev?.node.id === node.id ? { ...prev, loading: false } : prev);
    }
  }, []);

  const handleCollapse = (level: number) => {
    setCollapseBelow(level);
    setTreeKey(k => k + 1); // force re-render tree with new default expand
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-foreground/50">递归推荐图（点击地址查看详情）</span>
        </div>
        <span className="text-xs text-foreground/30">直推 {total} 人</span>
      </div>

      {/* Collapse level buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-foreground/30 mr-1">展开层级:</span>
        {COLLAPSE_LEVELS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => handleCollapse(value)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
              collapseBelow === value
                ? "bg-primary/15 border-primary/30 text-primary font-bold"
                : "bg-white/[0.03] border-border/20 text-foreground/40 hover:text-foreground/60 hover:border-border/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="rounded-xl border border-border/25 p-2 lg:p-3 max-h-[600px] overflow-y-auto relative"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.02) 100%)" }}
        onClick={() => setPopup(null)}
      >
        <TreeNode key={treeKey} node={tree} depth={0} collapseBelow={collapseBelow} onUserClick={handleUserClick} />

        {/* User detail popup */}
        {popup && (
          <div
            className="absolute z-50 w-64 rounded-xl border border-primary/20 p-3 shadow-2xl"
            style={{
              background: "#1a1a1a",
              left: Math.min(popup.x, (containerRef.current?.clientWidth ?? 300) - 270),
              top: popup.y + 10,
              boxShadow: "0 15px 40px rgba(0,0,0,0.6), 0 0 20px rgba(10,186,181,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs text-primary">{shortenAddress(popup.node.walletAddress)}</span>
              <button onClick={() => setPopup(null)} className="text-foreground/30 hover:text-foreground/60">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Badge className={`text-[9px] h-4 px-1.5 border ${
                !popup.node.rank || popup.node.rank === "V0" ? "bg-white/[0.04] text-foreground/40 border-border/20"
                : "bg-primary/10 text-primary border-primary/20"
              }`}>
                {popup.node.rank || "V0"}
              </Badge>
              {popup.node.nodeType && (
                <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                  {popup.node.nodeType}
                </Badge>
              )}
              <span className="text-[9px] text-foreground/20">L{popup.depth}</span>
            </div>

            {popup.loading ? (
              <div className="flex items-center gap-2 py-3 justify-center">
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                <span className="text-xs text-foreground/40">加载中...</span>
              </div>
            ) : popup.stats ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="text-[9px] text-foreground/30 mb-0.5">直推人数</div>
                    <div className="text-sm font-bold text-foreground/80">{popup.stats.directCount}</div>
                  </div>
                  <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="text-[9px] text-foreground/30 mb-0.5">团队总人数</div>
                    <div className="text-sm font-bold text-foreground/80">{popup.stats.teamSize}</div>
                  </div>
                  <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="text-[9px] text-foreground/30 mb-0.5">个人持仓</div>
                    <div className="text-sm font-bold text-foreground/80">{formatCompact(Number(popup.stats.personalHolding))}</div>
                  </div>
                  <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="text-[9px] text-foreground/30 mb-0.5">团队业绩</div>
                    <div className="text-sm font-bold text-primary">{formatCompact(Number(popup.stats.teamPerformance))}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-foreground/30 text-center py-2">无法加载数据</p>
            )}

            {onNavigateToUser && (
              <Button
                size="sm"
                className="w-full mt-3 h-8 text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                variant="ghost"
                onClick={() => {
                  onNavigateToUser(popup.node.walletAddress);
                  setPopup(null);
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1.5" /> 查看此用户推荐树
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
