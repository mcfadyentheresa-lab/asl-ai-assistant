import { useState } from "react";

type Selection = {
  id: number;
  room: string | null;
  category: string | null;
  item: string;
  product: string | null;
  vendor: string | null;
  status: string;
  expectedOn: string | null;
};

interface SelectionsCardProps {
  projectId: number;
  selections: Selection[];
  limit?: number;
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  ordered: "Ordered",
  installed: "Installed",
};

// In-flight statuses — what's worth surfacing to the client right now.
// Installed items live in the full ledger but don't need to clutter the home.
const IN_FLIGHT = new Set(["proposed", "approved", "ordered"]);

const STATUS_ORDER: Record<string, number> = {
  proposed: 0,
  approved: 1,
  ordered: 2,
};

/**
 * Compact selections section for the client's "Plan" home.
 * Surfaces in-flight selections (proposed / approved / ordered) — the
 * items that are actively being worked on. Installed items still live
 * in the full Selections tab but don't show here, since the point of
 * this card is "what's coming". Renders nothing when there are no
 * in-flight selections so the page stays calm for new projects or
 * projects where everything has shipped.
 */
export function SelectionsCard({
  projectId,
  selections,
  limit = 5,
}: SelectionsCardProps) {
  const [showAll, setShowAll] = useState(false);

  const inFlight = (selections || []).filter((s) => IN_FLIGHT.has(s.status));

  if (inFlight.length === 0) return null;

  // Sort: ordered (closest to landing) first, then approved, then proposed.
  // Within a status, items with an expected date come first, soonest first.
  const sorted = inFlight.slice().sort((a, b) => {
    const sb = (STATUS_ORDER[b.status] ?? 99);
    const sa = (STATUS_ORDER[a.status] ?? 99);
    if (sa !== sb) return sb - sa;
    if (a.expectedOn && b.expectedOn) return a.expectedOn.localeCompare(b.expectedOn);
    if (a.expectedOn) return -1;
    if (b.expectedOn) return 1;
    return 0;
  });

  const hasMore = sorted.length > limit;
  const sliced = showAll ? sorted : sorted.slice(0, limit);

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="selections-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Selections in flight
        </h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground transition-colors"
            data-testid="button-toggle-all-selections"
          >
            {showAll ? "Show fewer" : `Show all ${sorted.length}`}
          </button>
        )}
      </div>

      <ul className="divide-y divide-border/60 border-y border-border/60">
        {sliced.map((s) => {
          const meta = [s.room, s.category].filter(Boolean).join(" · ");
          return (
            <li
              key={s.id}
              className="py-3 flex items-start gap-4"
              data-testid={`selection-row-${s.id}`}
            >
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0 w-20">
                {STATUS_LABEL[s.status] || s.status}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight">
                  {s.item}
                  {meta && (
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase ml-2">
                      · {meta}
                    </span>
                  )}
                </div>
                {(s.product || s.vendor) && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {s.product}
                    {s.product && s.vendor ? " · " : ""}
                    {s.vendor}
                  </p>
                )}
              </div>
              {s.expectedOn && (
                <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0">
                  {s.expectedOn}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
