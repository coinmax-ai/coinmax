/**
 * Risk Control Panel
 *
 * Phase 5.3: User-configurable risk parameters for copy trading.
 * Controls position sizing, leverage limits, daily loss limits, and kill switch.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface RiskConfig {
  maxPositionSizeUsd: number;
  maxConcurrentPositions: number;
  maxDailyLossUsd: number;
  maxDrawdownPct: number;
  maxLeverage: number;
  allowedAssets: string[];
  copyEnabled: boolean;
  executionMode: "PAPER" | "SIGNAL" | "SEMI_AUTO" | "FULL_AUTO";
  tradingHoursEnabled: boolean;
  tradingHoursStart: number;
  tradingHoursEnd: number;
  cooldownMinutes: number;
  minSignalStrength: "STRONG" | "MEDIUM" | "WEAK";
}

const DEFAULT_CONFIG: RiskConfig = {
  maxPositionSizeUsd: 1000,
  maxConcurrentPositions: 3,
  maxDailyLossUsd: 200,
  maxDrawdownPct: 10,
  maxLeverage: 5,
  allowedAssets: ["BTC", "ETH", "SOL", "BNB"],
  copyEnabled: false,
  executionMode: "PAPER",
  tradingHoursEnabled: false,
  tradingHoursStart: 8,
  tradingHoursEnd: 22,
  cooldownMinutes: 1,
  minSignalStrength: "MEDIUM",
};

const ALL_ASSETS = ["BTC", "ETH", "SOL", "BNB", "DOGE", "XRP", "AVAX", "ARB", "OP", "SUI"];
const EXECUTION_MODES = [
  { value: "PAPER", labelKey: "strategy.modePaper", descKey: "strategy.modePaperDesc" },
  { value: "SIGNAL", labelKey: "strategy.modeSignal", descKey: "strategy.modeSignalDesc" },
  { value: "SEMI_AUTO", labelKey: "strategy.modeSemiAuto", descKey: "strategy.modeSemiAutoDesc" },
  { value: "FULL_AUTO", labelKey: "strategy.modeFullAuto", descKey: "strategy.modeFullAutoDesc" },
];

interface RiskControlProps {
  userId?: string;
  initialOverrides?: Partial<RiskConfig>;
}

export function RiskControlPanel({ userId, initialOverrides }: RiskControlProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  // Apply AI-suggested param overrides
  useEffect(() => {
    if (initialOverrides) {
      setConfig(prev => ({ ...prev, ...initialOverrides }));
    }
  }, [initialOverrides]);

  // Load user's risk config
  useEffect(() => {
    if (!userId) return;

    supabase
      .from("user_risk_config")
      .select("*")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setConfig({
            maxPositionSizeUsd: data.max_position_size_usd,
            maxConcurrentPositions: data.max_concurrent_positions,
            maxDailyLossUsd: data.max_daily_loss_usd,
            maxDrawdownPct: data.max_drawdown_pct,
            maxLeverage: data.max_leverage,
            allowedAssets: data.allowed_assets || DEFAULT_CONFIG.allowedAssets,
            copyEnabled: data.copy_enabled,
            executionMode: data.execution_mode,
            tradingHoursEnabled: data.trading_hours_enabled,
            tradingHoursStart: data.trading_hours_start,
            tradingHoursEnd: data.trading_hours_end,
            cooldownMinutes: data.cooldown_minutes,
            minSignalStrength: data.min_signal_strength,
          });
          setKillSwitchActive(data.kill_switch);
        }
      });
  }, [userId]);

  const saveConfig = async () => {
    if (!userId) return;
    setSaving(true);

    await supabase.from("user_risk_config").upsert({
      user_id: userId,
      max_position_size_usd: config.maxPositionSizeUsd,
      max_concurrent_positions: config.maxConcurrentPositions,
      max_daily_loss_usd: config.maxDailyLossUsd,
      max_drawdown_pct: config.maxDrawdownPct,
      max_leverage: config.maxLeverage,
      allowed_assets: config.allowedAssets,
      copy_enabled: config.copyEnabled,
      execution_mode: config.executionMode,
      trading_hours_enabled: config.tradingHoursEnabled,
      trading_hours_start: config.tradingHoursStart,
      trading_hours_end: config.tradingHoursEnd,
      cooldown_minutes: config.cooldownMinutes,
      min_signal_strength: config.minSignalStrength,
      kill_switch: killSwitchActive,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleKillSwitch = async () => {
    const newState = !killSwitchActive;
    setKillSwitchActive(newState);
    if (newState) {
      setConfig(prev => ({ ...prev, copyEnabled: false }));
    }

    if (userId) {
      await supabase.from("user_risk_config").upsert({
        user_id: userId,
        kill_switch: newState,
        copy_enabled: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  };

  const updateField = <K extends keyof RiskConfig>(key: K, value: RiskConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleAsset = (asset: string) => {
    setConfig(prev => ({
      ...prev,
      allowedAssets: prev.allowedAssets.includes(asset)
        ? prev.allowedAssets.filter(a => a !== asset)
        : [...prev.allowedAssets, asset],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Kill Switch */}
      <div className={cn(
        "rounded-xl p-4 transition-colors",
        killSwitchActive ? "bg-red-500/10 border border-red-500/20" : "bg-white/[0.02] border border-white/[0.06]"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground/70">{t("strategy.emergencyStop")}</h3>
            <p className="text-[10px] text-foreground/25 mt-0.5">{t("strategy.emergencyStopDesc")}</p>
          </div>
          <button
            onClick={toggleKillSwitch}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-colors",
              killSwitchActive ? "bg-red-500 text-white" : "bg-foreground/5 text-foreground/40 hover:bg-red-500/20 hover:text-red-400"
            )}
          >
            {killSwitchActive ? t("strategy.stopped") : t("strategy.emergencyStop")}
          </button>
        </div>
      </div>

      {/* Copy Trading Toggle + Mode */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground/70">{t("strategy.copyTrading")}</h3>
          <button
            onClick={() => updateField("copyEnabled", !config.copyEnabled)}
            disabled={killSwitchActive}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              config.copyEnabled && !killSwitchActive ? "bg-primary" : "bg-foreground/10"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
              config.copyEnabled && !killSwitchActive ? "translate-x-5" : "translate-x-0.5"
            )} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {EXECUTION_MODES.map(mode => (
            <button
              key={mode.value}
              onClick={() => updateField("executionMode", mode.value as RiskConfig["executionMode"])}
              className={cn(
                "text-left px-3 py-2 rounded-lg transition-colors",
                config.executionMode === mode.value
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]"
              )}
            >
              <p className={cn("text-xs font-semibold", config.executionMode === mode.value ? "text-primary" : "text-foreground/50")}>{t(mode.labelKey)}</p>
              <p className="text-[9px] text-foreground/20 mt-0.5">{t(mode.descKey)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Position Limits */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.positionLimits")}</h3>
        <div className="space-y-3">
          <RangeInput label={t("strategy.maxPositionSize")} value={config.maxPositionSizeUsd} min={100} max={10000} step={100} unit="$" onChange={v => updateField("maxPositionSizeUsd", v)} />
          <RangeInput label={t("strategy.maxConcurrent")} value={config.maxConcurrentPositions} min={1} max={10} step={1} onChange={v => updateField("maxConcurrentPositions", v)} />
          <RangeInput label={t("strategy.maxLeverage")} value={config.maxLeverage} min={1} max={20} step={1} unit="x" onChange={v => updateField("maxLeverage", v)} />
        </div>
      </div>

      {/* Risk Limits */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.riskControl")}</h3>
        <div className="space-y-3">
          <RangeInput label={t("strategy.maxDailyLoss")} value={config.maxDailyLossUsd} min={50} max={5000} step={50} unit="$" onChange={v => updateField("maxDailyLossUsd", v)} />
          <RangeInput label={t("strategy.maxDrawdown")} value={config.maxDrawdownPct} min={5} max={50} step={5} unit="%" onChange={v => updateField("maxDrawdownPct", v)} />
          <RangeInput label={t("strategy.cooldown")} value={config.cooldownMinutes} min={0} max={60} step={1} unit={t("common.minutes")} onChange={v => updateField("cooldownMinutes", v)} />
        </div>
      </div>

      {/* Minimum signal strength */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.minSignalStrength")}</h3>
        <div className="flex gap-2">
          {(["STRONG", "MEDIUM", "WEAK"] as const).map(s => (
            <button
              key={s}
              onClick={() => updateField("minSignalStrength", s)}
              className={cn(
                "flex-1 text-center py-2 rounded-lg text-xs font-bold transition-colors",
                config.minSignalStrength === s
                  ? s === "STRONG" ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : s === "MEDIUM" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                    : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                  : "bg-white/[0.02] text-foreground/30 border border-white/[0.04]"
              )}
            >
              {s === "STRONG" ? t("strategy.strongOnly") : s === "MEDIUM" ? t("strategy.mediumUp") : t("strategy.allSignals")}
            </button>
          ))}
        </div>
      </div>

      {/* Allowed Assets */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-xs font-bold text-foreground/50 mb-3">{t("strategy.allowedAssets")}</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_ASSETS.map(asset => (
            <button
              key={asset}
              onClick={() => toggleAsset(asset)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                config.allowedAssets.includes(asset)
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-white/[0.02] text-foreground/25 border border-white/[0.04]"
              )}
            >
              {asset}
            </button>
          ))}
        </div>
      </div>

      {/* Trading Hours */}
      <div className="rounded-xl bg-white/[0.02] p-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-foreground/50">{t("strategy.tradingHours")}</h3>
          <button
            onClick={() => updateField("tradingHoursEnabled", !config.tradingHoursEnabled)}
            className={cn("w-8 h-4 rounded-full transition-colors relative", config.tradingHoursEnabled ? "bg-primary" : "bg-foreground/10")}
          >
            <div className={cn("w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform", config.tradingHoursEnabled ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
        {config.tradingHoursEnabled && (
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={23} value={config.tradingHoursStart} onChange={e => updateField("tradingHoursStart", Number(e.target.value))} className="w-16 bg-white/[0.04] rounded px-2 py-1 text-xs text-foreground/60 border border-white/[0.06]" />
            <span className="text-xs text-foreground/25">{t("common.to")}</span>
            <input type="number" min={0} max={23} value={config.tradingHoursEnd} onChange={e => updateField("tradingHoursEnd", Number(e.target.value))} className="w-16 bg-white/[0.04] rounded px-2 py-1 text-xs text-foreground/60 border border-white/[0.06]" />
            <span className="text-[10px] text-foreground/20">UTC</span>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={saveConfig}
        disabled={saving || !userId}
        className={cn(
          "w-full py-3 rounded-xl text-sm font-bold transition-colors",
          saved ? "bg-green-500/10 text-green-400" : "bg-primary/10 text-primary hover:bg-primary/20",
          (saving || !userId) && "opacity-50 cursor-not-allowed"
        )}
      >
        {saving ? t("common.saving") : saved ? t("common.saved") : t("strategy.saveSettings")}
      </button>
    </div>
  );
}

function RangeInput({ label, value, min, max, step, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-foreground/40">{label}</span>
        <span className="text-xs font-bold text-foreground/60">{unit === "$" ? `$${value.toLocaleString()}` : `${value}${unit || ""}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none bg-foreground/10 accent-primary"
      />
    </div>
  );
}
