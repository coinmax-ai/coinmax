import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Loader2, ChevronRight, ArrowLeft, Zap, ShieldCheck } from "lucide-react";
import { NODE_PLANS, NODE_MILESTONES } from "@/lib/data";
import { usePayment, getPaymentStatusLabel } from "@/hooks/use-payment";
import { purchaseNode } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { NODE_CONTRACT_ADDRESS } from "@/lib/contracts";
import { useTranslation } from "react-i18next";

type Step = "info" | "confirm_payment";

interface NodePurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeType: "MAX" | "MINI";
  walletAddr: string;
}

export function NodePurchaseDialog({ open, onOpenChange, nodeType, walletAddr }: NodePurchaseDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const payment = usePayment();
  const [step, setStep] = useState<Step>("info");

  const plan = NODE_PLANS[nodeType];

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      let txHash: string | undefined;
      if (NODE_CONTRACT_ADDRESS) {
        txHash = await payment.payNodePurchase(nodeType, "FULL");
      }
      const result = await purchaseNode(walletAddr, nodeType, txHash, "FULL");
      payment.markSuccess();
      return result;
    },
    onSuccess: () => {
      toast({
        title: t("profile.nodePurchased"),
        description: t("profile.nodePurchaseSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["node-overview", walletAddr] });
      queryClient.invalidateQueries({ queryKey: ["profile", walletAddr] });
      queryClient.invalidateQueries({ queryKey: ["node-milestone-requirements", walletAddr] });
      payment.reset();
      handleClose();
    },
    onError: (err: Error) => {
      const failedTxHash = payment.txHash;
      const desc = failedTxHash
        ? `${err.message}\n\nOn-chain tx: ${failedTxHash}\nPlease contact support.`
        : err.message;
      toast({ title: "Error", description: desc, variant: "destructive" });
      payment.reset();
    },
  });

  const handleClose = () => {
    if (purchaseMutation.isPending) return;
    setStep("info");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    setStep("confirm_payment");
  };

  const handlePurchase = () => {
    purchaseMutation.mutate();
  };

  const isMAX = nodeType === "MAX";
  const dailyRate = isMAX ? "0.9%" : "0.5%";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-[380px] p-0 overflow-hidden gap-0"
        style={{
          background: "#141414",
          border: "1px solid rgba(255,255,255,0.45)",
          borderRadius: 24,
          boxShadow: "0 25px 60px rgba(0,0,0,0.7), 0 0 40px rgba(74,222,128,0.08)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column" as const,
        }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{isMAX ? t("profile.applyLargeNode") : t("profile.applySmallNode")}</DialogTitle>
          <DialogDescription>{t("profile.confirmPaymentDesc")}</DialogDescription>
        </VisuallyHidden.Root>
        <div
          className="relative overflow-hidden px-5 pt-6 pb-5"
          style={{
            background: isMAX
              ? "linear-gradient(160deg, #0f2818 0%, #152f1d 40%, #141414 100%)"
              : "linear-gradient(160deg, #1a1a1a 0%, #1e1e1e 40%, #141414 100%)",
          }}
        >
          {isMAX && (
            <div
              className="absolute top-0 right-0 w-32 h-32 opacity-20"
              style={{
                background: "radial-gradient(circle, rgba(74,222,128,0.4) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />
          )}

          <div className="relative flex items-center gap-3">
            {step === "confirm_payment" && (
              <button
                onClick={() => setStep("info")}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <ArrowLeft className="h-4 w-4 text-white/80" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isMAX ? (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #166534, #15803d)", boxShadow: "0 2px 8px rgba(22,101,52,0.4)" }}>
                    <Zap className="h-3.5 w-3.5 text-green-200" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #374151, #4b5563)" }}>
                    <ShieldCheck className="h-3.5 w-3.5 text-gray-200" />
                  </div>
                )}
                <h2 className="text-[16px] font-bold text-white tracking-tight">
                  {isMAX ? t("profile.applyLargeNode") : t("profile.applySmallNode")}
                </h2>
              </div>
              <p className="text-[11px] text-white/30 mt-1 ml-9">
                {step === "info" && (isMAX ? t("profile.largeNodeDesc") : t("profile.miniNodeDesc"))}
                {step === "confirm_payment" && t("profile.confirmPaymentDesc")}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 flex-1 node-dialog-scroll" style={{ minHeight: 0, overflowY: "auto" }}>
          {step === "info" && (
            <div className="space-y-3">
              <div
                className="rounded-2xl p-4 relative overflow-hidden"
                style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-xl p-3 text-center" style={{ background: "#1a1a1a" }}>
                    <div className="text-[10px] text-white/30 mb-0.5">{t("profile.contribution")}</div>
                    <div className="text-[15px] font-bold text-white">${plan.price}</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: "#1a1a1a" }}>
                    <div className="text-[10px] text-white/30 mb-0.5">{t("profile.nodeTotal")}</div>
                    <div className="text-[15px] font-bold text-white">${plan.frozenAmount.toLocaleString()}</div>
                  </div>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: "#1a1a1a" }}>
                  <div className="text-[10px] text-white/30 mb-0.5">{t("profile.dailyRelease")}</div>
                  <div className="text-[15px] font-bold text-green-400">{dailyRate}</div>
                  <div className="text-[9px] text-white/25 mt-0.5">{t("profile.releaseByMA")}</div>
                </div>
                <div className="rounded-xl p-3 space-y-1 mt-3" style={{ background: "#1a1a1a" }}>
                  <div className="text-[10px] text-white/35 font-semibold uppercase tracking-wider mb-1">{t("profile.milestoneSchedule")}</div>
                  {NODE_MILESTONES[nodeType].map((m, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <div className="w-1 h-1 rounded-full bg-green-400/50" />
                      <span className="text-[10px] text-white/50">
                        {t("profile.dayN", { n: m.days })} → {m.rank}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                className="w-full rounded-2xl h-12 flex items-center justify-center gap-2 text-[14px] font-bold text-white transition-all active:scale-[0.97]"
                style={{
                  background: isMAX
                    ? "linear-gradient(135deg, #16a34a, #15803d)"
                    : "linear-gradient(135deg, #374151, #4b5563)",
                  boxShadow: isMAX ? "0 4px 16px rgba(22,163,74,0.3)" : "0 4px 16px rgba(55,65,81,0.3)",
                }}
                onClick={handleConfirm}
              >
                {t("common.next")}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === "confirm_payment" && (
            <div className="space-y-3">
              <div
                className="rounded-2xl p-5 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #0f1f15, #141414)",
                  border: "1px solid rgba(74,222,128,0.1)",
                }}
              >
                <div className="absolute inset-0 opacity-5" style={{ background: "radial-gradient(circle at 50% 0%, rgba(74,222,128,0.5), transparent 60%)" }} />
                <div className="relative">
                  <div className="text-center mb-4">
                    <div
                      className="w-14 h-14 rounded-2xl mx-auto mb-2 flex items-center justify-center"
                      style={{
                        background: isMAX
                          ? "linear-gradient(135deg, #166534, #15803d)"
                          : "linear-gradient(135deg, #374151, #4b5563)",
                        boxShadow: isMAX ? "0 6px 24px rgba(22,101,52,0.35)" : "0 6px 24px rgba(55,65,81,0.3)",
                      }}
                    >
                      {isMAX ? <Zap className="h-6 w-6 text-green-200" /> : <ShieldCheck className="h-6 w-6 text-gray-200" />}
                    </div>
                    <div className="text-[12px] text-white/40">
                      {isMAX ? t("profile.applyLargeNode") : t("profile.applySmallNode")}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[12px] text-white/40">{t("profile.contribution")}</span>
                      <span className="text-[13px] font-semibold text-white/80">${plan.price} USDC</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[12px] text-white/40">{t("profile.nodeTotal")}</span>
                      <span className="text-[13px] font-semibold text-white/60">${plan.frozenAmount.toLocaleString()} USDC</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[12px] text-white/40">{t("profile.dailyRelease")}</span>
                      <span className="text-[13px] font-semibold text-green-400">{dailyRate}</span>
                    </div>
                    <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[13px] font-bold text-white/60">{t("profile.totalPayment")}</span>
                      <span className="text-[17px] font-black text-primary">${plan.price}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                className="w-full rounded-2xl h-12 flex items-center justify-center gap-2 text-[14px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                style={{
                  background: purchaseMutation.isPending
                    ? "linear-gradient(135deg, #374151, #4b5563)"
                    : "linear-gradient(135deg, #16a34a, #15803d)",
                  boxShadow: purchaseMutation.isPending ? "none" : "0 4px 20px rgba(22,163,74,0.35)",
                }}
                onClick={handlePurchase}
                disabled={purchaseMutation.isPending}
              >
                {purchaseMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {getPaymentStatusLabel(payment.status) || t("common.processing")}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t("profile.confirmPurchase")}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
