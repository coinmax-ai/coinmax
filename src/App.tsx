import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { authWallet } from "./lib/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThirdwebProvider, ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { useThirdwebClient } from "@/hooks/use-thirdweb";
import { BottomNav } from "@/components/bottom-nav";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import Dashboard from "@/pages/dashboard";
import Trade from "@/pages/trade";
import Vault from "@/pages/vault";
import StrategyPage from "@/pages/strategy";
import ProfilePage from "@/pages/profile";
import ProfileReferralPage from "@/pages/profile-referral";
import ProfileTransactionsPage from "@/pages/profile-transactions";
import ProfileNotificationsPage from "@/pages/profile-notifications";
import ProfileSettingsPage from "@/pages/profile-settings";
import ProfileNodesPage from "@/pages/profile-nodes";
import ProfileNodeEarningsPage from "@/pages/profile-node-earnings";
import MarketPage from "@/pages/market";
import NotFound from "@/pages/not-found";

const wallets = [
  inAppWallet(),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("io.rabby"),
];

function WalletSync() {
  const account = useActiveAccount();

  // Extract ref code from URL on mount (before wallet connects)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRef = urlParams.get("ref");
    if (urlRef) {
      sessionStorage.setItem("coinmax_ref_code", urlRef);
      urlParams.delete("ref");
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Auth wallet with ref code when wallet connects
  useEffect(() => {
    if (account?.address) {
      const refCode = sessionStorage.getItem("coinmax_ref_code");
      authWallet(account.address, refCode || undefined)
        .then(() => { if (refCode) sessionStorage.removeItem("coinmax_ref_code"); })
        .catch(console.error);
    }
  }, [account?.address]);

  return null;
}

function Header() {
  const { client, isLoading } = useThirdwebClient();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-background/90 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2.5 cursor-pointer" data-testid="link-logo-home">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center neon-glow-sm border border-primary/30 relative overflow-hidden">
          <span className="font-display text-sm font-black text-primary drop-shadow-[0_0_8px_rgba(0,188,165,0.6)]">C</span>
          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/5" />
        </div>
        <span className="font-display text-sm font-bold tracking-widest text-foreground">
          Coin<span className="text-primary drop-shadow-[0_0_6px_rgba(0,188,165,0.5)]">Max</span>
        </span>
      </Link>
      {isLoading || !client ? (
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
      ) : (
        <ConnectButton
          client={client}
          wallets={wallets}
          connectButton={{
            label: t("common.connect"),
            style: {
              background: "linear-gradient(135deg, hsl(174, 72%, 46%), hsl(170, 60%, 36%))",
              color: "#ffffff",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              height: "36px",
              padding: "0 16px",
              border: "none",
              boxShadow: "0 0 12px rgba(0, 188, 165, 0.3), 0 0 4px rgba(0, 188, 165, 0.2)",
            },
          }}
          detailsButton={{
            style: {
              background: "hsl(170, 18%, 10%)",
              color: "hsl(165, 15%, 93%)",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "500",
              height: "36px",
              padding: "0 12px",
              border: "1px solid rgba(0, 188, 165, 0.2)",
              boxShadow: "0 0 8px rgba(0, 188, 165, 0.06)",
            },
          }}
          theme="dark"
        />
      )}
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/trade" component={Trade} />
      <Route path="/vault" component={Vault} />
      <Route path="/strategy" component={StrategyPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/profile/referral" component={ProfileReferralPage} />
      <Route path="/profile/transactions" component={ProfileTransactionsPage} />
      <Route path="/profile/notifications" component={ProfileNotificationsPage} />
      <Route path="/profile/settings" component={ProfileSettingsPage} />
      <Route path="/profile/nodes" component={ProfileNodesPage} />
      <Route path="/profile/nodes/earnings" component={ProfileNodeEarningsPage} />
      <Route path="/market" component={MarketPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThirdwebProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Header />
            <main className="mx-auto max-w-lg">
              <Router />
            </main>
            <BottomNav />
            <WalletSync />
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThirdwebProvider>
  );
}

export default App;
