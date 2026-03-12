import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BET_DEFAULTS } from "@/lib/data";

const DURATIONS = ["1min", "3min", "5min", "15min"];

interface BetControlsProps {
  amount: number;
  onAmountChange: (amount: number) => void;
  duration: string;
  onDurationChange: (duration: string) => void;
  onBet: (direction: "up" | "down") => void;
  isPending?: boolean;
}

export function BetControls({ amount, onAmountChange, duration, onDurationChange, onBet, isPending }: BetControlsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeDir, setActiveDir] = useState<"up" | "down" | null>(null);

  const durationIndex = DURATIONS.indexOf(duration);

  function cycleDuration(dir: number) {
    const next = (durationIndex + dir + DURATIONS.length) % DURATIONS.length;
    onDurationChange(DURATIONS[next]);
  }

  function handleBet(direction: "up" | "down") {
    toast({ title: t("common.comingSoon") });
    return;
  }

  const ctrl3d = {
    border: "1px solid rgba(255,255,255,0.2)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px rgba(0,0,0,0.15)",
    borderRadius: "8px",
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md px-4 py-3">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="flex items-center justify-center h-9 w-9 rounded-lg text-foreground/80 active:translate-y-[1px] transition-all"
              style={ctrl3d}
              onClick={() => onAmountChange(Math.max(BET_DEFAULTS.minAmount, amount - BET_DEFAULTS.step))}
              data-testid="button-decrease-bet"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex items-baseline gap-1 min-w-[50px] justify-center">
              <span className="text-lg font-bold font-mono" data-testid="text-bet-amount">${amount}</span>
              <span className="text-[11px] text-muted-foreground">{t("trade.stake")}</span>
            </div>
            <button
              className="flex items-center justify-center h-9 w-9 rounded-lg text-foreground/80 active:translate-y-[1px] transition-all"
              style={ctrl3d}
              onClick={() => onAmountChange(amount + BET_DEFAULTS.step)}
              data-testid="button-increase-bet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="flex items-center justify-center h-9 w-9 rounded-lg text-foreground/80 active:translate-y-[1px] transition-all"
              style={ctrl3d}
              onClick={() => cycleDuration(-1)}
              data-testid="button-duration-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center min-w-[42px]">
              <span className="text-lg font-bold font-mono" data-testid="text-duration">{duration}</span>
              <div className="text-[11px] text-muted-foreground">{t("trade.duration")}</div>
            </div>
            <button
              className="flex items-center justify-center h-9 w-9 rounded-lg text-foreground/80 active:translate-y-[1px] transition-all"
              style={ctrl3d}
              onClick={() => cycleDuration(1)}
              data-testid="button-duration-next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mb-2">
          <Button
            onClick={() => handleBet("down")}
            disabled={isPending}
            className="flex-1 relative overflow-visible bg-red-500 text-white border-red-600"
            style={{ boxShadow: "0 0 12px rgba(239,68,68,0.3)" }}
            data-testid="button-bear"
          >
            {t("trade.bear")} {BET_DEFAULTS.payoutPercent}%
            {activeDir === "down" && <span className="absolute inset-0 rounded-md animate-ping bg-red-400/20" />}
          </Button>
          <Button
            onClick={() => handleBet("up")}
            disabled={isPending}
            className="flex-1 relative overflow-visible bg-emerald-500 text-white border-emerald-600"
            style={{ boxShadow: "0 0 12px rgba(16,185,129,0.3)" }}
            data-testid="button-bull"
          >
            {t("trade.bull")} {BET_DEFAULTS.payoutPercent}%
            {activeDir === "up" && <span className="absolute inset-0 rounded-md animate-ping bg-primary/20" />}
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full text-primary border-primary/30"
          data-testid="button-ai-smarty"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {t("trade.aiSmarty")}
        </Button>
      </div>
    </div>
  );
}
