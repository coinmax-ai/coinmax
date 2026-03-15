/**
 * Strategy Parameter Tuner
 *
 * Phase 6.4: Grid search optimization over strategy parameters.
 * Uses backtest results to find optimal parameter combinations.
 *
 * Tunable parameters:
 *   - min_confidence threshold (50-90)
 *   - stop_loss / take_profit ratios
 *   - position_size per confidence level
 *   - cooldown periods
 *   - max concurrent positions
 *   - leverage per strength level
 *
 * Method: Grid search → backtest each combo → rank by Sharpe / PnL
 *
 * Reference: TECHNICAL_PLAN.md Phase 6.4
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BacktestEngine, type BacktestConfig, type BacktestReport } from "./auto-backtest";

// ── Types ───────────────────────────────────────────────────

export interface TuningParam {
  name: string;
  values: number[];
  description: string;
}

export interface ParamCombination {
  strongConfidence: number;
  mediumConfidence: number;
  weakConfidence: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxLeverage: number;
  maxPositionSizePct: number;
  maxConcurrentPositions: number;
  cooldownMinutes: number;
}

export interface TuningResult {
  id: string;
  startedAt: string;
  completedAt: string;
  totalCombinations: number;
  combinationsRun: number;
  bestParams: ParamCombination;
  bestSharpe: number;
  bestPnlPct: number;
  bestWinRate: number;
  // Top 5 results
  topResults: Array<{
    rank: number;
    params: ParamCombination;
    sharpe: number;
    pnlPct: number;
    winRate: number;
    maxDrawdown: number;
    profitFactor: number;
    trades: number;
  }>;
  // Current vs best
  currentParams: ParamCombination;
  improvement: {
    sharpeDelta: number;
    pnlDelta: number;
    winRateDelta: number;
  };
}

// ── Default Search Space ────────────────────────────────────

const DEFAULT_SEARCH_SPACE: TuningParam[] = [
  { name: "strongConfidence", values: [70, 75, 80], description: "STRONG 信号最低置信度" },
  { name: "stopLossPct", values: [0.015, 0.02, 0.025, 0.03], description: "止损百分比" },
  { name: "takeProfitPct", values: [0.025, 0.03, 0.04, 0.05], description: "止盈百分比" },
  { name: "maxLeverage", values: [3, 5, 7], description: "最大杠杆" },
  { name: "maxPositionSizePct", values: [0.05, 0.1, 0.15], description: "最大仓位占比" },
];

// Current default parameters (matching signal-filter.ts defaults)
const CURRENT_PARAMS: ParamCombination = {
  strongConfidence: 75,
  mediumConfidence: 60,
  weakConfidence: 50,
  stopLossPct: 0.02,
  takeProfitPct: 0.03,
  maxLeverage: 5,
  maxPositionSizePct: 0.1,
  maxConcurrentPositions: 3,
  cooldownMinutes: 1,
};

// ── Strategy Tuner ──────────────────────────────────────────

export class StrategyTuner {
  private supabase: SupabaseClient;
  private backtester: BacktestEngine;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.backtester = new BacktestEngine(supabaseUrl, supabaseKey);
  }

  /**
   * Run a grid search over the parameter space.
   * Uses pre-computed backtest data to speed up evaluation.
   */
  async runTuning(
    searchSpace?: TuningParam[],
    backtestConfig?: Partial<BacktestConfig>,
  ): Promise<TuningResult> {
    const space = searchSpace || DEFAULT_SEARCH_SPACE;
    const startedAt = new Date().toISOString();
    const resultId = crypto.randomUUID();

    // 1. Generate all parameter combinations
    const combinations = this.generateCombinations(space);

    // 2. Run backtest for each combination (with early stopping)
    const results: Array<{
      params: ParamCombination;
      report: BacktestReport;
    }> = [];

    // Cap at 50 combinations to avoid excessive runtime
    const maxCombinations = Math.min(combinations.length, 50);
    const sampledCombos = combinations.length > maxCombinations
      ? this.sampleCombinations(combinations, maxCombinations)
      : combinations;

    for (const combo of sampledCombos) {
      const report = await this.backtester.runBacktest({
        ...backtestConfig,
        maxPositionSizePct: combo.maxPositionSizePct,
        maxConcurrentPositions: combo.maxConcurrentPositions,
        filterConfig: {
          strongConfidence: combo.strongConfidence,
          mediumConfidence: combo.mediumConfidence,
          weakConfidence: combo.weakConfidence,
          maxLeverage: combo.maxLeverage,
          baseStopLoss: combo.stopLossPct,
          baseTakeProfit: combo.takeProfitPct,
        },
      });

      results.push({ params: combo, report });
    }

    // 3. Rank by composite score: Sharpe (40%) + PnL% (30%) + WinRate (20%) + -MaxDD (10%)
    const scored = results.map(r => ({
      ...r,
      score: this.compositeScore(r.report),
    })).sort((a, b) => b.score - a.score);

    // 4. Get top 5
    const topResults = scored.slice(0, 5).map((r, i) => ({
      rank: i + 1,
      params: r.params,
      sharpe: r.report.sharpeRatio,
      pnlPct: r.report.totalPnlPct,
      winRate: r.report.winRate,
      maxDrawdown: r.report.maxDrawdownPct,
      profitFactor: r.report.profitFactor,
      trades: r.report.totalTrades,
    }));

    // 5. Run current params for comparison
    const currentReport = await this.backtester.runBacktest({
      ...backtestConfig,
      maxPositionSizePct: CURRENT_PARAMS.maxPositionSizePct,
      maxConcurrentPositions: CURRENT_PARAMS.maxConcurrentPositions,
      filterConfig: {
        strongConfidence: CURRENT_PARAMS.strongConfidence,
        mediumConfidence: CURRENT_PARAMS.mediumConfidence,
        weakConfidence: CURRENT_PARAMS.weakConfidence,
        maxLeverage: CURRENT_PARAMS.maxLeverage,
        baseStopLoss: CURRENT_PARAMS.stopLossPct,
        baseTakeProfit: CURRENT_PARAMS.takeProfitPct,
      },
    });

    const best = topResults[0];
    const result: TuningResult = {
      id: resultId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalCombinations: combinations.length,
      combinationsRun: sampledCombos.length,
      bestParams: best?.params || CURRENT_PARAMS,
      bestSharpe: best?.sharpe || 0,
      bestPnlPct: best?.pnlPct || 0,
      bestWinRate: best?.winRate || 0,
      topResults,
      currentParams: CURRENT_PARAMS,
      improvement: {
        sharpeDelta: (best?.sharpe || 0) - currentReport.sharpeRatio,
        pnlDelta: (best?.pnlPct || 0) - currentReport.totalPnlPct,
        winRateDelta: (best?.winRate || 0) - currentReport.winRate,
      },
    };

    // 6. Store tuning result
    await this.storeTuningResult(result);

    return result;
  }

  /**
   * Generate all combinations from the search space.
   */
  private generateCombinations(space: TuningParam[]): ParamCombination[] {
    const combinations: ParamCombination[] = [];

    // Build cartesian product
    const paramArrays = space.map(p => p.values);
    const paramNames = space.map(p => p.name);

    const cartesian = (arrays: number[][]): number[][] => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restProducts = cartesian(rest);
      return first.flatMap(val => restProducts.map(rest => [val, ...rest]));
    };

    const products = cartesian(paramArrays);

    for (const values of products) {
      const combo = { ...CURRENT_PARAMS };
      for (let i = 0; i < paramNames.length; i++) {
        (combo as any)[paramNames[i]] = values[i];
      }

      // Derived: mediumConfidence = strongConfidence - 15, weakConfidence = strongConfidence - 25
      if (combo.strongConfidence) {
        combo.mediumConfidence = combo.strongConfidence - 15;
        combo.weakConfidence = combo.strongConfidence - 25;
      }

      // Ensure TP > SL (minimum 1.2x ratio for positive expectancy)
      if (combo.takeProfitPct < combo.stopLossPct * 1.2) continue;

      combinations.push(combo);
    }

    return combinations;
  }

  /**
   * Randomly sample N combinations from a larger set.
   */
  private sampleCombinations(combos: ParamCombination[], n: number): ParamCombination[] {
    const shuffled = [...combos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }

  /**
   * Composite score for ranking parameter combinations.
   * Sharpe 40% + PnL 30% + WinRate 20% + low drawdown 10%
   */
  private compositeScore(report: BacktestReport): number {
    const sharpNorm = Math.min(report.sharpeRatio / 3, 1);       // Normalize to 0-1 (3 = excellent)
    const pnlNorm = Math.min(Math.max(report.totalPnlPct / 50, -1), 1); // Normalize to -1..1 (50% = max)
    const winNorm = report.winRate / 100;                         // Already 0-1
    const ddNorm = Math.max(0, 1 - report.maxDrawdownPct / 20);  // 20% DD = 0 score

    return sharpNorm * 0.4 + pnlNorm * 0.3 + winNorm * 0.2 + ddNorm * 0.1;
  }

  /**
   * Store tuning result to database.
   */
  private async storeTuningResult(result: TuningResult): Promise<void> {
    await this.supabase.from("tuning_results").insert({
      id: result.id,
      started_at: result.startedAt,
      completed_at: result.completedAt,
      total_combinations: result.totalCombinations,
      combinations_run: result.combinationsRun,
      best_params: result.bestParams,
      best_sharpe: result.bestSharpe,
      best_pnl_pct: result.bestPnlPct,
      best_win_rate: result.bestWinRate,
      top_results: result.topResults,
      current_params: result.currentParams,
      improvement: result.improvement,
    }).then(() => {}).catch(() => {});
  }

  /**
   * Apply the best parameters from the latest tuning run.
   * Updates the active filter configuration in the database.
   */
  async applyBestParams(): Promise<ParamCombination | null> {
    const { data } = await this.supabase
      .from("tuning_results")
      .select("best_params, improvement")
      .order("completed_at", { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return null;

    const bestParams = data[0].best_params as ParamCombination;
    const improvement = data[0].improvement;

    // Only apply if improvement is meaningful (> 5% PnL improvement)
    if (improvement.pnlDelta < 5) return null;

    // Store as active configuration
    await this.supabase.from("active_config").upsert({
      key: "filter_config",
      value: {
        strongConfidence: bestParams.strongConfidence,
        mediumConfidence: bestParams.mediumConfidence,
        weakConfidence: bestParams.weakConfidence,
        maxLeverage: bestParams.maxLeverage,
        baseStopLoss: bestParams.stopLossPct,
        baseTakeProfit: bestParams.takeProfitPct,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return bestParams;
  }
}
