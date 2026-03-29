/**
 * Live Trading Panel
 *
 * Phase 5.1: Real-time signal feed + position display.
 * Subscribes to Supabase Realtime for live trade signals and position updates.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://jqgimdgtpwnunrlwexib.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZ2ltZGd0cHdudW5ybHdleGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4Mjg5OTAsImV4cCI6MjA4NjQwNDk5MH0.0b1K4Td9vkNYy40etWSbcqgg2fdpkjkD7_Z6Z1KJHUQ";

interface TradeSignal {
  id: string;
  asset: string;
  action: "OPEN_LONG" | "OPEN_SHORT" | "CLOSE" | "HOLD";
  confidence: number;
  strength: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
  strategy_type: string;
  leverage: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  position_size_pct: number;
  source_models: string[];
  status: string;
  created_at: string;
}

interface Position {
  id: string;
  asset: string;
  side: "LONG" | "SHORT";
  entry_price: number;
  size: number;
  leverage: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  status: "OPEN" | "CLOSED";
}

export function LiveTradingPanel() {
  const { t } = useTranslation();
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const supabaseRef = useRef(createClient(SUPABASE_URL, SUPABASE_ANON));

  // Subscribe to real-time signals
  useEffect(() => {
    const supabase = supabaseRef.current;

    // Subscribe to broadcast channel
    const channel = supabase
      .channel("trade-signals")
      .on("broadcast", { event: "new_signal" }, (payload) => {
        const signal = payload.payload as TradeSignal;
        setSignals(prev => [signal, ...prev].slice(0, 50));
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    // Also subscribe to DB changes for persistence
    const dbChannel = supabase
      .channel("trade-signals-db")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trade_signals" }, (payload) => {
        setSignals(prev => {
          if (prev.some(s => s.id === payload.new.id)) return prev;
          return [payload.new as TradeSignal, ...prev].slice(0, 50);
        });
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      dbChannel.unsubscribe();
    };
  }, []);

  // Fetch initial signals + positions
  useEffect(() => {
    const supabase = supabaseRef.current;

    async function fetchInitial() {
      const [{ data: sigs }, { data: pos }] = await Promise.all([
        supabase
          .from("trade_signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("paper_trades")
          .select("*")
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false }),
      ]);

      if (sigs) setSignals(sigs);
      if (pos) setPositions(pos.map(p => ({
        id: p.id,
        asset: p.asset,
        side: p.side,
        entry_price: p.entry_price,
        size: p.size,
        leverage: p.leverage,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        status: p.status,
      })));
    }

    fetchInitial();

    if (autoRefresh) {
      const interval = setInterval(fetchInitial, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const strengthColor = (s: string) => {
    switch (s) {
      case "STRONG": return "text-green-400 bg-green-500/10";
      case "MEDIUM": return "text-yellow-400 bg-yellow-500/10";
      case "WEAK": return "text-orange-400 bg-orange-500/10";
      default: return "text-foreground/30 bg-foreground/5";
    }
  };

  const actionColor = (a: string) => {
    if (a === "OPEN_LONG") return "text-green-400";
    if (a === "OPEN_SHORT") return "text-red-400";
    return "text-foreground/40";
  };

  const timeSince = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    return `${Math.floor(ms / 3600000)}h`;
  };

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", connected ? "bg-green-400 animate-pulse" : "bg-red-400")} />
          <span className="text-xs text-foreground/40">{connected ? t("strategy.liveConnected") : t("strategy.liveDisconnected")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-foreground/25">{signals.length} {t("strategy.signalsCount")}</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn("text-[10px] px-2 py-0.5 rounded", autoRefresh ? "bg-primary/10 text-primary" : "bg-foreground/5 text-foreground/30")}
          >
            {autoRefresh ? t("strategy.autoRefresh") : t("strategy.paused")}
          </button>
        </div>
      </div>

      {/* Open positions */}
      {positions.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.openPositions")}</h3>
          <div className="space-y-2">
            {positions.filter(p => p.status === "OPEN").map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", p.side === "LONG" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>{p.side}</span>
                  <span className="text-xs font-semibold text-foreground/70">{p.asset}</span>
                  <span className="text-[10px] text-foreground/25">{p.leverage}x</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-foreground/30">${p.entry_price.toLocaleString()}</p>
                  <p className={cn("text-xs font-bold", p.unrealized_pnl >= 0 ? "text-green-400" : "text-red-400")}>
                    {p.unrealized_pnl >= 0 ? "+" : ""}{p.unrealized_pnl_pct.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal feed */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.signalStream")}</h3>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {signals.length === 0 ? (
            <p className="text-xs text-foreground/20 text-center py-8">{t("strategy.waitingSignals")}</p>
          ) : (
            signals.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("text-[10px] font-bold", actionColor(s.action))}>
                    {s.action === "OPEN_LONG" ? "LONG" : s.action === "OPEN_SHORT" ? "SHORT" : s.action}
                  </span>
                  <span className="text-xs font-semibold text-foreground/70">{s.asset}</span>
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", strengthColor(s.strength))}>{s.strength}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-foreground/30">{s.confidence.toFixed(0)}%</span>
                  <span className="text-[10px] text-foreground/20">{s.leverage}x</span>
                  <span className="text-[10px] text-foreground/15">{s.strategy_type}</span>
                  <span className="text-[10px] text-foreground/15 w-8 text-right">{timeSince(s.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
