/**
 * Copy Trading Page — Standalone route at /copy-trading
 * Uses the shared CopyTradingFlow component.
 */

import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { CopyTradingFlow } from "@/components/strategy/copy-trading-flow";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function CopyTradingPage() {
  const account = useActiveAccount();
  const walletAddress = account?.address || "";
  const [profileId, setProfileId] = useState<string | null>(null);

  // Resolve wallet → profiles.id
  useEffect(() => {
    if (!walletAddress) { setProfileId(null); return; }
    supabase
      .from("profiles")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single()
      .then(({ data }) => setProfileId(data?.id || null));
  }, [walletAddress]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold text-foreground/80">CoinMax 跟单交易</h1>
              <p className="text-[10px] text-foreground/40 mt-0.5">
                {walletAddress ? "AI 智能跟单 · 多策略组合" : "请先连接钱包"}
              </p>
            </div>
            <div className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-bold",
              !walletAddress ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
            )}>
              {!walletAddress ? "未连接" : "已连接"}
            </div>
          </div>
          {walletAddress && (
            <p className="text-[9px] text-foreground/15 font-mono mt-1 truncate">{walletAddress}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {!walletAddress ? (
          <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/15 px-4 py-3">
            <p className="text-xs text-yellow-400/80">请先在首页连接钱包，才能保存跟单设置和绑定交易所。</p>
          </div>
        ) : (
          <CopyTradingFlow userId={profileId || undefined} />
        )}
      </div>
    </div>
  );
}
