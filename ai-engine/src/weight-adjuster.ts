/**
 * Automated Model Weight Adjuster
 *
 * Phase 6.2: Hourly model weight recalculation based on recent performance.
 * Updates the ai_model_accuracy table which feeds into model-weights.ts consensus.
 *
 * Algorithm:
 *   1. Compute per-model accuracy over 7d and 30d windows
 *   2. Compute RAG accuracy (accuracy in similar market conditions)
 *   3. Apply penalty for models with < 40% accuracy (deweight)
 *   4. Apply bonus for models with > 80% accuracy (upweight)
 *   5. Normalize so total weight sums to 1.0
 *   6. Save new weights to database
 *
 * Reference: TECHNICAL_PLAN.md Phase 6.2
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────

export interface ModelPerformance {
  model: string;
  asset: string;
  timeframe: string;
  // 7-day window
  predictions7d: number;
  correct7d: number;
  accuracy7d: number;
  avgPnl7d: number;
  // 30-day window
  predictions30d: number;
  correct30d: number;
  accuracy30d: number;
  avgPnl30d: number;
  // RAG accuracy
  ragAccuracy: number;
  // Final computed weight
  computedWeight: number;
  // Flags
  penalized: boolean;   // accuracy < 40%
  boosted: boolean;     // accuracy > 80%
}

export interface WeightAdjustmentResult {
  timestamp: string;
  modelsAdjusted: number;
  assetsCovered: string[];
  performances: ModelPerformance[];
  totalPredictions: number;
  overallAccuracy: number;
}

// ── Weight Adjuster ─────────────────────────────────────────

export class WeightAdjuster {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Run the full weight adjustment cycle.
   * Call this hourly via cron or Supabase Edge Function scheduler.
   */
  async adjustWeights(): Promise<WeightAdjustmentResult> {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 86400_000).toISOString();

    // 1. Fetch all resolved predictions from the last 30 days
    const { data: predictions } = await this.supabase
      .from("ai_prediction_records")
      .select("model, asset, timeframe, prediction, confidence, direction_correct, actual_change_pct, created_at")
      .not("direction_correct", "is", null)
      .gte("created_at", since30d)
      .order("created_at", { ascending: false });

    if (!predictions || predictions.length === 0) {
      return {
        timestamp: now.toISOString(),
        modelsAdjusted: 0,
        assetsCovered: [],
        performances: [],
        totalPredictions: 0,
        overallAccuracy: 0,
      };
    }

    // 2. Group by model × asset × timeframe
    const groups = new Map<string, typeof predictions>();
    for (const p of predictions) {
      const key = `${p.model}:${p.asset}:${p.timeframe}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    // 3. Calculate performance for each group
    const performances: ModelPerformance[] = [];
    const assets = new Set<string>();

    for (const [key, preds] of groups) {
      const [model, asset, timeframe] = key.split(":");
      assets.add(asset);

      // 7d subset
      const preds7d = preds.filter(p => p.created_at >= since7d);
      const correct7d = preds7d.filter(p => p.direction_correct).length;
      const accuracy7d = preds7d.length > 0 ? (correct7d / preds7d.length) * 100 : 50;
      const avgPnl7d = preds7d.length > 0
        ? preds7d.reduce((s, p) => s + (p.actual_change_pct || 0), 0) / preds7d.length
        : 0;

      // 30d
      const correct30d = preds.filter(p => p.direction_correct).length;
      const accuracy30d = preds.length > 0 ? (correct30d / preds.length) * 100 : 50;
      const avgPnl30d = preds.length > 0
        ? preds.reduce((s, p) => s + (p.actual_change_pct || 0), 0) / preds.length
        : 0;

      // RAG accuracy = accuracy in similar market conditions (approximated by weighted recent)
      const ragAccuracy = preds7d.length >= 3
        ? accuracy7d * 0.7 + accuracy30d * 0.3
        : accuracy30d;

      // Compute raw weight: 40% × 7d + 30% × 30d + 30% × RAG
      let rawWeight = (accuracy7d * 0.4 + accuracy30d * 0.3 + ragAccuracy * 0.3) / 100;

      // Penalize poor performers
      const blendedAccuracy = (accuracy7d + accuracy30d) / 2;
      const penalized = blendedAccuracy < 40;
      const boosted = blendedAccuracy > 80;

      if (penalized) rawWeight = Math.max(0.1, rawWeight * 0.5);
      if (boosted) rawWeight = Math.min(2.0, rawWeight * 1.3);

      performances.push({
        model, asset, timeframe,
        predictions7d: preds7d.length,
        correct7d,
        accuracy7d: parseFloat(accuracy7d.toFixed(2)),
        avgPnl7d: parseFloat(avgPnl7d.toFixed(4)),
        predictions30d: preds.length,
        correct30d,
        accuracy30d: parseFloat(accuracy30d.toFixed(2)),
        avgPnl30d: parseFloat(avgPnl30d.toFixed(4)),
        ragAccuracy: parseFloat(ragAccuracy.toFixed(2)),
        computedWeight: parseFloat(rawWeight.toFixed(4)),
        penalized,
        boosted,
      });
    }

    // 4. Normalize weights per asset×timeframe group
    const atGroups = new Map<string, ModelPerformance[]>();
    for (const p of performances) {
      const key = `${p.asset}:${p.timeframe}`;
      if (!atGroups.has(key)) atGroups.set(key, []);
      atGroups.get(key)!.push(p);
    }

    for (const [, group] of atGroups) {
      const totalWeight = group.reduce((s, p) => s + p.computedWeight, 0);
      if (totalWeight > 0) {
        for (const p of group) {
          p.computedWeight = parseFloat((p.computedWeight / totalWeight).toFixed(4));
        }
      }
    }

    // 5. Save updated accuracy/weights to database
    await this.saveWeights(performances);

    // 6. Log adjustment event
    const totalCorrect = predictions.filter(p => p.direction_correct).length;
    const result: WeightAdjustmentResult = {
      timestamp: now.toISOString(),
      modelsAdjusted: performances.length,
      assetsCovered: [...assets],
      performances,
      totalPredictions: predictions.length,
      overallAccuracy: parseFloat(((totalCorrect / predictions.length) * 100).toFixed(2)),
    };

    await this.logAdjustment(result);
    return result;
  }

  /**
   * Save computed weights back to ai_model_accuracy table.
   */
  private async saveWeights(performances: ModelPerformance[]): Promise<void> {
    for (const p of performances) {
      // Upsert 7d accuracy
      await this.supabase.from("ai_model_accuracy").upsert({
        model: p.model,
        asset: p.asset,
        timeframe: p.timeframe,
        period: "7d",
        accuracy_pct: p.accuracy7d,
        total_predictions: p.predictions7d,
        avg_confidence: 0, // Would need actual confidence data
        computed_weight: p.computedWeight,
        updated_at: new Date().toISOString(),
      }, { onConflict: "model,asset,timeframe,period" });

      // Upsert 30d accuracy
      await this.supabase.from("ai_model_accuracy").upsert({
        model: p.model,
        asset: p.asset,
        timeframe: p.timeframe,
        period: "30d",
        accuracy_pct: p.accuracy30d,
        total_predictions: p.predictions30d,
        avg_confidence: 0,
        computed_weight: p.computedWeight,
        updated_at: new Date().toISOString(),
      }, { onConflict: "model,asset,timeframe,period" });
    }
  }

  /**
   * Log the adjustment event for audit trail.
   */
  private async logAdjustment(result: WeightAdjustmentResult): Promise<void> {
    await this.supabase.from("weight_adjustment_log").insert({
      timestamp: result.timestamp,
      models_adjusted: result.modelsAdjusted,
      assets_covered: result.assetsCovered,
      total_predictions: result.totalPredictions,
      overall_accuracy: result.overallAccuracy,
      details: result.performances,
    }).then(() => {}).catch(() => {});
  }

  /**
   * Get the current model weights for display in admin/dashboard.
   */
  async getCurrentWeights(asset?: string): Promise<Array<{
    model: string;
    asset: string;
    weight: number;
    accuracy7d: number;
    accuracy30d: number;
    predictions: number;
  }>> {
    let query = this.supabase
      .from("ai_model_accuracy")
      .select("model, asset, accuracy_pct, total_predictions, computed_weight, period")
      .eq("period", "30d")
      .order("computed_weight", { ascending: false });

    if (asset) query = query.eq("asset", asset);

    const { data } = await query;
    if (!data) return [];

    // Merge 7d data
    const { data: data7d } = await this.supabase
      .from("ai_model_accuracy")
      .select("model, asset, accuracy_pct")
      .eq("period", "7d");

    const acc7dMap = new Map<string, number>();
    for (const r of (data7d || [])) {
      acc7dMap.set(`${r.model}:${r.asset}`, r.accuracy_pct);
    }

    return data.map(row => ({
      model: row.model,
      asset: row.asset,
      weight: row.computed_weight || 1.0,
      accuracy7d: acc7dMap.get(`${row.model}:${row.asset}`) || 50,
      accuracy30d: row.accuracy_pct,
      predictions: row.total_predictions,
    }));
  }
}
