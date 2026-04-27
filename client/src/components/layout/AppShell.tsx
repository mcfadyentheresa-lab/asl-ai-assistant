import { useState } from "react";
import { AppShellContext } from "@/contexts/app-shell-context";
import { NavbarShell } from "@/components/layout/Navbar";
import { DesktopSidebar, SidebarNav } from "@/components/layout/Sidebar";
import { Link } from "wouter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const isClient = user?.role === "client";

  return (
    <AppShellContext.Provider value={true}>
      <div className="flex flex-col h-screen bg-background">
        <NavbarShell
          onMenuToggle={isClient ? undefined : () => setDrawerOpen(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          {!isClient && <DesktopSidebar />}

          <main className="flex-1 overflow-y-auto pb-16 md:pb-0" data-testid="app-main-content">
            {children}
          </main>
        </div>

        <MobileBottomNav />
      </div>

      {!isClient && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <SheetHeader className="px-5 py-4 border-b border-sidebar-border/50">
              <SheetTitle asChild>
                <div>
                  <Link href="/" onClick={() => setDrawerOpen(false)} data-testid="link-mobile-sidebar-logo">
                    <span className="font-serif text-lg font-bold tracking-tight text-sidebar-primary leading-none block select-none">
                      Aster & Spruce
                    </span>
                  </Link>
                  <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/35 mt-0.5 block select-none">
                    Living
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
