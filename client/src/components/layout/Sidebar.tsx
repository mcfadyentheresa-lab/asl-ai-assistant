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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarNavProps {
  onNavigate?: () => void;
  compact?: boolean;
}

export function SidebarNav({ onNavigate, compact = false }: SidebarNavProps) {
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

  const NavLink = ({
    path,
    icon: Icon,
    label,
    active,
    testId,
  }: {
    path: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
    testId: string;
  }) => {
    const linkContent = (
      <Link href={path} onClick={onNavigate} data-testid={testId}>
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg text-sm transition-colors cursor-pointer",
            compact ? "px-2 py-2 justify-center" : "px-3 py-2",
            active
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!compact && <span>{label}</span>}
        </div>
      </Link>
    );

    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  const FooterButton = ({
    icon: Icon,
    label,
    onClick,
    testId,
  }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    testId: string;
  }) => {
    const btn = (
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer w-full text-left",
          compact ? "px-2 py-2 justify-center" : "px-3 py-2"
        )}
        data-testid={testId}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!compact && <span>{label}</span>}
      </button>
    );

    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto">
        <div className={cn("flex flex-col gap-1 py-4 flex-1", compact ? "px-1" : "px-3")}>
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="mb-4">
              {group !== "Projects" && !compact && (
                <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">
                  {group}
                </p>
              )}
              {group !== "Projects" && compact && (
                <div className="h-px bg-border/40 mx-1 mb-2" />
              )}
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <NavLink
                    key={item.path}
                    path={item.path}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(item.path)}
                    testId={`sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  />
                ))}

                {group === "Projects" && clientProject && (
                  <NavLink
                    path={`/project/${clientProject.id}`}
                    icon={Home}
                    label={clientProject.name}
                    active={location.startsWith(`/project/${clientProject.id}`)}
                    testId="sidebar-link-client-project"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={cn("border-t border-border/40 py-3 flex flex-col gap-0.5", compact ? "px-1" : "px-3")}>
          <FooterButton
            icon={BookOpen}
            label="Take the Tour"
            onClick={() => setTourOpen(true)}
            testId="sidebar-take-tour"
          />
          <FooterButton
            icon={ZoomIn}
            label={compact ? "Text Size" : `Text Size: ${zoom}%`}
            onClick={cycleZoom}
            testId="sidebar-text-size"
          />
        </div>
      </div>

      <WalkthroughModal open={tourOpen} onClose={handleTourClose} />
    </>
  );
}

export function DesktopSidebar() {
  return (
    <>
      <aside
        className="hidden md:flex lg:hidden flex-col w-14 shrink-0 border-r border-border/60 bg-background overflow-y-auto"
        data-testid="sidebar-tablet"
      >
        <SidebarNav compact={true} />
      </aside>

      <aside
        className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border/60 bg-background overflow-y-auto"
        data-testid="sidebar-desktop"
      >
        <SidebarNav compact={false} />
      </aside>
    </>
  );
}
