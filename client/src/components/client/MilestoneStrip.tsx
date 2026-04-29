import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Check } from "lucide-react";

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  date?: string | null;
  endDate?: string | null;
  order?: number | null;
}

interface MilestoneStripProps {
  milestones: Milestone[];
}

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  try {
    return format(new Date(d), "MMM d");
  } catch {
    return null;
  }
}

/**
 * A 2-column grid of milestone cards. The first incomplete milestone is
 * rendered in an "active" state; completed ones are dimmed; future ones
 * are quiet. The mockup version expanded the active card with detail —
 * we keep that pattern but the detail comes from milestone.title alone
 * for now (no schema additions in this PR).
 */
export function MilestoneStrip({ milestones }: MilestoneStripProps) {
  const sorted = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const activeIdx = sorted.findIndex((m) => !m.completed);

  if (sorted.length === 0) return null;

  return (
    <section
      className="border-b border-border/60 px-4 md:px-8 lg:px-12 py-6 md:py-8"
      data-testid="client-milestones"
    >
      <div className="flex items-baseline justify-between mb-4 md:mb-5 max-w-4xl">
        <h2 className="font-serif text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          Schedule
        </h2>
        <p className="font-mono text-[10px] md:text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {sorted.filter((m) => m.completed).length} of {sorted.length} complete
        </p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-4xl">
        {sorted.map((m, idx) => {
          const isActive = idx === activeIdx;
          const isComplete = !!m.completed;
          const dateLabel = fmtDate(m.endDate || m.date);
          return (
            <li
              key={m.id}
              className={cn(
                "rounded-sm border p-4 md:p-5 transition-colors",
                isActive && "border-foreground/70 bg-card",
                isComplete && "border-border/40 bg-card/40 opacity-60",
                !isActive && !isComplete && "border-border/60 bg-card"
              )}
              data-testid={`milestone-card-${m.id}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.14em] uppercase",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {isComplete && (
                  <Check className="h-3 w-3 text-muted-foreground" aria-label="Complete" />
                )}
                {isActive && (
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground">
                    · In Progress
                  </span>
                )}
                {dateLabel && !isActive && (
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground ml-auto">
                    {dateLabel}
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-[15px] md:text-base leading-snug",
                  isActive ? "font-semibold text-foreground" : "font-medium text-foreground/85",
                  isComplete && "line-through decoration-muted-foreground/40"
                )}
              >
                {m.title}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
