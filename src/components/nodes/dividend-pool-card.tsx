import { Card, CardContent } from "@/components/ui/card";
import { Coins } from "lucide-react";
import { useMaPrice } from "@/hooks/use-ma-price";
import type { NodePoolInfo } from "@shared/types";
import { useTranslation } from "react-i18next";

interface DividendPoolCardProps {
  pool: NodePoolInfo;
}

export function DividendPoolCard({ pool }: DividendPoolCardProps) {
  const { t } = useTranslation();
  const { formatCompactMA } = useMaPrice();
  const balance = Number(pool.balance || 0);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <Coins className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-bold">{t("profile.dividendPool")}</div>
              <div className="text-[11px] text-muted-foreground">{t("profile.poolDividendDesc")}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">{t("profile.poolBalance")}</span>
          <span className="text-sm font-bold text-neon-value">{formatCompactMA(balance)}</span>
        </div>
        {pool.updatedAt && (
          <div className="text-[11px] text-muted-foreground text-right">
            {new Date(pool.updatedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
