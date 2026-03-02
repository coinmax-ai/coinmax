import { useLocation, Link } from "wouter";
import { Home, BarChart3, Vault, Brain, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const tabs = [
  { path: "/", icon: Home, labelKey: "nav.home" },
  { path: "/trade", icon: BarChart3, labelKey: "nav.trade" },
  { path: "/vault", icon: Vault, labelKey: "nav.vault" },
  { path: "/strategy", icon: Brain, labelKey: "nav.strategy" },
  { path: "/profile", icon: User, labelKey: "nav.profile" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-white/[0.06]"
      style={{ borderRadius: '20px 20px 0 0', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-testid="bottom-nav"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around gap-1 px-2 py-1">
        {tabs.map((tab) => {
          const isActive =
            tab.path === "/"
              ? location === "/"
              : location.startsWith(tab.path);
          const label = t(tab.labelKey);
          return (
            <Link key={tab.path} href={tab.path}>
              <Button
                variant="ghost"
                size="sm"
                className={`flex flex-col items-center gap-0.5 px-3 py-2 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
                data-testid={`nav-${tab.path === "/" ? "home" : tab.path.slice(1)}`}
              >
                <tab.icon className={`h-5 w-5 ${isActive ? "drop-shadow-[0_0_8px_rgba(0,188,165,0.6)]" : ""}`} />
                <span className="text-[12px] font-medium">{label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
