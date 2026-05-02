import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CalendarDays, CheckCircle2, Circle, PlayCircle, Calendar, History, ArrowRight, Image } from "lucide-react";
import type { Task, CalendarEvent, Project } from "@shared/schema";
import { useRecentProjects } from "@/hooks/use-recent-projects";
import { heroImageStyle } from "@/lib/hero-frame";

type TaskWithProject = Task & { projectName: string };
type EventWithProject = CalendarEvent & { projectName: string };

interface CrewDashboardViewProps {
  myTasks: TaskWithProject[] | undefined;
  upcomingEvents: EventWithProject[] | undefined;
  onToggleTaskStatus: (id: number, currentStatus: string) => void;
  isPending: boolean;
  projects: Project[] | undefined;
}

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

const statusVariant: Record<string, "secondary" | "outline" | "default"> = {
  planning: "secondary",
  in_progress: "default",
  completed: "secondary",
  archived: "outline",
};

export function CrewDashboardView({
  myTasks,
  upcomingEvents,
  onToggleTaskStatus,
  isPending,
  projects,
}: CrewDashboardViewProps) {
  const { recentProjects } = useRecentProjects();

  const recentWithData = recentProjects
    .map((r) => {
      const project = projects?.find((p) => p.id === r.id);
      if (!project) return null;
      return { project, lastBoardId: r.lastBoardId ?? null };
    })
    .filter((x): x is { project: Project; lastBoardId: number | null } => x !== null)
    .slice(0, 3);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayTasks = myTasks?.filter(
    (t) => t.status !== "done" && (t.dueDate === todayStr || (!t.dueDate && t.status === "in_progress"))
  ) || [];
  const allOpenTasks = myTasks?.filter((t) => t.status !== "done") || [];

  function groupByProject<T extends { projectName: string }>(items: T[]): Record<string, T[]> {
    return items.reduce((groups: Record<string, T[]>, item) => {
      const key = item.projectName || "Unknown Project";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }

  function _nextStatus(status: string) {
    return status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
  }

  return (
    <div className="space-y-4 mb-8" data-testid="crew-my-day">
      {recentWithData.length > 0 && (
        <div className="mb-2" data-testid="crew-jump-back-in-section">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Jump back in</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {recentWithData.map(({ project, lastBoardId }, idx) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="flex-shrink-0 w-56"
              >
                <Link
                  href={
                    lastBoardId
                      ? `/project/${project.id}?tab=planning&board=${lastBoardId}`
                      : `/project/${project.id}`
                  }
                  data-testid={`link-crew-recent-project-${project.id}`}
                >
                  <div
                    className="group flex flex-col rounded-xl border border-border/60 bg-card hover:bg-muted/30 hover:border-border transition-colors cursor-pointer overflow-hidden"
                    data-testid={`card-crew-recent-project-${project.id}`}
                  >
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        className="w-full h-24 object-cover"
                        style={heroImageStyle(project)}
                        data-testid={`img-crew-recent-thumbnail-${project.id}`}
                      />
                    ) : (
                      <div
                        className="w-full h-24 bg-muted/40 flex items-center justify-center"
                        data-testid={`placeholder-crew-recent-thumbnail-${project.id}`}
                      >
                        <Image className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-foreground leading-snug line-clamp-2" data-testid={`text-crew-recent-project-name-${project.id}`}>
                          {project.name}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <Badge
                        variant={statusVariant[project.status] ?? "secondary"}
                        className="w-fit text-[10px] px-1.5 py-0 h-5 no-default-hover-elevate"
                        data-testid={`badge-crew-recent-status-${project.id}`}
                      >
                        {statusLabel[project.status] || project.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/timesheets">
          <Button variant="default" size="sm" data-testid="button-crew-timesheets">
            <Clock className="mr-2 h-4 w-4" />
            Log Hours
          </Button>
        </Link>
        <Link href="/master-calendar">
          <Button variant="outline" size="sm" data-testid="button-crew-calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Master Calendar
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-todays-tasks">
            Your Tasks for Today
          </h2>
          {todayTasks.length > 0 ? (
            <div className="space-y-2">
              {Object.entries(groupByProject(todayTasks)).map(([projectName, projectTasks]) => (
                <div key={projectName}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{projectName}</p>
                  <div className="space-y-1">
                    {projectTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                        data-testid={`crew-task-${task.id}`}
                      >
                        <button
                          onClick={() => onToggleTaskStatus(task.id, task.status ?? "todo")}
                          disabled={isPending}
                          className="shrink-0"
                          data-testid={`button-toggle-task-${task.id}`}
                        >
                          {task.status === "done" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : task.status === "in_progress" ? (
                            <PlayCircle className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <span className={`text-sm flex-1 ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {task.title}
                        </span>
                        <Badge
                          variant={task.status === "done" ? "default" : task.status === "in_progress" ? "secondary" : "outline"}
                          className="text-xs no-default-hover-elevate no-default-active-elevate"
                        >
                          {task.status === "done" ? "Done" : task.status === "in_progress" ? "In Progress" : "To Do"}
                        </Badge>
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{task.dueDate}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center" data-testid="empty-state-tasks">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-foreground">All clear for today</p>
              <p className="text-xs text-muted-foreground mt-0.5">No tasks due — check your full assignments below or log your hours.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {allOpenTasks.length > todayTasks.length && (
        <Card>
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-all-assignments">
              Your Assignments
            </h2>
            <div className="space-y-2">
              {Object.entries(groupByProject(allOpenTasks)).map(([projectName, projectTasks]) => (
                <div key={projectName}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{projectName}</p>
                  <div className="space-y-1">
                    {projectTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                        data-testid={`crew-all-task-${task.id}`}
                      >
                        <button
                          onClick={() => onToggleTaskStatus(task.id, task.status ?? "todo")}
                          disabled={isPending}
                          className="shrink-0"
                          data-testid={`button-toggle-all-task-${task.id}`}
                        >
                          {task.status === "in_progress" ? (
                            <PlayCircle className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <span className="text-sm flex-1 text-foreground">{task.title}</span>
                        <Badge
                          variant={task.status === "in_progress" ? "secondary" : "outline"}
                          className="text-xs no-default-hover-elevate no-default-active-elevate"
                        >
                          {task.status === "in_progress" ? "In Progress" : "To Do"}
                        </Badge>
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{task.dueDate}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3" data-testid="text-upcoming-events">
            Upcoming Events (Next 7 Days)
          </h2>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-1.5">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md border border-border/40 bg-muted/20"
                  data-testid={`crew-event-${event.id}`}
                >
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.projectName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {event.date === todayStr
                      ? "Today"
                      : new Date(event.date + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming events this week.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
