import { useRef } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { Loader2, ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  order?: number | null;
}

interface ActivityEntry {
  id: number;
  createdAt?: string | Date | null;
}

interface ProjectLike {
  id: number;
  name: string;
  status?: string | null;
  address?: string | null;
  thumbnailUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface ClientProjectHeaderProps {
  project: ProjectLike;
  milestones: Milestone[] | undefined;
  activityLog: ActivityEntry[] | undefined;
  isAdminUser: boolean;
  isUploadingHero: boolean;
  onHeroFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveHero: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
  active: "Active",
};

function formatStatus(status?: string | null): string {
  if (!status) return "Active";
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function deriveProjectCode(id: number): string {
  return `ASL-${String(id).padStart(3, "0")}`;
}

function derivePhase(milestones: Milestone[] | undefined, status?: string | null): string {
  if (milestones && milestones.length > 0) {
    const sorted = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const next = sorted.find((m) => !m.completed);
    if (next?.title) return next.title;
  }
  return formatStatus(status) || "In progress";
}

function deriveSchedule(startDate?: string | null, endDate?: string | null): string {
  if (!startDate || !endDate) return "—";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const totalDays = differenceInCalendarDays(end, start);
  if (totalDays <= 0) return "—";
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const elapsedDays = differenceInCalendarDays(new Date(), start);
  const elapsedWeeks = Math.max(1, Math.ceil(elapsedDays / 7));
  const currentWeek = Math.min(elapsedWeeks, totalWeeks);
  return `Week ${currentWeek} of ${totalWeeks}`;
}

function deriveLastVisit(activityLog: ActivityEntry[] | undefined): string {
  if (!activityLog || activityLog.length === 0) return "—";
  const withDates = activityLog
    .filter((a) => a.createdAt)
    .map((a) => new Date(a.createdAt as string | Date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  if (withDates.length === 0) return "—";
  return format(withDates[0], "MMM d");
}

export function ClientProjectHeader({
  project,
  milestones,
  activityLog,
  isAdminUser,
  isUploadingHero,
  onHeroFileChosen,
  onRemoveHero,
}: ClientProjectHeaderProps) {
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const projectCode = deriveProjectCode(project.id);
  const statusLabel = formatStatus(project.status);
  const phase = derivePhase(milestones, project.status);
  const schedule = deriveSchedule(project.startDate, project.endDate);
  const lastVisit = deriveLastVisit(activityLog);
  // TODO: Next walkthrough requires querying calendar events for type "meeting"/"walkthrough".
  // Calendar events are not currently fetched in ProjectDetails. Wire up in a follow-up PR.
  const nextWalkthrough = "—";

  const isRealValue = (v: string | null | undefined): v is string =>
    typeof v === "string" && v.trim() !== "" && v.trim() !== "—";

  const dlItems: Array<{
    key: string;
    label: string;
    value: string;
    testId: string;
  }> = [
    { key: "phase", label: "Phase", value: phase, testId: "text-phase" },
    { key: "schedule", label: "Schedule", value: schedule, testId: "text-schedule" },
    { key: "lastVisit", label: "Last visit", value: lastVisit, testId: "text-last-visit" },
    {
      key: "nextWalkthrough",
      label: "Next walkthrough",
      value: nextWalkthrough,
      testId: "text-next-walkthrough",
    },
  ].filter((item) => isRealValue(item.value));

  const dlGridCols =
    dlItems.length >= 4
      ? "grid-cols-2 md:grid-cols-4"
      : dlItems.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : dlItems.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  const creditText = project.address
    ? `${project.name} · ${project.address}`
    : project.name;

  const handlePickHeroFile = () => {
    heroFileInputRef.current?.click();
  };

  return (
    <>
      {/* Property photo band */}
      {(project.thumbnailUrl || isAdminUser) && (
        <div
          className="w-full bg-muted/30 border-b border-border/60 relative group overflow-hidden"
          style={{ height: "clamp(220px, 30vh, 300px)" }}
          data-testid="project-hero-image"
        >
          {project.thumbnailUrl ? (
            <>
              <img
                src={project.thumbnailUrl}
                alt={project.name}
                className="w-full h-full object-cover block"
                style={{ filter: "saturate(0.85) contrast(0.96)" }}
                data-testid="img-project-hero"
              />
              <div
                className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to top, rgba(20,18,15,0.55), rgba(20,18,15,0))",
                }}
              />
              <div
                className="absolute left-4 bottom-3 px-2.5 py-1 rounded-sm text-[10px] tracking-[0.1em] uppercase text-white/90 bg-[rgba(20,18,15,0.45)] backdrop-blur-sm"
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid="text-property-credit"
              >
                {creditText}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePickHeroFile}
              disabled={isUploadingHero}
              className="w-full h-full flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
              data-testid="btn-upload-hero-empty"
            >
              {isUploadingHero ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              <span className="text-xs">
                {isUploadingHero ? "Uploading…" : "Add main project image"}
              </span>
            </button>
          )}

          {isAdminUser && project.thumbnailUrl && (
            <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePickHeroFile}
                disabled={isUploadingHero}
                className="h-7 px-2 text-[11px]"
                data-testid="btn-replace-hero"
              >
                {isUploadingHero ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                Replace
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onRemoveHero}
                className="h-7 px-2 text-[11px]"
                data-testid="btn-remove-hero"
              >
                <X className="h-3 w-3 mr-1" />
                Remove
              </Button>
            </div>
          )}

          {isAdminUser && (
            <input
              ref={heroFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={onHeroFileChosen}
              className="hidden"
              data-testid="input-hero-file"
            />
          )}
        </div>
      )}

      {/* Project header meta + 4-col dl */}
      <div
        className="w-full border-b border-border/60 bg-background/90"
        data-testid="project-header"
      >
        <div className="container px-5 md:px-8 py-6 md:py-8">
          {/* Mono-label meta bar */}
          <div
            className="flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
            data-testid="text-project-meta"
          >
            <span className="inline-block w-6 h-px bg-muted-foreground/60" aria-hidden="true" />
            <span>Project</span>
            <span aria-hidden="true">·</span>
            <span data-testid="text-project-code">{projectCode}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="text-project-status">{statusLabel}</span>
          </div>

          {/* Project title */}
          <h1
            className="mt-4 mb-2 font-semibold text-3xl md:text-4xl tracking-tight text-foreground"
            data-testid="text-project-title"
          >
            {project.name}
          </h1>

          {/* dl row — only items with real values */}
          {dlItems.length > 0 && (
            <dl
              className={`grid ${dlGridCols} gap-4 md:gap-6 mt-6 pt-5 border-t border-border/60`}
              data-testid="project-header-row"
            >
              {dlItems.map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                  <dt
                    className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground/80"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {item.label}
                  </dt>
                  <dd
                    className="text-base font-semibold text-foreground tabular-nums"
                    data-testid={item.testId}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </>
  );
}
