import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "thirdweb/react";
import { useMaPrice } from "@/hooks/use-ma-price";
import { ArrowLeft, Server, WalletCards } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getNodeOverview } from "@/lib/api";
import type { NodeOverview } from "@shared/types";
import { NodePurchaseSection } from "@/components/nodes/node-purchase-section";
import { NodeList } from "@/components/nodes/node-list";
import { NodeEarnings } from "@/components/nodes/node-earnings";
import { DividendPoolCard } from "@/components/nodes/dividend-pool-card";
import { useTranslation } from "react-i18next";

export default function ProfileNodesPage() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const { formatCompactMA } = useMaPrice();
  const [, navigate] = useLocation();
  const walletAddr = account?.address || "";
  const isConnected = !!walletAddr;

  const { data: overview, isLoading } = useQuery<NodeOverview>({
    queryKey: ["node-overview", walletAddr],
    queryFn: () => getNodeOverview(walletAddr),
    enabled: isConnected,
  });

  const nodes = overview?.nodes ?? [];
  const activeCount = nodes.filter((n) => n.status === "ACTIVE" || n.status === "PENDING_MILESTONES").length;
  const totalEarnings = Number(overview?.rewards?.totalEarnings || 0);
  const poolBalance = Number(overview?.pool?.balance || 0);

  return (
    <div className="space-y-4 pb-24" data-testid="page-profile-nodes">
      <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button size="icon" variant="ghost" onClick={() => navigate("/profile")} data-testid="button-back-profile">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">{t("profile.nodesTitle")}</h1>
        </div>
        {isConnected && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border bg-card/50">
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">{t("profile.activeNodes")}</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-8" />
                ) : (
                  <div className="text-sm font-bold text-neon-value">{activeCount}</div>
                )}
              </CardContent>
            </Card>
            <Card className="border-border bg-card/50">
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">{t("profile.totalEarnings")}</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <div className="text-sm font-bold text-neon-value">{formatCompactMA(totalEarnings)}</div>
                )}
              </CardContent>
            </Card>
            <Card className="border-border bg-card/50">
              <CardContent className="p-3">
                <div className="text-[11px] text-muted-foreground mb-0.5">{t("profile.poolBalance")}</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <div className="text-sm font-bold text-neon-value">{formatCompactMA(poolBalance)}</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {!isConnected ? (
        <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
          <Card className="border-border bg-card border-dashed">
            <CardContent className="p-6 text-center">
              <WalletCards className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewNodes")}</p>
            </CardContent>
          </Card>
        </div>
      ) : isLoading ? (
        <div className="px-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          {/* Purchase Section */}
          <div className="px-4" style={{ animation: "fadeSlideIn 0.4s ease-out 0.1s both" }}>
            <h3 className="text-sm font-bold mb-2">{t("profile.viewPlans")}</h3>
            <NodePurchaseSection walletAddr={walletAddr} />
          </div>

          {/* My Nodes */}
          <div className="px-4" style={{ animation: "fadeSlideIn 0.4s ease-out 0.15s both" }}>
            <h3 className="text-sm font-bold mb-2">
              {t("profile.totalNodes")}: {nodes.length}
            </h3>
            <NodeList nodes={nodes} />
          </div>

          {/* Earnings Breakdown */}
          {overview?.rewards && (
            <div className="px-4" style={{ animation: "fadeSlideIn 0.4s ease-out 0.2s both" }}>
              <NodeEarnings rewards={overview.rewards} />
            </div>
          )}

          {/* Dividend Pool */}
          {overview?.pool && (
            <div className="px-4" style={{ animation: "fadeSlideIn 0.4s ease-out 0.25s both" }}>
              <DividendPoolCard pool={overview.pool} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
