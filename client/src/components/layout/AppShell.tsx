import { useState } from "react";
import { AppShellContext } from "@/contexts/app-shell-context";
import { NavbarShell } from "@/components/layout/Navbar";
import { DesktopSidebar, SidebarNav } from "@/components/layout/Sidebar";
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
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/60">
            <SheetTitle className="font-serif text-lg font-bold tracking-tight text-foreground text-left">
              ASL
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
    </AppShellContext.Provider>
  );
}
