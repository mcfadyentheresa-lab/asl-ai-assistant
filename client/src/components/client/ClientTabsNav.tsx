import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface ProjectStub {
  id: number;
  status?: string | null;
}

interface ClientTab {
  label: string;
  /** Path resolver: receives the client's primary project id (or null) and
   *  returns the route to navigate to. We resolve at render time so a fresh
   *  client without a project still gets a sensible href (the dashboard). */
  resolve: (projectId: number | null) => string;
  /** Predicate used to mark this tab active for a given location string. */
  isActiveFor: (location: string) => boolean;
}

const TABS: ClientTab[] = [
  {
    label: "The Plan",
    resolve: () => "/",
    isActiveFor: (loc) =>
      loc === "/" ||
      // Project root with no tab param == The Plan
      (loc.startsWith("/project/") && !loc.includes("?tab=")),
  },
  {
    label: "Updates",
    resolve: (id) => (id ? `/project/${id}?tab=overview` : "/"),
    isActiveFor: (loc) => loc.includes("tab=overview"),
  },
  {
    label: "Design Board",
    resolve: (id) => (id ? `/project/${id}?tab=board` : "/"),
    isActiveFor: (loc) => loc.includes("tab=board"),
  },
  {
    label: "Documents",
    resolve: (id) => (id ? `/project/${id}?tab=docs` : "/"),
    isActiveFor: (loc) => loc.includes("tab=docs"),
  },
  {
    label: "Messages",
    resolve: (id) => (id ? `/project/${id}?tab=chat` : "/"),
    isActiveFor: (loc) => loc.includes("tab=chat"),
  },
];

/**
 * Flat underlined file-tab navigation for the client view.
 *
 * Background: previously this nav linked to `/updates` and `/design-board`,
 * neither of which existed as routes — clicking either dropped the client on
 * the NotFound page. We now resolve each tab against the client's active
 * project and route them to the correct project tab.
 */
export function ClientTabsNav() {
  const [location] = useLocation();

  // Pull the client's projects to resolve the primary one. If they have none
  // we still render the tabs (disabled / point at /) so the layout doesn't
  // jump between empty and full states on first load.
  const { data: projects } = useQuery<ProjectStub[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const primaryProject =
    (projects || []).find((p) => p.status !== "archived") || null;
  const projectId = primaryProject?.id ?? null;

  return (
    <nav
      className="hidden md:flex items-center gap-7 lg:gap-8 h-14"
      data-testid="client-tabs-nav"
      aria-label="Primary"
    >
      {TABS.map((t) => {
        const active = t.isActiveFor(location);
        const href = t.resolve(projectId);
        const disabled = !projectId && t.label !== "The Plan";

        return (
          <Link
            key={t.label}
            href={href}
            data-testid={`client-tab-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
            // When the client has no project, only "The Plan" is meaningful.
            // Other tabs render but visually mute and effectively no-op (resolve to /).
            aria-disabled={disabled || undefined}
          >
            <span
              className={cn(
                "relative inline-flex items-center h-14 text-[15px] tracking-tight transition-colors",
                active
                  ? "text-foreground font-semibold"
                  : disabled
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground hover:text-foreground font-medium"
              )}
            >
              {t.label}
              {active && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-foreground"
                  aria-hidden
                />
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
