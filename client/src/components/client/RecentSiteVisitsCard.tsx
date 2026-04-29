import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

type SiteVisit = {
  id: number;
  visitedOn: string;
  visitType: string;
  attendees: string | null;
  summary: string;
  followUps: string | null;
};

interface RecentSiteVisitsCardProps {
  projectId: number;
  limit?: number;
}

const TYPE_LABEL: Record<string, string> = {
  walkthrough: "Walkthrough",
  inspection: "Inspection",
  milestone: "Milestone",
  routine: "Routine",
};

/**
 * Compact recent-site-visits section for the client's "Plan" home.
 * Shows up to `limit` visits (default 3), newest first, with a link
 * to the project's full Site Visits tab. Renders nothing when there
 * are no visits so the page stays calm for new projects.
 */
export function RecentSiteVisitsCard({
  projectId,
  limit = 3,
}: RecentSiteVisitsCardProps) {
  const { data: visits, isLoading } = useQuery<SiteVisit[]>({
    queryKey: ["/api/projects", projectId, "site-visits"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/site-visits`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  if (isLoading) return null;
  const all = visits || [];
  if (all.length === 0) return null;

  // Server already orders by visitedOn desc; keep stable on the client too.
  const sorted = all.slice().sort((a, b) => {
    const at = a.visitedOn || "";
    const bt = b.visitedOn || "";
    if (at !== bt) return bt.localeCompare(at);
    return b.id - a.id;
  });

  const sliced = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="recent-site-visits-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Recent site visits
        </h2>
        <Link
          href={`/project/${projectId}?tab=site-visits`}
          className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground transition-colors"
          data-testid="link-all-site-visits"
        >
          {hasMore ? "View all" : "Open log"}
        </Link>
      </div>

      <ul className="divide-y divide-border/60 border-y border-border/60">
        {sliced.map((v) => {
          const typeLabel = TYPE_LABEL[v.visitType] || v.visitType;
          return (
            <li
              key={v.id}
              className="py-3 flex items-start gap-4"
              data-testid={`recent-site-visit-${v.id}`}
            >
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0 w-20 tabular-nums">
                {v.visitedOn}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight">
                  {typeLabel}
                  {v.attendees && (
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase ml-2">
                      · with {v.attendees}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {v.summary}
                </p>
                {v.followUps && (
                  <p className="text-sm mt-1 line-clamp-2">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mr-2">
                      Follow-ups
                    </span>
                    {v.followUps}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
