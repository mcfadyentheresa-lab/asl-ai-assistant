import { useState } from "react";
import { AppShellContext } from "@/contexts/app-shell-context";
import { NavbarShell, PreviewBanner } from "@/components/layout/Navbar";
import { DesktopSidebar, SidebarNav } from "@/components/layout/Sidebar";
import { Link } from "wouter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/hooks/use-auth";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTenantBrand } from "@/hooks/use-tenant-brand";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const brand = useTenantBrand();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const { viewMode } = useViewMode();
  const isAdmin = user?.role === "admin";
  const effectiveRole = isAdmin ? viewMode : user?.role;
  const isClientView = effectiveRole === "client";

  return (
    <AppShellContext.Provider value={true}>
      <div
        className="flex flex-col h-screen bg-background"
        data-role={isClientView ? "client" : effectiveRole}
      >
        <PreviewBanner />
        <NavbarShell
          onMenuToggle={isClientView ? undefined : () => setDrawerOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          {!isClientView && <DesktopSidebar />}

          <main
            className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
            data-testid="app-main-content"
          >
            {children}
          </main>
        </div>

        <MobileBottomNav />
      </div>

      {!isClientView && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <SheetHeader className="px-5 py-4 border-b border-sidebar-border/50">
              <SheetTitle asChild>
                <div>
                  <Link href="/" onClick={() => setDrawerOpen(false)} data-testid="link-mobile-sidebar-logo">
                    <span
                      className="font-mono text-[19px] font-bold tracking-[0.05em] text-sidebar-primary leading-none block select-none"
                      style={{ fontFamily: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace" }}
                    >
                      E.L.M
                    </span>
                  </Link>
                  <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/35 mt-1 block select-none">
                    {brand.legalName}
                  </span>
                </div>
              </SheetTitle>
            </SheetHeader>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </AppShellContext.Provider>
  );
}
