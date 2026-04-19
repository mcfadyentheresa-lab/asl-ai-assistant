import { useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useViewMode } from "@/hooks/use-view-mode";
import { useTextZoom } from "@/hooks/use-text-zoom";
import { useQuery } from "@tanstack/react-query";
import { getNavItemsForRole, groupNavItems, type NavRole } from "@/lib/nav-config";
import { WalkthroughModal } from "@/components/WalkthroughModal";
import { BookOpen, ZoomIn, Home } from "lucide-react";

interface SidebarNavProps {
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { viewMode } = useViewMode();
  const { zoom, cycleZoom } = useTextZoom();
  const [tourOpen, setTourOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const effectiveRole: NavRole = isAdmin ? viewMode : ((user?.role ?? "client") as NavRole);

  const { data: projects } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/projects"],
    enabled: effectiveRole === "client",
  });

  const clientProject = effectiveRole === "client" && projects && projects.length > 0
    ? projects[0]
    : null;

  if (!user) return null;

  const items = getNavItemsForRole(effectiveRole);
  const grouped = groupNavItems(items);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  const handleTourClose = () => {
    if (user) {
      localStorage.setItem(`asl_tour_seen_${user.id}`, "1");
    }
    setTourOpen(false);
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 px-3 py-4 flex-1">
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="mb-4">
              {group !== "Overview" && (
                <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">
                  {group}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={onNavigate}
                      data-testid={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}

                {group === "Overview" && clientProject && (
                  <Link
                    href={`/project/${clientProject.id}`}
                    onClick={onNavigate}
                    data-testid="sidebar-link-client-project"
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                        location.startsWith(`/project/${clientProject.id}`)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <Home className="h-4 w-4 shrink-0" />
                      <span className="truncate">{clientProject.name}</span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/40 px-3 py-3 flex flex-col gap-0.5">
          <button
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer w-full text-left"
            data-testid="sidebar-take-tour"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>Take the Tour</span>
          </button>
          <button
            onClick={cycleZoom}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer w-full text-left"
            data-testid="sidebar-text-size"
          >
            <ZoomIn className="h-4 w-4 shrink-0" />
            <span>Text Size: {zoom}%</span>
          </button>
        </div>
      </div>

      <WalkthroughModal open={tourOpen} onClose={handleTourClose} />
    </>
  );
}

export function DesktopSidebar() {
  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0 border-r border-border/60 bg-background overflow-y-auto"
      data-testid="sidebar-desktop"
    >
      <SidebarNav />
    </aside>
  );
}
