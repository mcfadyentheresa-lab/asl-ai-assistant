import { Check, Flag, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  date?: string | null;
  endDate?: string | null;
  order?: number | null;
}

interface ProjectProgressSummaryProps {
  projectId: number;
  milestones: Milestone[] | undefined;
  userRole: string;
  onNavigateToTimeline?: () => void;
}

export function ProjectProgressSummary({
  projectId: _projectId,
  milestones,
  userRole: _userRole,
  onNavigateToTimeline,
}: ProjectProgressSummaryProps) {
  if (!milestones || milestones.length === 0) return null;

  const sorted = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedCount = sorted.filter((m) => m.completed).length;
  const totalCount = sorted.length;
  const completionPct = Math.round((completedCount / totalCount) * 100);
  const nextMilestone = sorted.find((m) => !m.completed);
  const lastCompleted = [...sorted].reverse().find((m) => m.completed);

  const getPhaseLabel = () => {
    if (completedCount === 0) return "Getting started";
    if (completedCount === totalCount) return "All complete";
    return `Phase ${completedCount + 1} of ${totalCount}`;
  };

  const getProgressColor = () => {
    if (completionPct >= 80) return "text-primary";
    if (completionPct >= 40) return "text-primary";
    return "text-muted-foreground";
  };

  return (
    <Card className="overflow-hidden border-border/60" data-testid="card-progress-summary">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-base font-semibold text-foreground" data-testid="text-progress-heading">
              Project Journey
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs font-semibold tabular-nums", getProgressColor())} data-testid="text-completion-pct">
              {completionPct}%
            </span>
            {onNavigateToTimeline && (
              <button
                onClick={onNavigateToTimeline}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
                data-testid="link-view-full-timeline"
              >
                View timeline <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <Progress value={completionPct} className="h-1.5 mb-4" data-testid="progress-bar-summary" />

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2.5" data-testid="progress-stat-completed">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Completed</p>
            <p className="text-sm font-semibold text-foreground">{completedCount} of {totalCount}</p>
            <p className="text-[11px] text-muted-foreground">{getPhaseLabel()}</p>
          </div>

          {lastCompleted && (
            <div className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2.5" data-testid="progress-stat-last-done">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Last Completed</p>
              <p className="text-sm font-semibold text-foreground truncate">{lastCompleted.title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Check className="h-3 w-3 text-primary" />
                <span className="text-[11px] text-primary font-medium">Done</span>
              </div>
            </div>
          )}

          {nextMilestone && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5" data-testid="progress-stat-next">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-0.5">What's Next</p>
              <p className="text-sm font-semibold text-foreground truncate">{nextMilestone.title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3 text-primary/60" />
                <span className="text-[11px] text-primary/80 font-medium">Up next</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
