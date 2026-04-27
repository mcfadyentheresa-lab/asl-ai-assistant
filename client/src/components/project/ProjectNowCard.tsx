import { ImageIcon } from "lucide-react";

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  order?: number | null;
}

interface ActivityEntry {
  id: number;
  type?: string;
  title?: string | null;
  description?: string | null;
  userId?: string | null;
  createdAt?: string | Date | null;
}

interface User {
  id: string;
  role?: string | null;
}

interface ProjectLike {
  id: number;
  name: string;
  thumbnailUrl?: string | null;
}

interface ProjectNowCardProps {
  project: ProjectLike;
  milestones: Milestone[] | undefined;
  activityLog: ActivityEntry[] | undefined;
  users: User[] | undefined;
}

const FALLBACK_BODY =
  "Theresa will share an update here as work progresses.";

const MAX_BODY_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cutAt = lastSpace > max * 0.6 ? lastSpace : max;
  return `${slice.slice(0, cutAt).trimEnd()}…`;
}

function getInProgressMilestone(
  milestones: Milestone[] | undefined,
): Milestone | undefined {
  if (!milestones || milestones.length === 0) return undefined;
  const sorted = [...milestones].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  return sorted.find((m) => !m.completed);
}

function getNextMilestoneAfter(
  milestones: Milestone[] | undefined,
  current: Milestone | undefined,
): Milestone | undefined {
  if (!milestones || milestones.length === 0 || !current) return undefined;
  const sorted = [...milestones].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const idx = sorted.findIndex((m) => m.id === current.id);
  if (idx === -1) return undefined;
  for (let i = idx + 1; i < sorted.length; i++) {
    if (!sorted[i].completed) return sorted[i];
  }
  return undefined;
}

function getMostRecentAdminEntry(
  activityLog: ActivityEntry[] | undefined,
  users: User[] | undefined,
): ActivityEntry | undefined {
  if (!activityLog || activityLog.length === 0) return undefined;
  const adminCrewIds = new Set(
    (users ?? [])
      .filter((u) => u.role === "admin" || u.role === "crew")
      .map((u) => u.id),
  );
  const candidates = activityLog
    .filter((e) => !e.userId || adminCrewIds.has(e.userId))
    .filter((e) => e.createdAt)
    .sort((a, b) => {
      const da = new Date(a.createdAt as string | Date).getTime();
      const db = new Date(b.createdAt as string | Date).getTime();
      return db - da;
    });
  return candidates[0];
}

function deriveOnSiteThisWeek(
  activityLog: ActivityEntry[] | undefined,
  users: User[] | undefined,
): string {
  if (!activityLog || activityLog.length === 0) {
    // TODO(now-card): Replace with calendar-event query for "on site" days once
    // calendar events are fetched at the ProjectDetails level.
    return "—";
  }
  const adminCrewIds = new Set(
    (users ?? [])
      .filter((u) => u.role === "admin" || u.role === "crew")
      .map((u) => u.id),
  );
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diffToMonday = (day + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const count = activityLog.filter((e) => {
    if (!e.createdAt) return false;
    if (e.userId && !adminCrewIds.has(e.userId)) return false;
    const d = new Date(e.createdAt as string | Date);
    if (Number.isNaN(d.getTime())) return false;
    return d >= startOfWeek;
  }).length;

  if (count === 0) {
    // TODO(now-card): No crew activity this week — wire to calendar events for
    // a richer "Crew on site Tue–Thu"-style derived value.
    return "—";
  }
  return `${count} update${count === 1 ? "" : "s"} this week`;
}

export function ProjectNowCard({
  project,
  milestones,
  activityLog,
  users,
}: ProjectNowCardProps) {
  const inProgress = getInProgressMilestone(milestones);
  const recentAdminEntry = getMostRecentAdminEntry(activityLog, users);

  const title =
    inProgress?.title ||
    recentAdminEntry?.title ||
    "This week";

  const rawBody =
    recentAdminEntry?.description ||
    FALLBACK_BODY;
  const body = truncate(rawBody, MAX_BODY_CHARS);

  const onSiteThisWeek = deriveOnSiteThisWeek(activityLog, users);

  const next = getNextMilestoneAfter(milestones, inProgress);
  const comingUp = next?.title || "—";

  // TODO(now-card): "Awaiting from you" should reflect open client-action
  // checklist items / decisions awaiting the client. Checklist items aren't
  // currently fetched at the ProjectDetails level, so falling back to "—".
  const awaitingFromYou = "—";

  // TODO(now-card): Most recent project photo isn't queried at the parent;
  // fall back to thumbnailUrl, then placeholder. Wire usePhotos in a future PR.
  const photoUrl = project.thumbnailUrl ?? null;

  const isEmptyState =
    !inProgress &&
    !recentAdminEntry?.description &&
    onSiteThisWeek === "—" &&
    comingUp === "—" &&
    awaitingFromYou === "—";

  if (isEmptyState) {
    return (
      <section
        aria-labelledby="now-heading"
        className="container px-5 md:px-8 pt-8 md:pt-10"
        data-testid="section-now-card"
      >
        <article
          className="overflow-hidden rounded-lg border border-border/60 bg-card"
          data-testid="now-card"
          data-empty-state="true"
        >
          <div className="bg-muted/40 h-40 w-full" data-testid="now-photo">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`${project.name} progress`}
                className="w-full h-full object-cover block"
                style={{ filter: "saturate(0.85) contrast(0.96)" }}
                data-testid="img-now-photo"
              />
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
                data-testid="now-photo-empty"
              >
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                <span
                  className="text-[11px] tracking-[0.14em] uppercase"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Photo coming soon
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 p-6 md:p-8 lg:p-10">
            <div
              className="text-[11px] tracking-[0.14em] uppercase"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--primary)",
              }}
              data-testid="text-now-label"
            >
              Current focus
            </div>
            <h2
              id="now-heading"
              className="font-semibold text-xl md:text-2xl leading-tight tracking-tight max-w-[24ch] text-foreground"
              data-testid="text-now-title"
            >
              {title}
            </h2>
            <p
              className="text-base text-muted-foreground max-w-[56ch] leading-relaxed"
              data-testid="text-now-body"
            >
              {body}
            </p>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="now-heading"
      className="container px-5 md:px-8 pt-8 md:pt-10"
      data-testid="section-now-card"
    >
      <article
        className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] overflow-hidden rounded-lg border border-border/60 bg-card"
        data-testid="now-card"
      >
        {/* Left: copy */}
        <div className="flex flex-col justify-center gap-4 p-6 md:p-8 lg:p-10 order-2 md:order-1">
          <div
            className="text-[11px] tracking-[0.14em] uppercase"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--primary)",
            }}
            data-testid="text-now-label"
          >
            Current focus
          </div>
          <h2
            id="now-heading"
            className="font-semibold text-xl md:text-2xl leading-tight tracking-tight max-w-[24ch] text-foreground"
            data-testid="text-now-title"
          >
            {title}
          </h2>
          <p
            className="text-base text-muted-foreground max-w-[56ch] leading-relaxed"
            data-testid="text-now-body"
          >
            {body}
          </p>
          <dl
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mt-2 pt-5 border-t border-border/60"
            data-testid="now-row"
          >
            <div className="flex flex-col gap-1">
              <dt
                className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground/80"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                On site this week
              </dt>
              <dd
                className="text-sm font-medium text-foreground tabular-nums"
                data-testid="text-on-site-this-week"
              >
                {onSiteThisWeek}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt
                className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground/80"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Coming up
              </dt>
              <dd
                className="text-sm font-medium text-foreground"
                data-testid="text-coming-up"
              >
                {comingUp}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt
                className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground/80"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Awaiting from you
              </dt>
              <dd
                className="text-sm font-medium text-foreground tabular-nums"
                data-testid="text-awaiting-from-you"
              >
                {awaitingFromYou}
              </dd>
            </div>
          </dl>
        </div>

        {/* Right: photo */}
        <div
          className="bg-muted/40 min-h-[200px] md:min-h-[280px] order-1 md:order-2"
          data-testid="now-photo"
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${project.name} progress`}
              className="w-full h-full object-cover block"
              style={{ filter: "saturate(0.85) contrast(0.96)" }}
              data-testid="img-now-photo"
            />
          ) : (
            <div
              className="w-full h-full min-h-[200px] md:min-h-[280px] flex flex-col items-center justify-center gap-2 text-muted-foreground"
              data-testid="now-photo-empty"
            >
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
              <span
                className="text-[11px] tracking-[0.14em] uppercase"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Photo coming soon
              </span>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
