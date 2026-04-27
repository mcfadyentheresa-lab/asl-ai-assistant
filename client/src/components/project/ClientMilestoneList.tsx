import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  order?: number | null;
}

interface ActivityEntry {
  id: number;
  type?: string;
  title?: string | null;
  description?: string | null;
  milestoneId?: number | null;
  createdAt?: string | Date | null;
}

interface ClientMilestoneListProps {
  milestones: Milestone[] | undefined;
  activityLog: ActivityEntry[] | undefined;
}

type Status = "complete" | "progress" | "upcoming";

function getStatus(m: Milestone, inProgressId: number | null): Status {
  if (m.completed) return "complete";
  if (inProgressId !== null && m.id === inProgressId) return "progress";
  return "upcoming";
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "MMM d");
}

function pickUpdateText(
  milestone: Milestone,
  activityLog: ActivityEntry[] | undefined,
): string | null {
  if (!activityLog) return null;
  const linked = activityLog
    .filter((e) => e.milestoneId === milestone.id && (e.description || e.title))
    .sort((a, b) => {
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bT - aT;
    });
  if (linked.length === 0) return null;
  return linked[0].description || linked[0].title || null;
}

export function ClientMilestoneList({
  milestones,
  activityLog,
}: ClientMilestoneListProps) {
  const sorted = useMemo(() => {
    if (!milestones) return [];
    return [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [milestones]);

  const inProgressId = useMemo(() => {
    const next = sorted.find((m) => !m.completed);
    return next ? next.id : null;
  }, [sorted]);

  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (expandedId === null && inProgressId !== null) {
      setExpandedId(inProgressId);
    }
  }, [inProgressId, expandedId]);

  const totalCount = sorted.length;
  const isEmpty = totalCount === 0;

  return (
    <section className="space-y-4" data-testid="client-milestone-list">
      <style>{`
        @keyframes client-milestone-pulse {
          0%, 100% { box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }
          50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / 0.18); }
        }
        @media (prefers-reduced-motion: reduce) {
          .client-milestone-pulse { animation: none !important; }
          .client-milestone-expand { transition: none !important; }
        }
        .client-milestone-pulse {
          animation: client-milestone-pulse 2.4s ease-in-out infinite;
        }
        .client-milestone-expand {
          overflow: hidden;
          transition: grid-template-rows 280ms ease, opacity 240ms ease;
          display: grid;
          grid-template-rows: 0fr;
          opacity: 0;
        }
        .client-milestone-expand[data-open="true"] {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        .client-milestone-expand > div { min-height: 0; }
      `}</style>

      <div className="flex items-end justify-between border-b border-border/60 pb-3">
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          data-testid="text-milestones-heading"
        >
          Project milestones
        </h2>
        <span
          className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
          data-testid="text-milestones-count"
        >
          {isEmpty
            ? "Planning underway"
            : `${totalCount} milestone${totalCount === 1 ? "" : "s"}`}
        </span>
      </div>

      {isEmpty ? (
        <div
          className="rounded-md border border-border/60 bg-muted/30 px-6 py-12 text-center"
          data-testid="milestone-empty-state"
        >
          <div
            className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Coming soon
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Milestones will appear here as Theresa plans the project.
          </p>
        </div>
      ) : (
      <ol className="border-t border-border/60" role="list">
        {sorted.map((m, idx) => {
          const status = getStatus(m, inProgressId);
          const isOpen = expandedId === m.id;
          const num = String(idx + 1).padStart(2, "0");
          const subtitle =
            formatDate(m.startDate) ||
            formatDate(m.date) ||
            formatDate(m.endDate) ||
            "—";
          const statusLabel =
            status === "complete"
              ? "Complete"
              : status === "progress"
                ? "In progress"
                : "Upcoming";
          const updateText = pickUpdateText(m, activityLog);

          return (
            <li
              key={m.id}
              className={cn(
                "border-b border-border/60",
                isOpen && "rounded-md bg-muted/30 ring-1 ring-border/60 my-2 border-b-0 px-5",
              )}
              data-testid={`milestone-row-${m.id}`}
              data-status={status}
              data-expanded={isOpen ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : m.id)}
                className={cn(
                  "grid w-full items-start gap-6 py-5 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm",
                )}
                style={{ gridTemplateColumns: "44px 1fr auto" }}
                aria-expanded={isOpen}
                aria-controls={`milestone-expand-${m.id}`}
                data-testid={`milestone-toggle-${m.id}`}
              >
                <span
                  className="pt-0.5 text-xs font-medium text-muted-foreground tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {num}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight text-foreground">
                    {m.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {subtitle}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap pt-1 text-[11px] uppercase",
                    status === "progress"
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.12em",
                  }}
                >
                  <span
                    className={cn(
                      "inline-block h-[7px] w-[7px] rounded-full",
                      status === "complete" && "bg-foreground/70",
                      status === "progress" &&
                        "bg-[hsl(var(--primary))] client-milestone-pulse",
                      status === "upcoming" &&
                        "border border-muted-foreground/60 bg-transparent",
                    )}
                    aria-hidden="true"
                  />
                  {statusLabel}
                </span>
              </button>

              <div
                id={`milestone-expand-${m.id}`}
                className="client-milestone-expand"
                data-open={isOpen ? "true" : "false"}
                aria-hidden={!isOpen}
              >
                <div>
                  <div
                    className="mt-1 grid gap-8 border-t border-border/60 pb-5 pt-5 md:grid-cols-[1.3fr_1fr]"
                    data-testid={`milestone-expand-content-${m.id}`}
                  >
                    <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
                      <div
                        className="flex items-center gap-2 text-[11px] uppercase text-muted-foreground"
                        style={{
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.1em",
                        }}
                      >
                        <span className="inline-block h-[6px] w-[6px] rounded-full bg-[hsl(var(--primary))]" />
                        Update
                      </div>
                      {updateText ? (
                        <p>{updateText}</p>
                      ) : (
                        <p className="text-muted-foreground">
                          Theresa will share an update here as work progresses.
                        </p>
                      )}
                      {/* TODO(milestone-list): wire milestone-linked photos (saturate(0.85) contrast(0.96), rounded, square 2x2 grid) once a milestone↔photos association is available. */}
                      <div className="pt-2 text-xs text-muted-foreground">
                        Photos for this milestone will appear here.
                      </div>
                    </div>

                    <aside className="space-y-5 border-border/60 md:border-l md:pl-6">
                      <div>
                        <h4
                          className="mb-3 text-[11px] font-medium uppercase text-muted-foreground"
                          style={{
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.12em",
                          }}
                        >
                          Decisions on file
                        </h4>
                        {/* TODO(milestone-list): list decisions/checklist items linked to this milestone once available without new queries. */}
                        <p className="text-sm text-muted-foreground">
                          No decisions linked yet.
                        </p>
                      </div>
                      <div>
                        <h4
                          className="mb-3 text-[11px] font-medium uppercase text-muted-foreground"
                          style={{
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.12em",
                          }}
                        >
                          Coming up
                        </h4>
                        {/* TODO(milestone-list): show next 1–2 calendar events linked to this milestone once available without new queries. */}
                        <p className="text-sm text-muted-foreground">
                          Nothing scheduled yet.
                        </p>
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      )}
    </section>
  );
}
