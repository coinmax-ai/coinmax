/**
 * Trade Result Recorder
 *
 * Phase 6.1: Records closed trade results into the database and vector store.
 * This enables the learning feedback loop:
 *   trade close → record result → update embedding → adjust model weights
 *
 * Reference: TECHNICAL_PLAN.md Phase 6.1
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding, type MarketState } from "./vector-store";

// ── Types ───────────────────────────────────────────────────

export interface ClosedTrade {
  id: string;
  signalId: string;
  asset: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  size: number;
  leverage: number;
  pnlUsd: number;
  pnlPct: number;
  closeReason: "STOP_LOSS" | "TAKE_PROFIT" | "TIME_LIMIT" | "TRAILING_STOP" | "MANUAL" | "LIQUIDATION";
  durationSeconds: number;
  strategyType: "directional" | "grid" | "dca" | "arbitrage";
  contributingModels: string[];
  entryState: MarketState;
  exitState?: MarketState;
  fees: number;
  exchange: string;
}

export interface TradeRecord {
  id: string;
  signalId: string;
  asset: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  pnlPct: number;
  closeReason: string;
  durationSeconds: number;
  strategyType: string;
  contributingModels: string[];
  isWin: boolean;
  createdAt: string;
}

export interface ModelAccuracyUpdate {
  model: string;
  asset: string;
  correct: boolean;
  pnlPct: number;
  strategyType: string;
}

// ── Trade Recorder ──────────────────────────────────────────

export class TradeRecorder {
  private supabase: SupabaseClient;
  private openaiKey: string;

  constructor(supabaseUrl: string, supabaseKey: string, openaiKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.openaiKey = openaiKey;
  }

  /**
   * Record a closed trade — stores result, generates embedding, updates model accuracy.
   */
  async recordTrade(trade: ClosedTrade): Promise<void> {
    const isWin = trade.pnlPct > 0;

    // 1. Insert trade result into database
    await this.insertTradeResult(trade, isWin);

    // 2. Generate embedding for this trade's entry market state and store in vector DB
    await this.storeTradeEmbedding(trade, isWin);

    // 3. Update accuracy scores for each contributing model
    await this.updateModelAccuracy(trade, isWin);

    // 4. Update signal status
    await this.resolveSignal(trade);
  }

  /**
   * Insert trade result row into trade_results table.
   */
  private async insertTradeResult(trade: ClosedTrade, isWin: boolean): Promise<void> {
    const { error } = await this.supabase.from("trade_results").insert({
      id: trade.id,
      signal_id: trade.signalId,
      asset: trade.asset,
      side: trade.side,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      size: trade.size,
      leverage: trade.leverage,
      pnl_usd: trade.pnlUsd,
      pnl_pct: trade.pnlPct,
      close_reason: trade.closeReason,
      duration_seconds: trade.durationSeconds,
      strategy_type: trade.strategyType,
      contributing_models: trade.contributingModels,
      is_win: isWin,
      fees: trade.fees,
      exchange: trade.exchange,
      entry_state: trade.entryState,
      exit_state: trade.exitState || null,
    });

    if (error) throw new Error(`Failed to record trade: ${error.message}`);
  }

  /**
   * Generate embedding from entry market state and upsert into vector store.
   * Tags the embedding with trade outcome for future RAG lookups.
   */
  private async storeTradeEmbedding(trade: ClosedTrade, isWin: boolean): Promise<void> {
    try {
      const embedding = await generateEmbedding(trade.entryState, this.openaiKey);

      // Store as a prediction record with trade outcome metadata
      await this.supabase.from("ai_prediction_records").insert({
        id: `trade_${trade.id}`,
        asset: trade.asset,
        timeframe: "trade",
        model: trade.contributingModels[0] || "consensus",
        prediction: trade.side === "LONG" ? "BULLISH" : "BEARISH",
        confidence: 100, // Actual trade, not a prediction
        embedding,
        direction_correct: isWin,
        actual_change_pct: trade.pnlPct,
        resolved_at: new Date().toISOString(),
        metadata: {
          trade_id: trade.id,
          strategy_type: trade.strategyType,
          close_reason: trade.closeReason,
          duration_seconds: trade.durationSeconds,
          leverage: trade.leverage,
          contributing_models: trade.contributingModels,
          is_trade_result: true,
        },
      });
    } catch {
      // Embedding storage is non-critical — don't break the pipeline
    }
  }

  /**
   * Update per-model accuracy stats based on trade outcome.
   */
  private async updateModelAccuracy(trade: ClosedTrade, isWin: boolean): Promise<void> {
    for (const model of trade.contributingModels) {
      // Upsert into ai_model_accuracy — increment counters
      // We use an RPC function for atomic increment
      try {
        await this.supabase.rpc("update_model_accuracy", {
          p_model: model,
          p_asset: trade.asset,
          p_timeframe: "trade",
          p_correct: isWin,
          p_pnl_pct: trade.pnlPct,
        });
      } catch {
        // Non-critical
      }
    }
  }

  /**
   * Mark the originating signal as resolved with PnL.
   */
  private async resolveSignal(trade: ClosedTrade): Promise<void> {
    await this.supabase.from("trade_signals")
      .update({
        status: "resolved",
        result_pnl: trade.pnlPct,
        close_reason: trade.closeReason,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", trade.signalId)
      .then(() => {}).catch(() => {});
  }

  /**
   * Get trade history with filters.
   */
  async getTradeHistory(options: {
    asset?: string;
    strategyType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}): Promise<TradeRecord[]> {
    let query = this.supabase
      .from("trade_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit || 100);

    if (options.asset) query = query.eq("asset", options.asset);
    if (options.strategyType) query = query.eq("strategy_type", options.strategyType);
    if (options.startDate) query = query.gte("created_at", options.startDate);
    if (options.endDate) query = query.lte("created_at", options.endDate);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch trade history: ${error.message}`);

    return (data || []).map(row => ({
      id: row.id,
      signalId: row.signal_id,
      asset: row.asset,
      side: row.side,
      entryPrice: row.entry_price,
      exitPrice: row.exit_price,
      pnlUsd: row.pnl_usd,
      pnlPct: row.pnl_pct,
      closeReason: row.close_reason,
      durationSeconds: row.duration_seconds,
      strategyType: row.strategy_type,
      contributingModels: row.contributing_models || [],
      isWin: row.is_win,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get aggregate performance stats.
   */
  async getPerformanceStats(asset?: string, days: number = 30): Promise<{
    totalTrades: number;
    winRate: number;
    avgPnlPct: number;
    totalPnlUsd: number;
    maxDrawdownPct: number;
    profitFactor: number;
    avgDuration: number;
    bestTrade: number;
    worstTrade: number;
    byStrategy: Record<string, { count: number; winRate: number; avgPnl: number }>;
    byCloseReason: Record<string, number>;
  }> {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    let query = this.supabase
      .from("trade_results")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (asset) query = query.eq("asset", asset);

    const { data } = await query;
    const trades = data || [];

    if (trades.length === 0) {
      return {
        totalTrades: 0, winRate: 0, avgPnlPct: 0, totalPnlUsd: 0,
        maxDrawdownPct: 0, profitFactor: 0, avgDuration: 0,
        bestTrade: 0, worstTrade: 0, byStrategy: {}, byCloseReason: {},
      };
    }

    const wins = trades.filter(t => t.is_win);
    const losses = trades.filter(t => !t.is_win);
    const totalPnl = trades.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const grossProfit = wins.reduce((s, t) => s + (t.pnl_usd || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl_usd || 0), 0));

    // Max drawdown calculation
    let peak = 0, maxDD = 0, cumPnl = 0;
    for (const t of trades) {
      cumPnl += t.pnl_pct || 0;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDD) maxDD = dd;
    }

    // By strategy
    const byStrategy: Record<string, { count: number; wins: number; totalPnl: number }> = {};
    for (const t of trades) {
      const s = t.strategy_type || "unknown";
      if (!byStrategy[s]) byStrategy[s] = { count: 0, wins: 0, totalPnl: 0 };
      byStrategy[s].count++;
      if (t.is_win) byStrategy[s].wins++;
      byStrategy[s].totalPnl += t.pnl_pct || 0;
    }

    // By close reason
    const byCloseReason: Record<string, number> = {};
    for (const t of trades) {
      const r = t.close_reason || "unknown";
      byCloseReason[r] = (byCloseReason[r] || 0) + 1;
    }

    return {
      totalTrades: trades.length,
      winRate: (wins.length / trades.length) * 100,
      avgPnlPct: trades.reduce((s, t) => s + (t.pnl_pct || 0), 0) / trades.length,
      totalPnlUsd: totalPnl,
      maxDrawdownPct: maxDD,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      avgDuration: trades.reduce((s, t) => s + (t.duration_seconds || 0), 0) / trades.length,
      bestTrade: Math.max(...trades.map(t => t.pnl_pct || 0)),
      worstTrade: Math.min(...trades.map(t => t.pnl_pct || 0)),
      byStrategy: Object.fromEntries(
        Object.entries(byStrategy).map(([k, v]) => [k, {
          count: v.count,
          winRate: (v.wins / v.count) * 100,
          avgPnl: v.totalPnl / v.count,
        }])
      ),
      byCloseReason,
    };
  }
}
