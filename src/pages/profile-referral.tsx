import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { shortenAddress, formatCompact } from "@/lib/constants";
import { useMaPrice } from "@/hooks/use-ma-price";
import { ArrowLeft, Link2, Copy, Users, UserPlus, ArrowDownToLine, WalletCards, Layers, TrendingUp, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getProfile, getReferralTree, getCommissionRecords } from "@/lib/api";
import type { Profile, CommissionSummary } from "@shared/types";
import { useTranslation } from "react-i18next";

interface ReferralData {
  referrals: Array<{
    id: string;
    walletAddress: string;
    rank: string;
    nodeType: string;
    totalDeposited: string;
    level: number;
    subReferrals: Array<{
      id: string;
      walletAddress: string;
      rank: string;
      nodeType: string;
      totalDeposited: string;
      level: number;
    }>;
  }>;
  teamSize: number;
  directCount: number;
}

export default function ProfileReferralPage() {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const { toast } = useToast();
  const { formatCompactMA, usdcToMA } = useMaPrice();
  const [, navigate] = useLocation();
  const walletAddr = account?.address || "";
  const isConnected = !!walletAddr;

  // Breadcrumb navigation for drilling into sub-trees
  const [addrStack, setAddrStack] = useState<Array<{ addr: string; label: string }>>([]);
  const viewingAddr = addrStack.length > 0 ? addrStack[addrStack.length - 1].addr : walletAddr;
  const isViewingSelf = viewingAddr === walletAddr;

  const drillInto = useCallback((addr: string, label: string) => {
    setAddrStack((prev) => [...prev, { addr, label }]);
  }, []);

  const goBack = useCallback(() => {
    setAddrStack((prev) => prev.slice(0, -1));
  }, []);

  const goToRoot = useCallback(() => {
    setAddrStack([]);
  }, []);

  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile", walletAddr],
    queryFn: () => getProfile(walletAddr),
    enabled: isConnected,
  });

  const { data: teamData, isLoading } = useQuery<ReferralData>({
    queryKey: ["referrals", viewingAddr],
    queryFn: () => getReferralTree(viewingAddr),
    enabled: isConnected,
  });

  const { data: commission, isLoading: commissionLoading } = useQuery<CommissionSummary>({
    queryKey: ["commission", walletAddr],
    queryFn: () => getCommissionRecords(walletAddr),
    enabled: isConnected,
  });

  const totalCommission = Number(commission?.totalCommission || 0);
  const directTotal = Number(commission?.directReferralTotal || 0);
  const diffTotal = Number(commission?.differentialTotal || 0);

  const refCode = profile?.refCode;
  const referralLink = refCode ? `${window.location.origin}?ref=${refCode}` : "--";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("common.copied"), description: t("common.copiedDesc") });
  };

  const totalTeamDeposits = teamData?.referrals.reduce((sum, ref) => {
    const direct = Number(ref.totalDeposited || 0);
    const sub = ref.subReferrals?.reduce((s, r) => s + Number(r.totalDeposited || 0), 0) || 0;
    return sum + direct + sub;
  }, 0) || 0;

  return (
    <div className="space-y-4 pb-24" data-testid="page-profile-referral">
      <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button size="icon" variant="ghost" onClick={() => navigate("/profile")} data-testid="button-back-profile">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">{t("profile.referralTeam")}</h1>
        </div>

        {!isConnected ? (
          <Card className="border-border bg-card/50 border-dashed">
            <CardContent className="p-4 text-center">
              <WalletCards className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewReferral")}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card/50">
            <CardContent className="p-4 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{t("profile.referralLink")}</span>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(referralLink)}
                    data-testid="button-copy-referral"
                  >
                    <Link2 className="mr-1 h-3 w-3" /> {t("common.copyLink")}
                  </Button>
                </div>
                <div className="text-xs font-mono text-muted-foreground truncate" data-testid="text-referral-link">{referralLink}</div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{t("profile.referralCode")}</span>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(refCode || "")}
                    data-testid="button-copy-code"
                  >
                    <Copy className="mr-1 h-3 w-3" /> {t("common.copy")}
                  </Button>
                </div>
                <div className="text-xs font-mono text-muted-foreground" data-testid="text-ref-code">
                  {refCode || "--"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
        <h3 className="text-sm font-bold mb-3">{t("profile.teamPerformance")}</h3>
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="p-3 text-center">
              <Users className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-neon-value" data-testid="text-team-size">{isConnected ? (teamData?.teamSize || 0) : "--"}</div>
              <div className="text-[12px] text-muted-foreground">{t("profile.teamSize")}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-3 text-center">
              <UserPlus className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-neon-value" data-testid="text-direct-count">{isConnected ? (teamData?.directCount || 0) : "--"}</div>
              <div className="text-[12px] text-muted-foreground">{t("profile.direct")}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-3 text-center">
              <ArrowDownToLine className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-neon-value" data-testid="text-team-deposits">{isConnected ? formatCompact(totalTeamDeposits) : "--"}</div>
              <div className="text-[12px] text-muted-foreground">{t("profile.deposits")}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.2s both" }}>
        <h3 className="text-sm font-bold mb-3">{t("profile.referralTree")}</h3>

        {/* Breadcrumb navigation */}
        {!isViewingSelf && (
          <div className="flex items-center gap-1 mb-3 flex-wrap text-[12px]">
            <button
              className="text-primary hover:underline font-medium"
              onClick={goToRoot}
            >
              {t("profile.myTeam")}
            </button>
            {addrStack.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                {idx < addrStack.length - 1 ? (
                  <button
                    className="text-primary hover:underline font-medium"
                    onClick={() => setAddrStack((prev) => prev.slice(0, idx + 1))}
                  >
                    {item.label}
                  </button>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {!isConnected ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewTeam")}</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : !teamData?.referrals.length ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground" data-testid="text-no-referrals">
                {t("profile.noTeamMembers")}
              </p>
              {!isViewingSelf && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={goBack}>
                  <ArrowLeft className="mr-1 h-3 w-3" /> {t("profile.goBack")}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-0" data-testid="referral-tree">
            {teamData.referrals.map((ref) => (
              <div key={ref.id} className="mb-3">
                <button
                  className="w-full flex items-center gap-2 p-2 rounded-md bg-card border border-border hover-elevate text-left"
                  onClick={() => drillInto(ref.walletAddress, shortenAddress(ref.walletAddress))}
                >
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono truncate" data-testid={`text-ref-wallet-${ref.id}`}>
                      {shortenAddress(ref.walletAddress)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[11px] no-default-hover-elevate no-default-active-elevate shrink-0">
                    {ref.rank}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px] no-default-hover-elevate no-default-active-elevate shrink-0">
                    {ref.nodeType}
                  </Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
                {ref.subReferrals && ref.subReferrals.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-3">
                    {ref.subReferrals.map((sub) => (
                      <button
                        key={sub.id}
                        className="w-full flex items-center gap-2 p-2 rounded-md bg-card/50 border border-border/50 hover-elevate text-left"
                        onClick={() => drillInto(sub.walletAddress, shortenAddress(sub.walletAddress))}
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-mono truncate" data-testid={`text-subref-wallet-${sub.id}`}>
                            {shortenAddress(sub.walletAddress)}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] no-default-hover-elevate no-default-active-elevate shrink-0">
                          {sub.rank}
                        </Badge>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4" style={{ animation: "fadeSlideIn 0.5s ease-out 0.25s both" }}>
        <h3 className="text-sm font-bold mb-3">{t("profile.brokerEarnings")}</h3>
        {!isConnected ? (
          <Card className="border-border bg-card">
            <CardContent className="p-6 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t("profile.connectToViewCommission")}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Card className="border-border bg-card">
                <CardContent className="p-3 text-center">
                  <UserPlus className="h-4 w-4 text-primary mx-auto mb-1" />
                  {commissionLoading ? (
                    <Skeleton className="h-5 w-16 mx-auto" />
                  ) : (
                    <div className="text-sm font-bold text-neon-value" data-testid="text-direct-total">
                      {formatCompactMA(directTotal)}
                    </div>
                  )}
                  <div className="text-[12px] text-muted-foreground">{t("profile.directReferralBonus")}</div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-3 text-center">
                  <Layers className="h-4 w-4 text-primary mx-auto mb-1" />
                  {commissionLoading ? (
                    <Skeleton className="h-5 w-16 mx-auto" />
                  ) : (
                    <div className="text-sm font-bold text-neon-value" data-testid="text-diff-total">
                      {formatCompactMA(diffTotal)}
                    </div>
                  )}
                  <div className="text-[12px] text-muted-foreground">{t("profile.differentialCommission")}</div>
                </CardContent>
              </Card>
            </div>

            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{t("profile.commissionRecords")}</h4>
            {commissionLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : !commission?.records.length ? (
              <Card className="border-border bg-card">
                <CardContent className="p-6 text-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground" data-testid="text-no-commission">
                    {t("profile.noCommissionRecords")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2" data-testid="commission-list">
                {commission.records.map((record) => {
                  const isDirectRef = record.details?.type === "direct_referral";
                  const amount = Number(record.amount || 0);
                  const depth = record.details?.depth || 0;
                  const rate = record.details?.rate;
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
                              isDirectRef ? "bg-primary/15" : "bg-amber-500/15"
                            }`}>
                              {isDirectRef ? (
                                <UserPlus className="h-4 w-4 text-primary" />
                              ) : (
                                <Layers className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] no-default-hover-elevate no-default-active-elevate shrink-0"
                                >
                                  {isDirectRef ? t("profile.directRef") : t("profile.differential")}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  L{depth}
                                </span>
                                {rate !== undefined && !isDirectRef && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {(rate * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {t("profile.from")}: {record.sourceWallet ? shortenAddress(record.sourceWallet) : "--"}
                                {record.sourceRank && (
                                  <span className="ml-1 text-[10px]">({record.sourceRank})</span>
                                )}
                              </div>
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
          </>
        )}
      </div>
    </div>
  );
}
