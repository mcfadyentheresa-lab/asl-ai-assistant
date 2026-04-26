import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2, Flag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

interface Project {
  id: number;
  name: string;
  status: string;
  thumbnailUrl?: string | null;
  totalBudget?: number | null;
  budgetUsed?: number | null;
  description?: string | null;
  address?: string | null;
}

interface Milestone {
  id: number;
  title: string;
  completed: boolean | null;
  date?: string | null;
  endDate?: string | null;
  order?: number | null;
}

interface ClientDashboardViewProps {
  project: Project;
  isAdminPreview?: boolean;
}

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

function MilestoneProgressRow({ milestone, isActive }: { milestone: Milestone; isActive: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 py-1.5 ${isActive ? "opacity-100" : "opacity-60"}`}>
      <div className={`mt-0.5 shrink-0 h-4 w-4 rounded-full border-[1.5px] flex items-center justify-center ${
        milestone.completed
          ? "border-primary bg-primary"
          : isActive
            ? "border-primary/60 bg-background"
            : "border-muted-foreground/25 bg-background"
      }`}>
        {milestone.completed && <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />}
        {!milestone.completed && isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${milestone.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {milestone.title}
        </p>
        {milestone.completed && (
          <p className="text-[11px] text-muted-foreground">Completed</p>
        )}
        {!milestone.completed && isActive && (
          <p className="text-[11px] text-primary/80 font-medium">In progress</p>
        )}
      </div>
    </div>
  );
}

export function ClientDashboardView({ project, isAdminPreview = false }: ClientDashboardViewProps) {
  const { data: milestones } = useQuery<Milestone[]>({
    queryKey: [api.milestones.list.path, project.id],
    queryFn: async () => {
      const url = buildUrl(api.milestones.list.path, { projectId: project.id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!project.id,
  });

  const sortedMilestones = [...(milestones || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedCount = sortedMilestones.filter((m) => m.completed).length;
  const totalCount = sortedMilestones.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextMilestone = sortedMilestones.find((m) => !m.completed);
  const activeMilestoneIdx = nextMilestone ? sortedMilestones.indexOf(nextMilestone) : -1;

  const visibleMilestones = sortedMilestones.slice(
    Math.max(0, activeMilestoneIdx - 1),
    activeMilestoneIdx + 3
  ).slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl"
      data-testid="client-dashboard-view"
    >
      {isAdminPreview && (
        <p className="text-xs text-muted-foreground mb-3" data-testid="text-client-preview-notice">
          Client view — this is what your client sees when they log in.
        </p>
      )}

      <Link href={`/project/${project.id}`} data-testid={`link-project-${project.id}`}>
        <Card className="overflow-hidden cursor-pointer hover-elevate transition-shadow" data-testid={`card-project-hero-${project.id}`}>
          <div className="md:flex">
            <div className="relative h-52 md:h-auto md:w-72 flex-shrink-0 overflow-hidden">
              {project.thumbnailUrl ? (
                <img
                  src={project.thumbnailUrl}
                  alt={project.name}
                  className="h-full w-full object-cover"
                  data-testid={`img-project-hero-${project.id}`}
                />
              ) : (
                <div className="h-full w-full bg-muted min-h-[13rem]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/10 hidden md:block" />
            </div>

            <CardContent className="flex-1 p-6 md:p-8 flex flex-col justify-between">
              <div>
                <Badge variant="secondary" className="w-fit mb-3 text-xs" data-testid={`badge-status-${project.id}`}>
                  {statusLabel[project.status] || project.status}
                </Badge>
                <h2 className="font-serif text-xl md:text-2xl font-bold text-foreground mb-1" data-testid={`text-project-name-${project.id}`}>
                  {project.name}
                </h2>
                {project.address && (
                  <p className="text-xs text-muted-foreground mb-4">{project.address}</p>
                )}
              </div>

              {totalCount > 0 && (
                <div className="space-y-3 mb-4" data-testid="client-milestone-progress">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Flag className="h-3 w-3" />
                      Project Progress
                    </span>
                    <span className="font-medium tabular-nums">{completedCount}/{totalCount} milestones</span>
                  </div>
                  <Progress value={completionPct} className="h-1.5" data-testid="progress-bar-client" />

                  {visibleMilestones.length > 0 && (
                    <div className="pt-1 space-y-0" data-testid="client-milestone-list">
                      {visibleMilestones.map((m) => (
                        <MilestoneProgressRow
                          key={m.id}
                          milestone={m}
                          isActive={!m.completed && m.id === nextMilestone?.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {nextMilestone && (
                <div className="rounded-md bg-muted/50 border border-border/40 px-3 py-2 mb-4" data-testid="client-next-milestone">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">What's next</p>
                  <p className="text-sm font-medium text-foreground">{nextMilestone.title}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm font-medium text-primary mt-auto" data-testid="link-view-project">
                View Your Project <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
