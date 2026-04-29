import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Newspaper,
  Palette,
  MessageSquare,
} from "lucide-react";

interface BottomNavItem {
  label: string;
  /** Path resolver — receives optional projectId so client tabs can deep-link. */
  resolve: (projectId: number | null) => string;
  icon: React.ElementType;
  /** Active matcher against the current location. */
  isActiveFor: (location: string) => boolean;
}

const CREW_ITEMS: BottomNavItem[] = [
  { label: "Dashboard", resolve: () => "/", icon: LayoutDashboard, isActiveFor: (l) => l === "/" },
  { label: "Log Hours", resolve: () => "/timesheets", icon: Clock, isActiveFor: (l) => l.startsWith("/timesheets") },
  { label: "Calendar", resolve: () => "/master-calendar", icon: CalendarDays, isActiveFor: (l) => l.startsWith("/master-calendar") },
];

// Client mobile nav now mirrors the desktop ClientTabsNav so users see the
// same primary surfaces on phone and laptop. Previously this only showed
// Dashboard + Profile, which left clients unable to reach Updates / Design
// Board / Messages from a phone. Profile is still reachable from the avatar
// menu in the navbar.
const CLIENT_ITEMS: BottomNavItem[] = [
  {
    label: "Plan",
    // Deep-link to the project root if we know which project we're on, else /.
    resolve: (id) => (id ? `/project/${id}` : "/"),
    icon: LayoutDashboard,
    isActiveFor: (l) =>
      l === "/" ||
      (l.startsWith("/project/") && !l.includes("tab=")),
  },
  {
    label: "Updates",
    resolve: (id) => (id ? `/project/${id}?tab=overview` : "/"),
    icon: Newspaper,
    isActiveFor: (l) => l.includes("tab=overview"),
  },
  {
    label: "Design",
    resolve: (id) => (id ? `/project/${id}?tab=board` : "/"),
    icon: Palette,
    isActiveFor: (l) => l.includes("tab=board"),
  },
  {
    label: "Messages",
    resolve: (id) => (id ? `/project/${id}?tab=chat` : "/"),
    icon: MessageSquare,
    isActiveFor: (l) => l.includes("tab=chat"),
  },
];

interface ProjectStub {
  id: number;
  status?: string | null;
}

function projectIdFromLocation(location: string): number | null {
  const m = location.match(/^\/project\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  // Prefer the project from the current URL (works for clients on a project
  // page and for admins using Client Preview on a specific project). Only fall
  // back to the user's primary project list when we don't already know which
  // project they're viewing.
  const currentProjectId = projectIdFromLocation(location);

  const { data: projects } = useQuery<ProjectStub[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === "client" && currentProjectId === null,
    staleTime: 60_000,
  });

  if (!user) return null;
  if (user.role === "admin") return null;

  const items = user.role === "client" ? CLIENT_ITEMS : CREW_ITEMS;
  const primaryProject =
    (projects || []).find((p) => p.status !== "archived") || null;
  const projectId = currentProjectId ?? primaryProject?.id ?? null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden bg-background border-t border-border/60"
      data-testid="mobile-bottom-nav"
    >
      {items.map((item) => {
        const active = item.isActiveFor(location);
        const Icon = item.icon;
        const href = item.resolve(projectId);
        return (
          <Link
            key={item.label}
            href={href}
            className="flex-1"
            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  active && "stroke-[2.2px]"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  active && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
