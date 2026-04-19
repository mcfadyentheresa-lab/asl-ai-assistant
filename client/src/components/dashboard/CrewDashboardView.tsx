import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CalendarDays, CheckCircle2, Circle, PlayCircle, Calendar } from "lucide-react";
import type { Task, CalendarEvent } from "@shared/schema";

type TaskWithProject = Task & { projectName: string };
type EventWithProject = CalendarEvent & { projectName: string };

interface CrewDashboardViewProps {
  myTasks: TaskWithProject[] | undefined;
  upcomingEvents: EventWithProject[] | undefined;
  onToggleTaskStatus: (id: number, currentStatus: string) => void;
  isPending: boolean;
}

export function CrewDashboardView({
  myTasks,
  upcomingEvents,
  onToggleTaskStatus,
  isPending,
}: CrewDashboardViewProps) {
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

  function nextStatus(status: string) {
    return status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
  }

  return (
    <div className="space-y-4 mb-8" data-testid="crew-my-day">
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
                          onClick={() => onToggleTaskStatus(task.id, task.status)}
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
                          onClick={() => onToggleTaskStatus(task.id, task.status)}
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
