import { useState } from "react";
import { ChevronRight, ChevronDown, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReferralNode } from "@/admin/admin-api";
import { shortenAddress } from "@/lib/constants";

const LEVEL_COLORS = [
  "border-primary/40",
  "border-blue-500/40",
  "border-purple-500/40",
  "border-amber-500/40",
  "border-rose-500/40",
];

const DOT_COLORS = [
  "bg-primary",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
];

function countDescendants(node: ReferralNode): number {
  let count = node.children.length;
  for (const c of node.children) count += countDescendants(c);
  return count;
}

function TreeNode({ node, depth = 0 }: { node: ReferralNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const descendants = countDescendants(node);
  const levelColor = LEVEL_COLORS[depth % LEVEL_COLORS.length];
  const dotColor = DOT_COLORS[depth % DOT_COLORS.length];

  return (
    <div className={depth > 0 ? `ml-3 lg:ml-5 pl-3 lg:pl-4 border-l-2 ${levelColor}` : ""}>
      <div
        className={`flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors ${hasChildren ? "cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05]" : ""}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        <div className="w-4 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-foreground/40" />
              : <ChevronRight className="h-3.5 w-3.5 text-foreground/40" />
          ) : (
            <div className={`h-2 w-2 rounded-full ${dotColor}`} />
          )}
        </div>

        {/* User icon */}
        <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${depth === 0 ? "bg-primary/15" : "bg-white/[0.04]"}`}>
          {hasChildren ? <Users className="h-3 w-3 text-foreground/50" /> : <User className="h-3 w-3 text-foreground/35" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-foreground/80">{shortenAddress(node.walletAddress)}</span>
            <Badge
              className={`text-[9px] h-4 px-1.5 border ${
                node.rank === "V0" ? "bg-white/[0.04] text-foreground/40 border-border/20"
                : "bg-primary/10 text-primary border-primary/20"
              }`}
            >
              {node.rank}
            </Badge>
            {node.nodeType && (
              <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                {node.nodeType}
              </Badge>
            )}
          </div>
        </div>

        {/* Count */}
        {hasChildren && (
          <span className="text-[10px] text-foreground/30 shrink-0 tabular-nums">
            {descendants}人
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ReferralTreeViewProps {
  tree: ReferralNode;
}

export function ReferralTreeView({ tree }: ReferralTreeViewProps) {
  const total = countDescendants(tree);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-foreground/50">递归推荐图</span>
        </div>
        <span className="text-xs text-foreground/30">共 {total} 人</span>
      </div>
      <div
        className="rounded-xl border border-border/25 p-2 lg:p-3 max-h-[500px] overflow-y-auto"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.02) 100%)" }}
      >
        <TreeNode node={tree} depth={0} />
      </div>
    </div>
  );
}
