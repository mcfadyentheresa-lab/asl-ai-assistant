type ActionItem = {
  id: number;
  title: string;
  notes: string | null;
  completed: boolean | null;
  status: string | null;
  requiresClient: boolean | null;
  priority: string | null;
};

interface YourActionItemsCardProps {
  projectId: number;
  items: ActionItem[];
}

/**
 * "Your action items" card on the client's Plan home.
 *
 * Filters checklist items to those where:
 *  - requiresClient === true
 *  - not completed
 *  - status !== "done"
 *
 * Renders nothing when there are no open items, so the page stays clean
 * for clients who have nothing pending. Surfaced above ThisWeek per the
 * priority order in PR-PLAN-client-view-alignment.md.
 */
export function YourActionItemsCard({
  projectId,
  items,
}: YourActionItemsCardProps) {
  const openClientItems = (items || []).filter(
    (i) => !!i.requiresClient && !i.completed && i.status !== "done",
  );

  if (openClientItems.length === 0) return null;

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="your-action-items-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Your action items
        </h2>
      </div>

      <ul
        className="rounded-md border border-border/60 bg-card divide-y divide-border/60"
        data-testid="action-items-list"
      >
        {openClientItems.map((item) => (
          <li
            key={item.id}
            className="px-4 py-3 flex items-start gap-3"
            data-testid={`action-item-${item.id}`}
          >
            <div
              className="mt-1 h-2 w-2 rounded-full bg-foreground/70 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">
                {item.title}
              </div>
              {item.notes && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                  {item.notes}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
