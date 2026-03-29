/**
 * AI Model & Strategy Selector for Copy Trading
 *
 * Lets users pick which AI models and strategies to follow.
 * Fetches real accuracy data from ai_model_accuracy table.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  icon: string;
  accuracy7d: number;
  totalTrades: number;
  winRate: number;
  weight: number;
}

const MODEL_META: Record<string, { name: string; provider: string; icon: string }> = {
  "gpt-4o": { name: "GPT-4o", provider: "OpenAI", icon: "🟢" },
  "claude-haiku": { name: "Claude Haiku 4.5", provider: "Anthropic", icon: "🟠" },
  "gemini-flash": { name: "Gemini 2.5 Flash", provider: "Google", icon: "🔵" },
  "deepseek-v3": { name: "DeepSeek V3", provider: "DeepSeek", icon: "🟣" },
  "llama-3.1-8b": { name: "Llama 3.1 8B", provider: "Cloudflare", icon: "🦙" },
};

const STRATEGY_GROUPS: { groupKey: string; strategies: { id: string; nameKey: string; descKey: string }[] }[] = [
  {
    groupKey: "strategy.groupTrendFollowing",
    strategies: [
      { id: "trend_following", nameKey: "strategy.trendFollowing", descKey: "strategy.trendFollowingDesc" },
      { id: "momentum", nameKey: "strategy.momentum", descKey: "strategy.momentumDesc" },
      { id: "breakout", nameKey: "strategy.breakout", descKey: "strategy.breakoutDesc" },
      { id: "swing", nameKey: "strategy.swing", descKey: "strategy.swingDesc" },
      { id: "ichimoku", nameKey: "strategy.ichimoku", descKey: "strategy.ichimokuDesc" },
      { id: "donchian", nameKey: "strategy.donchian", descKey: "strategy.donchianDesc" },
    ],
  },
  {
    groupKey: "strategy.groupMeanReversion",
    strategies: [
      { id: "mean_reversion", nameKey: "strategy.meanReversion", descKey: "strategy.meanReversionDesc" },
      { id: "bb_squeeze", nameKey: "strategy.bbSqueeze", descKey: "strategy.bbSqueezeDesc" },
      { id: "rsi_divergence", nameKey: "strategy.rsiDivergence", descKey: "strategy.rsiDivergenceDesc" },
      { id: "vwap_reversion", nameKey: "strategy.vwapReversion", descKey: "strategy.vwapReversionDesc" },
      { id: "stochastic", nameKey: "strategy.stochastic", descKey: "strategy.stochasticDesc" },
    ],
  },
  {
    groupKey: "strategy.groupQuantitative",
    strategies: [
      { id: "grid", nameKey: "strategy.grid", descKey: "strategy.gridDesc" },
      { id: "dca", nameKey: "strategy.dca", descKey: "strategy.dcaDesc" },
      { id: "scalping", nameKey: "strategy.scalping", descKey: "strategy.scalpingDesc" },
      { id: "market_making", nameKey: "strategy.marketMaking", descKey: "strategy.marketMakingDesc" },
      { id: "twap", nameKey: "strategy.twap", descKey: "strategy.twapDesc" },
      { id: "avellaneda", nameKey: "strategy.avellaneda", descKey: "strategy.avellanedaDesc" },
    ],
  },
  {
    groupKey: "strategy.groupOther",
    strategies: [
      { id: "pattern", nameKey: "strategy.pattern", descKey: "strategy.patternDesc" },
      { id: "arbitrage", nameKey: "strategy.arbitrage", descKey: "strategy.arbitrageDesc" },
      { id: "position_executor", nameKey: "strategy.positionExecutor", descKey: "strategy.positionExecutorDesc" },
    ],
  },
];

interface Props {
  selectedModels: string[];
  selectedStrategies: string[];
  onModelsChange: (models: string[]) => void;
  onStrategiesChange: (strategies: string[]) => void;
}

export function ModelStrategySelector({ selectedModels, selectedStrategies, onModelsChange, onStrategiesChange }: Props) {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"models" | "strategies">("models");

  useEffect(() => {
    async function fetchModelAccuracy() {
      const { data } = await supabase
        .from("ai_model_accuracy")
        .select("model, accuracy_pct, total_trades, wins, computed_weight")
        .eq("period", "7d")
        .eq("asset", "ALL");

      const modelList: ModelInfo[] = Object.entries(MODEL_META).map(([id, meta]) => {
        const row = data?.find(d => d.model === id);
        return {
          id,
          ...meta,
          accuracy7d: row?.accuracy_pct ?? 0,
          totalTrades: row?.total_trades ?? 0,
          winRate: row ? (row.wins / Math.max(row.total_trades, 1)) * 100 : 0,
          weight: row?.computed_weight ?? 0.2,
        };
      });

      setModels(modelList);
      setLoading(false);
    }

    fetchModelAccuracy();
  }, []);

  const toggleModel = (id: string) => {
    onModelsChange(
      selectedModels.includes(id)
        ? selectedModels.filter(m => m !== id)
        : [...selectedModels, id]
    );
  };

  const toggleStrategy = (id: string) => {
    onStrategiesChange(
      selectedStrategies.includes(id)
        ? selectedStrategies.filter(s => s !== id)
        : [...selectedStrategies, id]
    );
  };

  const selectAllStrategies = () => {
    const all = STRATEGY_GROUPS.flatMap(g => g.strategies.map(s => s.id));
    onStrategiesChange(selectedStrategies.length === all.length ? [] : all);
  };

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02]" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => setSection("models")}
          className={cn(
            "flex-1 text-center py-2 rounded-lg text-xs font-semibold transition-colors",
            section === "models" ? "bg-primary/10 text-primary" : "text-foreground/30"
          )}
        >
          {t("strategy.aiModels")} ({selectedModels.length}/5)
        </button>
        <button
          onClick={() => setSection("strategies")}
          className={cn(
            "flex-1 text-center py-2 rounded-lg text-xs font-semibold transition-colors",
            section === "strategies" ? "bg-primary/10 text-primary" : "text-foreground/30"
          )}
        >
          {t("strategy.strategies")} ({selectedStrategies.length}/20)
        </button>
      </div>

      {section === "models" && (
        <div className="space-y-2">
          <p className="text-[10px] text-foreground/25 px-1">{t("strategy.selectModels")}</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}
            </div>
          ) : (
            models.map(model => {
              const selected = selectedModels.includes(model.id);
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-colors",
                    selected
                      ? "bg-primary/8 border border-primary/20"
                      : "bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{model.icon}</span>
                      <div>
                        <p className={cn("text-xs font-bold", selected ? "text-primary" : "text-foreground/60")}>{model.name}</p>
                        <p className="text-[10px] text-foreground/25">{model.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={cn("text-xs font-bold", model.accuracy7d > 60 ? "text-green-400" : model.accuracy7d > 40 ? "text-yellow-400" : "text-foreground/40")}>
                          {model.accuracy7d.toFixed(1)}%
                        </p>
                        <p className="text-[9px] text-foreground/20">{t("strategy.accuracy7d")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-foreground/40">{model.totalTrades}</p>
                        <p className="text-[9px] text-foreground/20">{t("strategy.tradeCount")}</p>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        selected ? "border-primary bg-primary" : "border-foreground/15"
                      )}>
                        {selected && <span className="text-[10px] text-white font-bold">✓</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {selectedModels.length === 0 && !loading && (
            <p className="text-[10px] text-yellow-400/60 text-center py-2">{t("strategy.selectAtLeast1")}</p>
          )}
        </div>
      )}

      {section === "strategies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] text-foreground/25">{t("strategy.selectStrategies")}</p>
            <button
              onClick={selectAllStrategies}
              className="text-[10px] text-primary/60 hover:text-primary transition-colors"
            >
              {selectedStrategies.length === 20 ? t("strategy.deselectAll") : t("strategy.selectAll")}
            </button>
          </div>

          {STRATEGY_GROUPS.map(group => (
            <div key={group.groupKey} className="rounded-xl bg-white/[0.02] p-3" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <h4 className="text-[11px] font-bold text-foreground/40 mb-2">{t(group.groupKey)}</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.strategies.map(s => {
                  const selected = selectedStrategies.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleStrategy(s.id)}
                      title={t(s.descKey)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                        selected
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-white/[0.03] text-foreground/30 border border-white/[0.04] hover:text-foreground/50"
                      )}
                    >
                      {t(s.nameKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
