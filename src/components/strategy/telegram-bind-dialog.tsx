/**
 * Telegram Bind Dialog — Verify code to link Telegram for trade notifications
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

interface TelegramBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
}

export function TelegramBindDialog({ open, onOpenChange, walletAddress }: TelegramBindDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBind = async () => {
    if (!walletAddress || code.length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bind?action=verify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ wallet: walletAddress, code: code.toUpperCase() }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      toast({ title: t("strategy.bindSuccess"), description: t("strategy.telegramNotificationsEnabled") });
      onOpenChange(false);
      setCode("");
    } catch (e: any) {
      toast({ title: t("strategy.bindFailed"), description: e.message || t("strategy.codeInvalidOrExpired"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center" style={{ boxShadow: "0 0 12px rgba(59,130,246,0.3)" }}>
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">{t("strategy.bindTelegram")}</DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground">
                {t("strategy.receiveSignalsAndPnl")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="border-border bg-background">
            <CardContent className="p-3">
              <div className="space-y-2 text-[12px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="bg-primary/20 text-primary rounded-full h-4 w-4 flex items-center justify-center shrink-0 text-[11px] font-bold">1</span>
                  <span>{t("strategy.telegramStep1")} <b>@coinmax_openclaw_bot</b></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-primary/20 text-primary rounded-full h-4 w-4 flex items-center justify-center shrink-0 text-[11px] font-bold">2</span>
                  <span>{t("strategy.telegramStep2")} <code className="bg-primary/10 px-1 rounded">/bind</code> {t("strategy.telegramStep2Suffix")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-primary/20 text-primary rounded-full h-4 w-4 flex items-center justify-center shrink-0 text-[11px] font-bold">3</span>
                  <span>{t("strategy.telegramStep3")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">{t("strategy.verificationCode")}</label>
            <Input
              placeholder={t("strategy.enterVerificationCode")}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-xs font-mono tracking-widest text-center text-lg"
              maxLength={6}
            />
          </div>

          <div className="space-y-1 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>{t("strategy.notifyNewSignals")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>{t("strategy.notifyClosePnl")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>{t("strategy.notifyRiskAlert")}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            className="bg-gradient-to-r from-blue-600 to-indigo-500 border-blue-500/50 text-white"
            disabled={loading || code.length < 6}
            onClick={handleBind}
          >
            <MessageCircle className="mr-1 h-4 w-4" />
            {loading ? t("strategy.verifying") : t("strategy.bindTelegram")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
