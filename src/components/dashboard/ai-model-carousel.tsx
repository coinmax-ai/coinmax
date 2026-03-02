import { useRef, useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Sparkles, Brain, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { formatUSD } from "@/lib/constants";
import { useTranslation } from "react-i18next";

interface ForecastItem {
  model: string;
  direction: string;
  confidence: number;
  currentPrice: number;
  targetPrice: number;
  reasoning: string;
}

interface AiModelCarouselProps {
  forecasts: ForecastItem[] | undefined;
  isLoading: boolean;
  activeModel: string | null;
  onSelectModel: (model: string) => void;
}

const MODEL_META: Record<string, { color: string; accent: string; icon: string; gradient: string }> = {
  "GPT-4o":     { color: "rgba(16,163,127,0.08)",  accent: "#10a37f", icon: "G",  gradient: "from-emerald-500/20 to-emerald-900/5" },
  "Claude":     { color: "rgba(204,132,63,0.08)",   accent: "#cc843f", icon: "C",  gradient: "from-amber-500/20 to-amber-900/5" },
  "Gemini":     { color: "rgba(66,133,244,0.08)",   accent: "#4285f4", icon: "Ge", gradient: "from-blue-500/20 to-blue-900/5" },
  "DeepSeek":   { color: "rgba(99,102,241,0.08)",   accent: "#6366f1", icon: "D",  gradient: "from-indigo-500/20 to-indigo-900/5" },
  "Grok":       { color: "rgba(239,68,68,0.08)",    accent: "#ef4444", icon: "Gr", gradient: "from-red-500/20 to-red-900/5" },
  "Llama 3.1":  { color: "rgba(0,136,255,0.08)",    accent: "#0088ff", icon: "L",  gradient: "from-sky-500/20 to-sky-900/5" },
  "Llama 3.3":  { color: "rgba(0,160,255,0.08)",    accent: "#00a0ff", icon: "L",  gradient: "from-sky-500/20 to-sky-900/5" },
  "Llama 8B":   { color: "rgba(0,136,255,0.08)",    accent: "#0078dd", icon: "L",  gradient: "from-sky-500/20 to-sky-900/5" },
  "Mistral":    { color: "rgba(255,116,0,0.08)",    accent: "#ff7400", icon: "M",  gradient: "from-orange-500/20 to-orange-900/5" },
  "Gemma":      { color: "rgba(66,133,244,0.08)",   accent: "#4285f4", icon: "Gm", gradient: "from-blue-500/20 to-blue-900/5" },
  "Qwen":       { color: "rgba(115,75,209,0.08)",   accent: "#734bd1", icon: "Q",  gradient: "from-violet-500/20 to-violet-900/5" },
};

function getModelMeta(model: string) {
  return MODEL_META[model] || { color: "rgba(100,100,100,0.08)", accent: "#888", icon: model[0], gradient: "from-gray-500/20 to-gray-900/5" };
}

function ConfidenceRing({ value, accent, size = 40 }: { value: number; accent: string; size?: number }) {
  const [animValue, setAnimValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimValue(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const r = size * 0.38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (animValue / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${accent}60)` }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold"
        style={{ color: accent, fontSize: size * 0.25 }}
      >
        {value}
      </span>
    </div>
  );
}

function ModelCard({
  forecast,
  meta,
  isActive,
  isBest,
  isExpanded,
  onSelect,
  onToggleExpand,
  index,
}: {
  forecast: ForecastItem;
  meta: ReturnType<typeof getModelMeta>;
  isActive: boolean;
  isBest: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  index: number;
}) {
  const { t } = useTranslation();
  const isBullish = forecast.direction === "BULLISH";
  const isBearish = forecast.direction === "BEARISH";
  const priceDiff = forecast.currentPrice ? ((forecast.targetPrice - forecast.currentPrice) / forecast.currentPrice * 100) : 0;

  return (
    <div
      className={`glass-card group relative overflow-hidden rounded-2xl transition-all duration-500 ${
        isActive
          ? "scale-[1.01]"
          : "hover:scale-[1.005]"
      }`}
      style={{
        animation: `fadeSlideIn 0.5s ease-out ${index * 80}ms both`,
        ...(isActive ? {
          boxShadow: `0 0 20px ${meta.accent}20, 0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
        } : {}),
      }}
    >
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 20% 0%, ${meta.accent}15 0%, transparent 70%)`,
        }}
      />

      <div className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{
          border: isActive ? `1px solid ${meta.accent}40` : '1px solid rgba(255,255,255,0.06)',
        }}
      />

      <button
        className="relative w-full text-left p-3.5"
        onClick={onSelect}
      >
        <div className="flex items-center gap-3">
          <div
            className="relative h-9 w-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 overflow-hidden"
            style={{
              backgroundColor: `${meta.accent}20`,
              color: meta.accent,
              boxShadow: `0 0 12px ${meta.accent}15`,
            }}
          >
            {meta.icon}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: `linear-gradient(135deg, ${meta.accent}30 0%, transparent 60%)`,
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-foreground/90 truncate">{forecast.model}</span>
              {isBest && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[8px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  <Zap className="h-1.5 w-1.5" />
                  TOP
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isBullish ? (
                <TrendingUp className="h-3 w-3 text-[#00e7a0]" />
              ) : isBearish ? (
                <TrendingDown className="h-3 w-3 text-[#ff4976]" />
              ) : (
                <Minus className="h-3 w-3 text-yellow-400" />
              )}
              <span className={`text-[11px] font-bold ${isBullish ? "text-[#00e7a0]" : isBearish ? "text-[#ff4976]" : "text-yellow-400"}`}>
                {forecast.direction}
              </span>
              <span className={`text-[11px] font-mono font-bold ${priceDiff >= 0 ? "text-[#00e7a0]" : "text-[#ff4976]"}`}>
                {priceDiff >= 0 ? "+" : ""}{priceDiff.toFixed(2)}%
              </span>
            </div>
          </div>

          <ConfidenceRing value={forecast.confidence} accent={meta.accent} size={42} />
        </div>

        <div className="flex items-center justify-between mt-2.5 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="text-[10px] text-muted-foreground">{t("dashboard.target")}</span>
          <span className="text-[13px] font-mono font-bold text-foreground/85">
            {formatUSD(forecast.targetPrice)}
          </span>
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-400 ease-out ${isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-3.5 pb-3.5 pt-0">
          <div className="glass-inner rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground/90 leading-relaxed max-h-24 overflow-y-auto scrollbar-hide">
              <Sparkles className="inline h-2.5 w-2.5 mr-1 text-amber-400/80" />
              {forecast.reasoning}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        className="w-full flex items-center justify-center py-1.5 text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
        style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}
      >
        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${meta.accent}, transparent)`,
            boxShadow: `0 0 12px ${meta.accent}50`,
          }}
        />
      )}
    </div>
  );
}

export function AiModelCarousel({ forecasts, isLoading, activeModel, onSelectModel }: AiModelCarouselProps) {
  const { t } = useTranslation();
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const toggleExpand = useCallback((model: string) => {
    setExpandedModel(prev => prev === model ? null : model);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-[100px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!forecasts || forecasts.length === 0) return null;

  const bullCount = forecasts.filter(f => f.direction === "BULLISH").length;
  const bearCount = forecasts.filter(f => f.direction === "BEARISH").length;
  const consensus = bullCount > bearCount ? "BULLISH" : bearCount > bullCount ? "BEARISH" : "MIXED";
  const consensusColor = consensus === "BULLISH" ? "#00e7a0" : consensus === "BEARISH" ? "#ff4976" : "#facc15";

  const visibleForecasts = showAll ? forecasts : forecasts.slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="glass-card rounded-2xl p-3.5 overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: `radial-gradient(ellipse 100% 80% at 50% 0%, ${consensusColor}10 0%, transparent 60%)`,
          }}
        />
        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }} />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Brain className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <span className="text-[13px] font-bold text-foreground/90 tracking-wide">AI Analysis</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{forecasts.length} models</span>
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-bold border-0 px-2 py-0.5"
            style={{
              backgroundColor: `${consensusColor}12`,
              color: consensusColor,
              boxShadow: `0 0 12px ${consensusColor}10`,
            }}
          >
            {consensus === "BULLISH" ? <TrendingUp className="h-3 w-3 mr-1" /> : consensus === "BEARISH" ? <TrendingDown className="h-3 w-3 mr-1" /> : <Minus className="h-3 w-3 mr-1" />}
            {consensus} {bullCount}/{forecasts.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {visibleForecasts.map((f, idx) => {
          const meta = getModelMeta(f.model);
          return (
            <ModelCard
              key={f.model}
              forecast={f}
              meta={meta}
              isActive={activeModel === f.model}
              isBest={idx === 0}
              isExpanded={expandedModel === f.model}
              onSelect={() => onSelectModel(f.model)}
              onToggleExpand={() => toggleExpand(f.model)}
              index={idx}
            />
          );
        })}
      </div>

      {forecasts.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="glass-card w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground/80 transition-all duration-300 relative overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show {forecasts.length - 3} More Models
            </>
          )}
        </button>
      )}
    </div>
  );
}
