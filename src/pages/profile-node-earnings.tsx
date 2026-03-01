import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "thirdweb/react";
import { useMaPrice } from "@/hooks/use-ma-price";
import { ArrowLeft, TrendingUp, Coins, WalletCards } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getNodeEarningsRecords, getNodeOverview } from "@/lib/api";
import type { NodeOverview, NodeEarningsRecord } from "@shared/types";
import { useTranslation } from "react-i18next";

export default function ProfileNodeEarningsPage() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const { formatCompactMA, usdcToMA } = useMaPrice();
  const [, navigate] = useLocation();
  const walletAddr = account?.address || "";
  const isConnected = !!walletAddr;

  const { data: overview } = useQuery<NodeOverview>({
    queryKey: ["node-overview", walletAddr],
    queryFn: () => getNodeOverview(walletAddr),
    enabled: isConnected,
  });

  const { data: records, isLoading } = useQuery<NodeEarningsRecord[]>({
    queryKey: ["node-earnings-records", walletAddr],
    queryFn: () => getNodeEarningsRecords(walletAddr),
    enabled: isConnected,
  });

  const fixedYield = Number(overview?.rewards?.fixedYield || 0);
  const poolDividend = Number(overview?.rewards?.poolDividend || 0);
  const total = Number(overview?.rewards?.totalEarnings || 0);

  return (
    <div className="space-y-4 pb-24" data-testid="page-node-earnings">
      <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button size="icon" variant="ghost" onClick={() => navigate("/profile/nodes")} data-testid="button-back-nodes">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">{t("profile.nodeEarningsDetail")}</h1>
        </div>

        {!isConnected ? (
          <Card className="border-border bg-card/50 border-dashed">
            <CardContent className="p-4 text-center">
              <WalletCards className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewNodes")}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border bg-card/50 glow-green-sm mb-3">
              <CardContent className="p-4">
                <div className="text-[12px] text-muted-foreground mb-1">{t("profile.totalEarnings")}</div>
                <div className="text-2xl font-bold text-neon-value" data-testid="text-node-total-earnings">
                  {formatCompactMA(total)}
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-border bg-card/50">
                <CardContent className="p-3 text-center">
                  <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
                  <div className="text-sm font-bold text-neon-value" data-testid="text-fixed-yield">
                    {formatCompactMA(fixedYield)}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{t("profile.fixedYield")}</div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card/50">
                <CardContent className="p-3 text-center">
                  <Coins className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                  <div className="text-sm font-bold text-neon-value" data-testid="text-pool-dividend">
                    {formatCompactMA(poolDividend)}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{t("profile.poolDividend")}</div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
        <h3 className="text-sm font-bold mb-3">{t("profile.earningsRecords")}</h3>
        {!isConnected ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewNodes")}</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : !records?.length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground" data-testid="text-no-earnings">
                {t("profile.noEarningsRecords")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="node-earnings-list">
            {records.map((record) => {
              const isFixed = record.rewardType === "FIXED_YIELD";
              const amount = Number(record.amount || 0);
              const nodeType = record.details?.node_type || record.details?.nodeType || "--";
              const createdAt = record.createdAt
                ? new Date(record.createdAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })
                : "--";

              return (
                <Card key={record.id} className="border-border bg-card">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                          isFixed ? "bg-primary/15" : "bg-blue-500/15"
                        }`}>
                          {isFixed ? (
                            <TrendingUp className="h-4 w-4 text-primary" />
                          ) : (
                            <Coins className="h-4 w-4 text-blue-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] no-default-hover-elevate no-default-active-elevate shrink-0"
                            >
                              {isFixed ? t("profile.fixedYield") : t("profile.poolDividend")}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] no-default-hover-elevate no-default-active-elevate shrink-0"
                            >
                              {nodeType}
                            </Badge>
                          </div>
                          {!isFixed && record.details?.earnings_capacity !== undefined && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {t("profile.earningsCapacity")}: {((record.details.earnings_capacity || 0) * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-neon-value">
                          +{usdcToMA(amount).toFixed(2)} MA
                        </div>
                        <div className="text-[10px] text-muted-foreground">{createdAt}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
