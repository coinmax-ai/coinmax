import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, BarChart3, Target, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGrowingStats } from "@/hooks/use-growing-stats";

// Deterministic value per hour, changes once per hour
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function getHourlyValue(min: number, max: number, salt: number) {
  const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60)); // changes every hour
  return min + seededRandom(hourSeed + salt) * (max - min);
}

function useHourlyValue(min: number, max: number, salt: number) {
  const [value, setValue] = useState(() => getHourlyValue(min, max, salt));
  useEffect(() => {
    // Check every minute if the hour changed
    const interval = setInterval(() => {
      setValue(getHourlyValue(min, max, salt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [min, max, salt]);
  return value;
}

function getCalendarDays(calendarMonth: Date) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: { day: number; pnl: number }[] = [];
  for (let i = 0; i < firstDay; i++) days.push({ day: 0, pnl: 0 });

  const now = new Date();
  const dataStartDate = new Date(now.getFullYear(), now.getMonth() - 9, 1);
  const isHistorical = new Date(year, month, 1) >= dataStartDate && new Date(year, month, 1) <= now;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    if (isHistorical && date <= now) {
      const seed = year * 10000 + (month + 1) * 100 + d;
      const rng = ((Math.sin(seed * 9301 + 49297) % 1) + 1) % 1;
      const rng2 = ((Math.sin(seed * 7919 + 31337) % 1) + 1) % 1;
      const rng3 = ((Math.sin(seed * 6271 + 15731) % 1) + 1) % 1;
      const isWin = rng > 0.30;
      let pnl: number;
      if (isWin) {
        pnl = 0.8 + rng2 * 2.4;
      } else {
        pnl = -(0.3 + rng3 * 1.7);
      }
      const dow = date.getDay();
      if (dow === 0 || dow === 6) pnl *= 0.4;
      days.push({ day: d, pnl: Math.round(pnl * 100) / 100 });
    } else {
      days.push({ day: d, pnl: 0 });
    }
  }
  return days;
}

function getCumulativeStats() {
  const now = new Date();
  const dataStart = new Date(now.getFullYear(), now.getMonth() - 9, 1);
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  for (let m = 0; m < 9; m++) {
    const mDate = new Date(dataStart.getFullYear(), dataStart.getMonth() + m, 1);
    const mYear = mDate.getFullYear();
    const mMonth = mDate.getMonth();
    const mDays = new Date(mYear, mMonth + 1, 0).getDate();
    for (let d = 1; d <= mDays; d++) {
      const date = new Date(mYear, mMonth, d);
      if (date > now) break;
      const seed = mYear * 10000 + (mMonth + 1) * 100 + d;
      const rng = ((Math.sin(seed * 9301 + 49297) % 1) + 1) % 1;
      const rng2 = ((Math.sin(seed * 7919 + 31337) % 1) + 1) % 1;
      const rng3 = ((Math.sin(seed * 6271 + 15731) % 1) + 1) % 1;
      const isWin = rng > 0.30;
      let pnl: number;
      if (isWin) {
        pnl = 0.8 + rng2 * 2.4;
      } else {
        pnl = -(0.3 + rng3 * 1.7);
      }
      const dow = date.getDay();
      if (dow === 0 || dow === 6) pnl *= 0.4;
      totalPnl += pnl;
      if (pnl > 0) wins++; else losses++;
    }
  }
  return { totalPnl, wins, losses };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function StrategyHeader() {
  const { t } = useTranslation();
  const { tvlFormatted } = useGrowingStats();
  const floatingWinRate = useHourlyValue(80, 85, 100);
  const floatingMonthlyReturn = useHourlyValue(25, 35, 200);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const calendarDays = getCalendarDays(calendarMonth);
  const calendarLabel = `${MONTH_NAMES[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;
  const stats = getCumulativeStats();

  return (
    <div className="gradient-green-dark p-4 pt-2 rounded-b-2xl" style={{ animation: "fadeSlideIn 0.4s ease-out" }}>
      <h2 className="text-lg font-bold mb-3" data-testid="text-strategy-title">{t("strategy.aiStrategies")}</h2>
      <Card className="border-border bg-card/50 glow-green-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[12px] text-muted-foreground mb-1">{t("strategy.totalAum")}</div>
              <div className="text-2xl font-bold" data-testid="text-total-aum">{tvlFormatted}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarOpen(true)}
                className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center transition-all hover:bg-primary/30 active:scale-95"
                data-testid="button-pnl-calendar"
              >
                <CalendarDays className="h-5 w-5 text-primary" />
              </button>
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
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

      {/* P&L Calendar Dialog */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="bg-card border-border max-w-sm overflow-hidden">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center" style={{ boxShadow: "0 0 12px rgba(16,185,129,0.3)" }}>
                <CalendarDays className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">{t("strategy.copyTradingRecords")}</DialogTitle>
                <DialogDescription className="text-[13px] text-muted-foreground">
                  {t("strategy.cumulativeReturn")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Stats Summary */}
          <Card className="border-border bg-background">
            <CardContent className="p-2.5">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-emerald-400 tabular-nums">+{stats.totalPnl.toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">{t("strategy.cumulativeReturn")}</div>
                </div>
                <div>
                  <div className="text-sm font-bold tabular-nums">{stats.wins + stats.losses}</div>
                  <div className="text-[10px] text-muted-foreground">{t("strategy.totalProfit")}</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-400 tabular-nums">{stats.wins}</div>
                  <div className="text-[10px] text-muted-foreground">{t("strategy.winCount")}</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-red-400 tabular-nums">{stats.losses}</div>
                  <div className="text-[10px] text-muted-foreground">{t("strategy.lossCount")}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <div>
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] font-bold">{calendarLabel}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-[2px] text-center">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-[9px] text-muted-foreground font-medium py-0.5">{d}</div>
              ))}
              {calendarDays.map((cell, idx) => (
                <div
                  key={idx}
                  className={`rounded-sm py-0.5 text-center ${cell.day === 0 ? "" : "bg-muted/30 border border-border/30"}`}
                >
                  {cell.day > 0 && (
                    <>
                      <div className="text-[10px] font-medium leading-tight">{cell.day}</div>
                      <div className={`text-[9px] leading-tight ${cell.pnl > 0 ? "text-emerald-400" : cell.pnl < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {cell.pnl !== 0 ? `${cell.pnl > 0 ? "+" : ""}${cell.pnl.toFixed(1)}%` : "--"}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
