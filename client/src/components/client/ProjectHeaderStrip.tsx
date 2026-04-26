import { format } from "date-fns";

interface ProjectHeaderStripProps {
  code?: string | null;
  status: string;
  name: string;
  phase?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lastVisit?: string | null;
  nextWalkthrough?: string | null;
}

const statusLabel: Record<string, string> = {
  planning: "PLANNING",
  in_progress: "ACTIVE",
  completed: "COMPLETE",
  archived: "ARCHIVED",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d");
  } catch {
    return "—";
  }
}

function weekOf(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  try {
    const s = new Date(start);
    const e = new Date(end);
    const now = new Date();
    const totalWeeks = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 7)));
    const currentWeek = Math.max(
      1,
      Math.min(totalWeeks, Math.round((now.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1)
    );
    return `Week ${currentWeek} of ${totalWeeks}`;
  } catch {
    return "—";
  }
}

/**
 * The project header strip shown directly below the photo band.
 *  - small chip line: "PROJECT · CODE · STATUS"
 *  - large project title
 *  - 4-column metadata row (phase / schedule / last visit / next walkthrough)
 */
export function ProjectHeaderStrip(props: ProjectHeaderStripProps) {
  const chipParts = [
    "PROJECT",
    props.code || `#${props.name.slice(0, 3).toUpperCase()}`,
    statusLabel[props.status] || props.status.toUpperCase(),
  ];

  return (
    <div
      className="border-b border-border/60 px-4 md:px-8 lg:px-12 py-6 md:py-8"
      data-testid="client-project-header"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="block w-6 h-px bg-foreground/40" aria-hidden />
        <p
          className="font-mono text-[10px] md:text-[11px] tracking-[0.18em] text-muted-foreground"
          data-testid="text-project-chip"
        >
          {chipParts.join(" · ")}
        </p>
      </div>

      <h1
        className="font-serif text-3xl md:text-[44px] lg:text-[52px] font-semibold leading-[1.05] tracking-tight text-foreground max-w-3xl"
        data-testid="text-project-title"
      >
        {props.name}
      </h1>

      <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl">
        <MetaCell label="Phase" value={props.phase || "—"} />
        <MetaCell label="Schedule" value={weekOf(props.startDate, props.endDate)} />
        <MetaCell label="Last Visit" value={fmtDate(props.lastVisit)} />
        <MetaCell label="Next Walkthrough" value={fmtDate(props.nextWalkthrough)} />
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div data-testid={`meta-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mb-1">
        {label}
      </p>
      <p className="text-sm md:text-[15px] font-medium text-foreground">{value}</p>
    </div>
  );
}
