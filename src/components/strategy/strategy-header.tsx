import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, BarChart3, Target } from "lucide-react";
import { getStrategyOverview } from "@/lib/api";
import { useTranslation } from "react-i18next";

interface StrategyOverviewData {
  totalAum: string;
  avgWinRate: string;
  avgReturn: string;
}

function useFloatingValue(min: number, max: number, intervalMs = 2000) {
  const [value, setValue] = useState(() => min + Math.random() * (max - min));
  const ref = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const tick = () => {
      setValue(min + Math.random() * (max - min));
      ref.current = setTimeout(tick, intervalMs + Math.random() * intervalMs * 0.5);
    };
    ref.current = setTimeout(tick, intervalMs);
    return () => clearTimeout(ref.current);
  }, [min, max, intervalMs]);
  return value;
}

export function StrategyHeader() {
  const { t } = useTranslation();
  const { data: overview, isLoading } = useQuery<StrategyOverviewData>({
    queryKey: ["strategy-overview"],
    queryFn: getStrategyOverview,
  });

  const floatingWinRate = useFloatingValue(80, 85, 3000);
  const floatingMonthlyReturn = useFloatingValue(18, 28, 4000);

  if (isLoading || !overview) {
    return (
      <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
        <Skeleton className="h-6 w-40 mb-3" />
        <Skeleton className="h-24 w-full mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
      <h2 className="text-lg font-bold mb-3" data-testid="text-strategy-title">{t("strategy.aiStrategies")}</h2>
      <Card className="border-border bg-card/50 glow-green-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[12px] text-muted-foreground mb-1">{t("strategy.totalAum")}</div>
              <div className="text-2xl font-bold" data-testid="text-total-aum">{overview.totalAum}</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Card className="border-border bg-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Target className="h-3 w-3" /> {t("strategy.avgWinRate")}
            </div>
            <div className="text-xl font-bold text-neon-value" data-testid="text-win-rate">{floatingWinRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <BarChart3 className="h-3 w-3" /> {t("strategy.avgMonthlyReturn")}
            </div>
            <div className="text-xl font-bold text-neon-value" data-testid="text-avg-return">{floatingMonthlyReturn.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
