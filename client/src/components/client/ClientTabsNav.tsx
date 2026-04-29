import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface ProjectStub {
  id: number;
  status?: string | null;
}

interface ClientTab {
  label: string;
  /** Path resolver: receives the project id to deep-link against (the project
   *  the user is currently viewing, falling back to their primary project, or
   *  null when they have no project at all). */
  resolve: (projectId: number | null) => string;
  /** Predicate used to mark this tab active for a given location string. */
  isActiveFor: (location: string) => boolean;
}

const TABS: ClientTab[] = [
  {
    label: "The Plan",
    // The Plan is the project root with no `?tab=` parameter. If we know which
    // project the user is viewing we deep-link to it; otherwise we send them
    // home and let the dashboard pick a project.
    resolve: (id) => (id ? `/project/${id}` : "/"),
    isActiveFor: (loc) =>
      loc === "/" ||
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
 * Pull the project id out of a route like `/project/5` or `/project/5?tab=...`.
 * Returns null if we are not on a project page.
 */
function projectIdFromLocation(location: string): number | null {
  const m = location.match(/^\/project\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

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

  // 1. Prefer the project the user is currently viewing (URL is the source of
  //    truth). This is the case for both real clients on a project page AND
  //    admins using the Client Preview toggle on a specific project.
  const currentProjectId = projectIdFromLocation(location);

  // 2. If we are NOT on a project page (e.g. on `/`), fall back to the user's
  //    primary non-archived project so the tabs still deep-link somewhere
  //    sensible. We only fetch the list when needed.
  const { data: projects } = useQuery<ProjectStub[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentProjectId === null,
    staleTime: 60_000,
  });

  const primaryProject =
    (projects || []).find((p) => p.status !== "archived") || null;
  const projectId = currentProjectId ?? primaryProject?.id ?? null;

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
