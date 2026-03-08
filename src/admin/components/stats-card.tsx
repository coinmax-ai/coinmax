import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; positive: boolean };
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <div
      className="rounded-2xl p-3.5 lg:p-5 border border-border/30 backdrop-blur-sm"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 0 1px rgba(255,255,255,0.05) inset",
      }}
    >
      <div className="flex items-start justify-between mb-2 lg:mb-3">
        <span className="text-[10px] lg:text-xs font-medium text-foreground/40 uppercase tracking-wider leading-tight">
          {title}
        </span>
        {Icon && (
          <div className="h-6 w-6 lg:h-8 lg:w-8 rounded-md lg:rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15 shrink-0 ml-2">
            <Icon className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
          </div>
        )}
      </div>
      <div className="text-lg lg:text-2xl font-bold text-foreground tracking-tight truncate">
        {value}
      </div>
      {(subtitle || trend) && (
        <div className="flex items-center gap-2 mt-1 lg:mt-2">
          {trend && (
            <span className={`text-[10px] lg:text-xs font-semibold ${trend.positive ? "text-emerald-400" : "text-red-400"}`}>
              {trend.positive ? "+" : ""}{trend.value}%
            </span>
          )}
          {subtitle && <span className="text-[10px] lg:text-xs text-foreground/35 truncate">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
