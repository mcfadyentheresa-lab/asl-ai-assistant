import { useState } from "react";
import { AppShellContext } from "@/contexts/app-shell-context";
import { NavbarShell } from "@/components/layout/Navbar";
import { DesktopSidebar, SidebarNav } from "@/components/layout/Sidebar";
import { Link } from "wouter";
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

  return (
    <AppShellContext.Provider value={true}>
      <div className="flex flex-col h-screen bg-background">
        <NavbarShell onMenuToggle={() => setDrawerOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          <DesktopSidebar />

          <main className="flex-1 overflow-y-auto" data-testid="app-main-content">
            {children}
          </main>
        </div>
      </div>

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
    </AppShellContext.Provider>
  );
}
