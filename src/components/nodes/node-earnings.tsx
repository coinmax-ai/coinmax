import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Coins, Users, ChevronRight } from "lucide-react";
import { useMaPrice } from "@/hooks/use-ma-price";
import type { NodeRewardsSummary } from "@shared/types";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

interface NodeEarningsProps {
  rewards: NodeRewardsSummary;
}

export function NodeEarnings({ rewards }: NodeEarningsProps) {
  const { t } = useTranslation();
  const { formatCompactMA } = useMaPrice();
  const [, navigate] = useLocation();
  const fixedYield = Number(rewards.fixedYield || 0);
  const poolDividend = Number(rewards.poolDividend || 0);
  const teamCommission = Number(rewards.teamCommission || 0);
  const total = Number(rewards.totalEarnings || 0);

  return (
    <Card className="border-border bg-card glow-green-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold">{t("profile.nodeEarnings")}</h4>
          <span className="text-lg font-bold text-neon-value">{formatCompactMA(total)}</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" />
              {t("profile.fixedYield")}
            </div>
            <span className="font-medium">{formatCompactMA(fixedYield)}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Coins className="h-3 w-3 text-blue-400" />
              {t("profile.poolDividend")}
            </div>
            <span className="font-medium">{formatCompactMA(poolDividend)}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3 w-3 text-purple-400" />
              {t("profile.teamCommission")}
            </div>
            <span className="font-medium">{formatCompactMA(teamCommission)}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-1 text-xs text-muted-foreground"
          onClick={() => navigate("/profile/nodes/earnings")}
          data-testid="button-view-earnings-detail"
        >
          {t("profile.viewEarningsDetail")} <ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
