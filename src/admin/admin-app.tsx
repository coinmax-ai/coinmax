import { Switch, Route, useLocation } from "wouter";
import { AdminSidebar, MobileDrawer, DrawerProvider, useDrawer, navItems } from "./components/admin-sidebar";
import { AdminAuthProvider } from "./admin-auth";
import { useTranslation } from "react-i18next";
import { Shield, Menu } from "lucide-react";

// Page imports
import AdminDashboard from "./pages/admin-dashboard";
import AdminMembers from "./pages/admin-members";
import AdminReferrals from "./pages/admin-referrals";
import AdminVaults from "./pages/admin-vaults";
import AdminNodes from "./pages/admin-nodes";
import AdminAuthCodes from "./pages/admin-auth-codes";
import AdminPerformance from "./pages/admin-performance";

function AdminHeader() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { setOpen } = useDrawer();

  const current = navItems.find((item) =>
    item.exact ? location === item.path : location.startsWith(item.path)
  );

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-12 lg:h-14 px-4 lg:px-6 border-b border-border/30 bg-background/90 backdrop-blur-xl">
      {/* Mobile: hamburger + logo */}
      <div className="flex items-center gap-3 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground/50 hover:text-foreground/80 hover:bg-white/[0.05] transition-colors -ml-1"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center border border-primary/30">
            <span className="font-display text-[10px] font-black text-primary">C</span>
          </div>
          <span className="text-xs font-semibold text-foreground/70">{current?.label ?? "Admin"}</span>
        </div>
      </div>

      {/* Desktop: section name */}
      <h1 className="hidden lg:block text-sm font-semibold text-foreground tracking-wide">
        {current?.label ?? "Admin"}
      </h1>

      <div className="flex items-center gap-2">
        <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
          <Shield className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary" />
        </div>
        <span className="text-xs font-medium text-foreground/50 hidden sm:inline">
          {t("common.admin", "管理员")}
        </span>
      </div>
    </header>
  );
}

function AdminLayout() {
  return (
    <DrawerProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AdminSidebar />
        <MobileDrawer />
        <div className="lg:ml-[240px]">
          <AdminHeader />
          <main className="px-3 py-4 lg:p-6">
            <Switch>
              <Route path="/admin" component={AdminDashboard} />
              <Route path="/admin/members" component={AdminMembers} />
              <Route path="/admin/referrals" component={AdminReferrals} />
              <Route path="/admin/vaults" component={AdminVaults} />
              <Route path="/admin/nodes" component={AdminNodes} />
              <Route path="/admin/auth-codes" component={AdminAuthCodes} />
              <Route path="/admin/performance" component={AdminPerformance} />
            </Switch>
          </main>
        </div>
      </div>
    </DrawerProvider>
  );
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminLayout />
    </AdminAuthProvider>
  );
}
