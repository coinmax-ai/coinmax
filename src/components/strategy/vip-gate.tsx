/**
 * VIP Gate — Checks VIP status before allowing access to copy trading features
 *
 * Flow:
 *   1. Check profiles.is_vip + vip_expires_at
 *   2. If VIP active → show children (ApiKeyBind, etc.)
 *   3. If not VIP + never trialed → show "免费试用7天" dialog
 *   4. If trial expired + not VIP → show "购买VIP" dialog ($100-$2000)
 */

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Shield, Sparkles, Clock, Crown, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VipGateProps {
  walletAddress: string;
  children: React.ReactNode;
}

export function VipGate({ walletAddress, children }: VipGateProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [activating, setActivating] = useState(false);

  const { data: vipStatus, isLoading } = useQuery({
    queryKey: ["vip-status", walletAddress],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_vip, vip_expires_at, vip_trial_used")
        .eq("wallet_address", walletAddress)
        .single();
      return data;
    },
    enabled: !!walletAddress,
  });

  const isVipActive = vipStatus?.is_vip && vipStatus?.vip_expires_at &&
    new Date(vipStatus.vip_expires_at) > new Date();
  const trialUsed = vipStatus?.vip_trial_used === true;
  const trialExpired = trialUsed && !isVipActive;

  // Check what to show
  const hasAccess = isVipActive;

  const handleGateClick = () => {
    if (!trialUsed) {
      setShowTrialDialog(true);
    } else {
      setShowPayDialog(true);
    }
  };

  const handleActivateTrial = async () => {
    setActivating(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activate-vip-trial`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ wallet: walletAddress }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast({ title: t("strategy.trialActivated"), description: t("strategy.trialActivatedDesc") });
      setShowTrialDialog(false);
      queryClient.invalidateQueries({ queryKey: ["vip-status", walletAddress] });
    } catch (e: any) {
      toast({ title: t("strategy.activationFailed"), description: e.message, variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white/[0.02] p-8 text-center" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="animate-pulse text-foreground/20 text-xs">{t("strategy.checkingVip")}</div>
      </div>
    );
  }

  // VIP active → show content
  if (hasAccess) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400">VIP</span>
          </div>
          {vipStatus?.vip_expires_at && (
            <span className="text-[10px] text-foreground/25">
              {t("strategy.expiresAt")} {new Date(vipStatus.vip_expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {children}
      </div>
    );
  }

  // Not VIP → show gate
  return (
    <>
      <div
        className="rounded-xl p-6 text-center cursor-pointer hover:border-primary/30 transition-all"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={handleGateClick}
      >
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground/70 mb-1">
          {trialExpired ? t("strategy.vipExpired") : t("strategy.activateVip")}
        </h3>
        <p className="text-[11px] text-foreground/30 mb-4">
          {trialExpired
            ? t("strategy.trialEndedDesc")
            : t("strategy.trialPromo")}
        </p>
        <button className="px-6 py-2.5 rounded-xl bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors">
          {trialExpired ? t("strategy.buyVip") : t("strategy.freeTrial7d")}
        </button>
      </div>

      {/* Free Trial Dialog */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">{t("strategy.freeTrial7d")}</DialogTitle>
                <DialogDescription className="text-[13px]">{t("strategy.trialAllFeatures")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {[
              { icon: <Zap className="h-3.5 w-3.5 text-primary" />, text: t("strategy.feature1") },
              { icon: <Zap className="h-3.5 w-3.5 text-primary" />, text: t("strategy.feature2") },
              { icon: <Zap className="h-3.5 w-3.5 text-primary" />, text: t("strategy.feature3") },
              { icon: <Zap className="h-3.5 w-3.5 text-primary" />, text: t("strategy.feature4") },
              { icon: <Clock className="h-3.5 w-3.5 text-amber-400" />, text: t("strategy.feature5") },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[12px] text-foreground/60">
                {item.icon}
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTrialDialog(false)}>{t("common.cancel")}</Button>
            <Button
              className="bg-primary text-black font-bold"
              disabled={activating}
              onClick={handleActivateTrial}
            >
              {activating ? t("strategy.activating") : t("strategy.startTrial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VIP Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <Crown className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">{t("strategy.buyVip")}</DialogTitle>
                <DialogDescription className="text-[13px]">{t("strategy.unlockAllFeatures")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {[
              { amount: 100, periodKey: "strategy.period1m", limit: "$2,500" },
              { amount: 300, periodKey: "strategy.period3m", limit: "$7,500" },
              { amount: 500, periodKey: "strategy.period6m", limit: "$12,500" },
              { amount: 1000, periodKey: "strategy.period12m", limit: "$25,000" },
              { amount: 2000, periodKey: "strategy.period24m", limit: "$50,000" },
            ].map((plan) => (
              <button
                key={plan.amount}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all"
                onClick={() => {
                  toast({ title: t("strategy.vipPayment"), description: `$${plan.amount} USDT — ${t(plan.periodKey)}` });
                  // TODO: integrate with VIP contract payment
                  setShowPayDialog(false);
                }}
              >
                <div>
                  <div className="text-[13px] font-bold text-foreground/70">${plan.amount} USDT</div>
                  <div className="text-[10px] text-foreground/30">{t(plan.periodKey)} · {t("strategy.positionLimit")} {plan.limit}</div>
                </div>
                <div className="text-[11px] text-primary font-semibold">{t("common.select")}</div>
              </button>
            ))}
          </div>

          <p className="text-[10px] text-foreground/20 text-center">
            {t("strategy.revenueShare")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
