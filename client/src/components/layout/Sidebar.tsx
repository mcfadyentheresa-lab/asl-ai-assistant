import { useLocation } from "wouter";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useViewMode } from "@/hooks/use-view-mode";
import { getNavItemsForRole, groupNavItems, type NavRole } from "@/lib/nav-config";

interface SidebarNavProps {
  onNavigate?: () => void;
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { viewMode } = useViewMode();

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const effectiveRole: NavRole = isAdmin ? viewMode : (user.role as NavRole);

  const items = getNavItemsForRole(effectiveRole);
  const grouped = groupNavItems(items);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <div className="flex flex-col gap-1 px-3 py-4">
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
          </div>
        </div>
      ))}
    </div>
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
