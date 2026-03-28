import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAccount } from "thirdweb/react";
import { formatCompact } from "@/lib/constants";
import { ArrowLeft, Calendar, WalletCards, ExternalLink, Link } from "lucide-react";
import { shortenAddress } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getTransactions } from "@/lib/api";
import type { Transaction } from "@shared/types";
import { useTranslation } from "react-i18next";

const TX_TYPE_COLORS: Record<string, string> = {
  DEPOSIT: "bg-primary/15 text-primary",
  WITHDRAW: "bg-red-500/15 text-red-400",
  YIELD: "bg-blue-500/15 text-blue-400",
  VIP_PURCHASE: "bg-purple-500/15 text-purple-400",
  NODE_PURCHASE: "bg-amber-500/15 text-amber-400",
};

export default function ProfileTransactionsPage() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const [, navigate] = useLocation();
  const walletAddr = account?.address || "";
  const isConnected = !!walletAddr;

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["transactions", walletAddr],
    queryFn: () => getTransactions(walletAddr),
    enabled: isConnected,
  });

  return (
    <div className="space-y-4 pb-24 lg:pb-8 lg:pt-4" data-testid="page-profile-transactions">
      <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl lg:rounded-none lg:bg-transparent lg:p-0 lg:pt-2 lg:px-6" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Button size="icon" variant="ghost" onClick={() => navigate("/profile")} data-testid="button-back-profile" className="lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">{t("profile.transactionHistory")}</h1>
        </div>
      </div>

      <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
        {!isConnected ? (
          <Card className="border-border bg-card border-dashed">
            <CardContent className="p-6 text-center">
              <WalletCards className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground" data-testid="text-connect-prompt">{t("profile.connectToViewTransactions")}</p>
            </CardContent>
          </Card>
        ) : txLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground" data-testid="text-no-transactions">{t("profile.noTransactions")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const explorerUrl = tx.txHash
                ? `https://bscscan.com/tx/${tx.txHash}`
                : null;
              return (
                <Card key={tx.id} className="border-border bg-card" data-testid={`transaction-card-${tx.id}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <Badge
                          className={`text-[11px] shrink-0 no-default-hover-elevate no-default-active-elevate ${TX_TYPE_COLORS[tx.type] || "bg-muted text-muted-foreground"}`}
                          data-testid={`badge-tx-type-${tx.id}`}
                        >
                          {tx.type}
                        </Badge>
                        <div className="text-xs font-bold text-neon-value" data-testid={`text-tx-amount-${tx.id}`}>
                          {formatCompact(Number(tx.amount))} {tx.token}
                        </div>
                        <Badge
                          className={`text-[11px] shrink-0 no-default-hover-elevate no-default-active-elevate ${
                            tx.status === "CONFIRMED"
                              ? "bg-primary/15 text-primary"
                              : "bg-yellow-500/15 text-yellow-400"
                          }`}
                        >
                          {tx.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-[12px] text-muted-foreground shrink-0">
                        <Calendar className="h-3 w-3" />
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "--"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px] border-yellow-500/30 text-yellow-400 no-default-hover-elevate no-default-active-elevate">
                          <Link className="h-2.5 w-2.5 mr-0.5" />BSC
                        </Badge>
                        {tx.txHash ? (
                          <a
                            href={explorerUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] font-mono text-primary/80 hover:text-primary flex items-center gap-1"
                          >
                            {shortenAddress(tx.txHash)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">{t("profile.offChain")}</span>
                        )}
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
