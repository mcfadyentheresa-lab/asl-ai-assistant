import { Link } from "wouter";
import { useDocuments } from "@/hooks/use-projects";

interface DocumentsShelfCardProps {
  projectId: number;
  /** Maximum number of documents to surface on the Plan home (default 6). */
  limit?: number;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  drawings: "Drawings",
  finishes: "Finishes",
  permit: "Permit",
  warranty: "Warranty",
  contract: "Contract",
  invoice: "Invoice",
  plan: "Plan",
  change_order: "Change Order",
  other: "Other",
};

// Fixed display order for the documents shelf categories.
const DOC_CATEGORY_ORDER: string[] = [
  "drawings",
  "finishes",
  "permit",
  "warranty",
  "contract",
  "invoice",
  "plan",
  "change_order",
  "other",
];

/**
 * Compact documents shelf for the client's "Plan" home.
 * Shows the most recent `limit` documents grouped by category, with a link
 * to the project's full Documents tab. Renders nothing when there are no
 * documents so the page stays calm for new projects.
 */
export function DocumentsShelfCard({
  projectId,
  limit = 6,
}: DocumentsShelfCardProps) {
  const { data: documents, isLoading } = useDocuments(projectId);

  if (isLoading) return null;
  const all = documents || [];
  if (all.length === 0) return null;

  // Server returns newest first; keep stable on the client by createdAt desc.
  const sorted = all.slice().sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) return bt - at;
    return b.id - a.id;
  });

  const sliced = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;

  // Group the sliced docs by category, preserving the canonical order.
  const grouped = sliced.reduce<Record<string, typeof sliced>>((acc, doc) => {
    const key = doc.type && DOC_TYPE_LABELS[doc.type] ? doc.type : "other";
    (acc[key] = acc[key] || []).push(doc);
    return acc;
  }, {});

  const knownKeys = new Set(DOC_CATEGORY_ORDER);
  const unknownKeys = Object.keys(grouped)
    .filter((k) => !knownKeys.has(k))
    .sort();
  const orderedKeys = [...DOC_CATEGORY_ORDER, ...unknownKeys].filter(
    (k) => grouped[k]?.length,
  );

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="documents-shelf-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Documents
        </h2>
        <Link
          href={`/project/${projectId}?tab=docs`}
          className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground transition-colors"
          data-testid="link-all-documents"
        >
          {hasMore ? "View all" : "Open shelf"}
        </Link>
      </div>

      <div className="border-y border-border/60 divide-y divide-border/60">
        {orderedKeys.map((key) => {
          const docs = grouped[key];
          return (
            <div
              key={key}
              className="py-3 flex items-start gap-4"
              data-testid={`docs-shelf-section-${key}`}
            >
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0 w-24 tabular-nums">
                {DOC_TYPE_LABELS[key] || key}
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {docs.map((doc) => {
                  const downloadable = !!doc.url && doc.url !== "#";
                  const dateLabel = doc.createdAt
                    ? new Date(doc.createdAt).toLocaleDateString()
                    : null;
                  return (
                    <li
                      key={doc.id}
                      className="flex items-baseline justify-between gap-3"
                      data-testid={`docs-shelf-item-${doc.id}`}
                    >
                      {downloadable ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium tracking-tight truncate hover:underline"
                          data-testid={`link-doc-${doc.id}`}
                        >
                          {doc.title}
                        </a>
                      ) : (
                        <span className="text-sm font-medium tracking-tight truncate">
                          {doc.title}
                        </span>
                      )}
                      {dateLabel && (
                        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase shrink-0 tabular-nums">
                          {dateLabel}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
