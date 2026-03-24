/**
 * Copy Trading Flow — Reusable Component
 *
 * Complete copy trading setup wizard:
 * Step 1: Bind exchange API
 * Step 2: Select AI models & strategies
 * Step 3: Risk control settings
 * Step 4: AI parameter suggestions & revenue sharing
 *
 * Used in:
 * - /copy-trading (standalone page)
 * - Strategy page (after VIP subscription)
 * - Admin panel (user management)
 */

import { useState, useEffect } from "react";
import { ModelStrategySelector } from "@/components/strategy/model-strategy-selector";
import { AIParamAdvisor } from "@/components/strategy/ai-param-advisor";
import { RiskControlPanel } from "@/components/strategy/risk-control";
import { ApiKeyBind } from "@/components/strategy/api-key-bind";
import { AICoinPicker } from "@/components/strategy/ai-coin-picker";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type CopyStep = "bind" | "config" | "risk" | "confirm";

interface CopyTradingFlowProps {
  /** profiles.id (UUID) — required for saving configs */
  userId?: string;
  /** Show step navigation at top */
  showSteps?: boolean;
  /** Compact layout for embedded use */
  compact?: boolean;
  /** Read-only mode (admin viewing user config) */
  readOnly?: boolean;
  /** Initial step */
  initialStep?: CopyStep;
  /** Callback when step changes */
  onStepChange?: (step: CopyStep) => void;
}

export function CopyTradingFlow({
  userId,
  showSteps = true,
  compact = false,
  readOnly = false,
  initialStep = "bind",
  onStepChange,
}: CopyTradingFlowProps) {
  const [step, setStep] = useState<CopyStep>(initialStep);
  const [selectedModels, setSelectedModels] = useState<string[]>(["gpt-4o", "claude-haiku", "gemini-flash"]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([
    "trend_following", "momentum", "breakout", "mean_reversion", "bb_squeeze",
  ]);
  const [riskOverrides, setRiskOverrides] = useState<any>(undefined);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved config from DB
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_risk_config")
      .select("selected_models, selected_strategies")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          if (data.selected_models?.length) setSelectedModels(data.selected_models);
          if (data.selected_strategies?.length) setSelectedStrategies(data.selected_strategies);
        }
        setConfigLoaded(true);
      });
  }, [userId]);

  // Auto-save model/strategy selections (debounced)
  useEffect(() => {
    if (!userId || !configLoaded || readOnly) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      await supabase.from("user_risk_config").upsert({
        user_id: userId,
        selected_models: selectedModels,
        selected_strategies: selectedStrategies,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      setSaving(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedModels, selectedStrategies, userId, configLoaded, readOnly]);

  const goTo = (s: CopyStep) => {
    setStep(s);
    onStepChange?.(s);
  };

  const steps: { id: CopyStep; label: string; num: number }[] = [
    { id: "bind", label: "绑定交易所", num: 1 },
    { id: "config", label: "选择策略", num: 2 },
    { id: "risk", label: "风控设置", num: 3 },
    { id: "confirm", label: "AI建议", num: 4 },
  ];

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      {showSteps && (
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => goTo(s.id)}
                className={cn(
                  "flex items-center gap-1.5 w-full px-2 py-2 rounded-lg text-[11px] font-semibold transition-colors",
                  step === s.id ? "bg-primary/10 text-primary" : "text-foreground/25 hover:text-foreground/40"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0",
                  step === s.id ? "bg-primary text-white" : "bg-foreground/8 text-foreground/30"
                )}>{s.num}</span>
                <span className={compact ? "hidden sm:inline" : ""}>{s.label}</span>
              </button>
              {i < steps.length - 1 && <div className="w-2 h-px bg-foreground/10 shrink-0" />}
            </div>
          ))}
          {saving && <span className="text-[9px] text-foreground/20 animate-pulse shrink-0 ml-2">保存中</span>}
        </div>
      )}

      {/* Step 1: Bind exchange */}
      {step === "bind" && (
        <div className="space-y-4">
          <ApiKeyBind userId={userId} />
          <NavButtons onNext={() => goTo("config")} nextLabel="下一步：选择策略" />
        </div>
      )}

      {/* Step 2: Select models & strategies */}
      {step === "config" && (
        <div className="space-y-4">
          <ModelStrategySelector
            selectedModels={selectedModels}
            selectedStrategies={selectedStrategies}
            onModelsChange={readOnly ? () => {} : setSelectedModels}
            onStrategiesChange={readOnly ? () => {} : setSelectedStrategies}
          />
          <AICoinPicker compact />
          <NavButtons
            onPrev={() => goTo("bind")}
            onNext={() => goTo("risk")}
            nextLabel="下一步：风控设置"
          />
        </div>
      )}

      {/* Step 3: Risk control */}
      {step === "risk" && (
        <div className="space-y-4">
          <RiskControlPanel userId={userId} initialOverrides={riskOverrides} />
          <NavButtons
            onPrev={() => goTo("config")}
            onNext={() => goTo("confirm")}
            nextLabel="下一步：AI建议"
          />
        </div>
      )}

      {/* Step 4: AI suggestion & confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <AIParamAdvisor
            selectedModels={selectedModels}
            selectedStrategies={selectedStrategies}
            onApplyParams={(params) => {
              setRiskOverrides({
                maxPositionSizeUsd: params.positionSizeUsd,
                maxLeverage: params.leverage,
                maxDrawdownPct: params.maxDrawdownPct,
                maxConcurrentPositions: params.maxConcurrent,
              });
              goTo("risk");
            }}
          />
          <NavButtons onPrev={() => goTo("risk")} />
        </div>
      )}
    </div>
  );
}

function NavButtons({ onPrev, onNext, nextLabel }: {
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      {onPrev && (
        <button
          onClick={onPrev}
          className="flex-1 py-2.5 rounded-xl bg-foreground/5 text-foreground/40 text-xs font-bold hover:bg-foreground/10 transition-colors"
        >
          上一步
        </button>
      )}
      {onNext && (
        <button
          onClick={onNext}
          className="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
        >
          {nextLabel || "下一步"}
        </button>
      )}
    </div>
  );
}
