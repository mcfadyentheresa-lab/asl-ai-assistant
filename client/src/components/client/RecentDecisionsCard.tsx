import { useState } from "react";

type Decision = {
  id: number;
  title: string;
  decision: string;
  decidedOn: string;
  category: string | null;
};

interface RecentDecisionsCardProps {
  projectId: number;
  decisions: Decision[];
  limit?: number;
}

/**
 * Compact recent-decisions section for the client's "Plan" home.
 * Shows up to `limit` decisions (default 3), newest first, with a link
 * to the project's full Decisions tab. Renders nothing if the list is
 * empty so the page doesn't show a "No decisions yet" placeholder for
 * a brand-new project.
 */
export function RecentDecisionsCard({
  projectId,
  decisions,
  limit = 3,
}: RecentDecisionsCardProps) {
  const [showAll, setShowAll] = useState(false);

  if (!decisions || decisions.length === 0) return null;

  const hasMore = decisions.length > limit;
  const sliced = showAll ? decisions : decisions.slice(0, limit);

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="recent-decisions-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Recent decisions
        </h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground transition-colors"
            data-testid="button-toggle-all-decisions"
          >
            {showAll ? "Show fewer" : `Show all ${decisions.length}`}
          </button>
        )}
      </div>

      <ul className="divide-y divide-border/60 border-y border-border/60">
        {sliced.map((d) => (
          <li
            key={d.id}
            className="py-3 flex items-start gap-4"
            data-testid={`recent-decision-${d.id}`}
          >
            <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0 w-20">
              {d.decidedOn}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">
                {d.title}
                {d.category && (
                  <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase ml-2">
                    · {d.category}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {d.decision}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
