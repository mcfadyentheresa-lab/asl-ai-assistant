import { format } from "date-fns";

interface ThisWeekCardProps {
  focusText?: string | null;
  focusPhotoUrl?: string | null;
  updatedAt?: string | Date | null;
  fallbackText?: string;
}

/**
 * The "This week" card — a single sentence of context plus the most
 * recent photo. This is what a client should be able to read in 5
 * seconds and know what's happening.
 */
export function ThisWeekCard({ focusText, focusPhotoUrl, updatedAt, fallbackText }: ThisWeekCardProps) {
  const body =
    focusText?.trim() ||
    fallbackText ||
    "No update this week. Check back after the next site visit.";

  const updatedLabel = updatedAt
    ? `Updated ${format(new Date(updatedAt), "EEEE, MMMM d")}`
    : null;

  return (
    <section
      className="border-b border-border/60 px-4 md:px-8 lg:px-12 py-6 md:py-8"
      data-testid="client-this-week"
    >
      <div className="flex items-baseline justify-between mb-4 md:mb-5 max-w-4xl">
        <h2 className="font-serif text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          This week
        </h2>
        {updatedLabel && (
          <p className="font-mono text-[10px] md:text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {updatedLabel}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 md:gap-6 max-w-4xl">
        <div className="rounded-sm border border-border/60 bg-card p-5 md:p-6">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mb-2">
            Current Focus
          </p>
          <p className="font-serif text-lg md:text-xl leading-snug text-foreground">
            {body}
          </p>
        </div>

        <div className="hidden md:block rounded-sm overflow-hidden border border-border/60 bg-muted aspect-[4/3]">
          {focusPhotoUrl ? (
            <img
              src={focusPhotoUrl}
              alt="This week"
              className="h-full w-full object-cover"
              style={{ filter: "saturate(0.92)" }}
              data-testid="img-this-week-photo"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-muted to-muted/40" />
          )}
        </div>
      </div>
    </section>
  );
}
