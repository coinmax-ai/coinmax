import { useLocation, Link } from "wouter";
import { Home, BarChart3, Vault, Brain, User, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const leftTabs = [
  { path: "/", icon: Home, labelKey: "nav.home" },
  { path: "/trade", icon: BarChart3, labelKey: "nav.trade" },
];

const rightTabs = [
  { path: "/strategy", icon: Brain, labelKey: "nav.strategy" },
  { path: "/profile", icon: User, labelKey: "nav.profile" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const renderTab = (tab: { path: string; icon: React.ElementType; labelKey: string }) => {
    const isActive = tab.path === "/" ? location === "/" : location.startsWith(tab.path);
    const label = t(tab.labelKey);
    return (
      <Link key={tab.path} href={tab.path}>
        <Button
          variant="ghost"
          size="sm"
          className={`flex flex-col items-center gap-0.5 px-3 py-2 ${
            isActive ? "text-primary" : "text-muted-foreground"
          }`}
          data-testid={`nav-${tab.path === "/" ? "home" : tab.path.slice(1)}`}
        >
          <tab.icon className={`h-5 w-5 ${isActive ? "drop-shadow-[0_0_8px_rgba(0,188,165,0.6)]" : ""}`} />
          <span className="text-[12px] font-medium">{label}</span>
        </Button>
      </Link>
    );
  };

  const vaultActive = location.startsWith("/vault");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bnav-glass"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-testid="bottom-nav"
    >
      <div className="bnav-glow-bar bnav-glow-green" />
      <div className="bnav-glow-bar bnav-glow-red" />

      <div className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, rgba(0,231,160,0.15), rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.06) 60%, rgba(255,73,118,0.15))' }}
      />

      <div className="relative mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        <div className="flex items-center gap-1">
          {leftTabs.map(renderTab)}
        </div>

        <Link href="/vault">
          <button
            className={`bnav-diamond-btn relative flex flex-col items-center -mt-5 ${vaultActive ? 'bnav-diamond-active' : ''}`}
            data-testid="nav-vault"
          >
            <div className="bnav-diamond-wrap">
              <div className="bnav-diamond-bg" />
              <Diamond className="bnav-diamond-icon h-6 w-6 relative z-10" />
            </div>
            <span className={`text-[10px] font-semibold mt-1 ${vaultActive ? 'text-primary' : 'text-muted-foreground/70'}`}>
              {t("nav.vault")}
            </span>
          </button>
        </Link>

        <div className="flex items-center gap-1">
          {rightTabs.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}
