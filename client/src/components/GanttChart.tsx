import { useMemo, useState } from "react";
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval, isBefore, isAfter } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Milestone {
  id: number;
  title: string;
  date: string | null;
  completed: boolean;
  order: number;
}

interface Task {
  id: number;
  title: string;
  status: string | null;
  dueDate: string | null;
  milestoneId: number | null;
}

interface GanttChartProps {
  milestones: Milestone[];
  tasks: Task[];
}

const PHASE_COLORS = [
  "bg-[#1E3A2F]",
  "bg-[#2D5A47]",
  "bg-[#3D7A5F]",
  "bg-[#8B7355]",
  "bg-[#6B8E73]",
  "bg-[#4A6741]",
  "bg-[#7A6B5D]",
  "bg-[#556B2F]",
  "bg-[#8B8378]",
  "bg-[#5F7161]",
];

const PHASE_COLORS_LIGHT = [
  "bg-[#1E3A2F]/15",
  "bg-[#2D5A47]/15",
  "bg-[#3D7A5F]/15",
  "bg-[#8B7355]/15",
  "bg-[#6B8E73]/15",
  "bg-[#4A6741]/15",
  "bg-[#7A6B5D]/15",
  "bg-[#556B2F]/15",
  "bg-[#8B8378]/15",
  "bg-[#5F7161]/15",
];

export default function GanttChart({ milestones, tasks }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1);

  const phases = useMemo(() => {
    const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));

    return sorted.map((ms, idx) => {
      const msTasks = tasks.filter((t) => t.milestoneId === ms.id);
      const allDates: Date[] = [];

      if (ms.date) allDates.push(parseISO(ms.date));
      msTasks.forEach((t) => {
        if (t.dueDate) allDates.push(parseISO(t.dueDate));
      });

      const startDate = ms.date ? parseISO(ms.date) : allDates.length > 0 ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : null;

      let endDate: Date | null = null;
      if (allDates.length > 0) {
        endDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
      }
      if (startDate && (!endDate || endDate.getTime() <= startDate.getTime())) {
        endDate = addDays(startDate, 14);
      }

      const totalTasks = msTasks.length;
      const doneTasks = msTasks.filter((t) => t.status === "done").length;
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : ms.completed ? 100 : 0;

      return {
        id: ms.id,
        title: ms.title,
        startDate,
        endDate,
        completed: ms.completed,
        progress,
        totalTasks,
        doneTasks,
        colorIndex: idx % PHASE_COLORS.length,
      };
    });
  }, [milestones, tasks]);

  const phasesWithDates = phases.filter((p) => p.startDate && p.endDate);

  const { timelineStart, timelineEnd, months, dayWidth } = useMemo(() => {
    if (phasesWithDates.length === 0) {
      const now = new Date();
      const s = startOfMonth(now);
      const e = endOfMonth(addDays(now, 90));
      return {
        timelineStart: s,
        timelineEnd: e,
        months: eachMonthOfInterval({ start: s, end: e }),
        dayWidth: 4 * zoomLevel,
      };
    }

    const allStarts = phasesWithDates.map((p) => p.startDate!.getTime());
    const allEnds = phasesWithDates.map((p) => p.endDate!.getTime());
    const earliest = new Date(Math.min(...allStarts));
    const latest = new Date(Math.max(...allEnds));

    const s = startOfMonth(addDays(earliest, -14));
    const e = endOfMonth(addDays(latest, 30));

    return {
      timelineStart: s,
      timelineEnd: e,
      months: eachMonthOfInterval({ start: s, end: e }),
      dayWidth: 4 * zoomLevel,
    };
  }, [phasesWithDates, zoomLevel]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const totalWidth = totalDays * dayWidth;

  const getBarPosition = (start: Date, end: Date) => {
    const left = differenceInDays(start, timelineStart) * dayWidth;
    const width = Math.max(differenceInDays(end, start) * dayWidth, 20);
    return { left, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart) * dayWidth;

  if (milestones.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground" data-testid="text-gantt-empty">
          Project setup in progress. Add milestones with dates to see the project timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="gantt-chart">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-lg font-semibold tracking-tight uppercase" data-testid="text-gantt-heading">
            Project Timeline
          </h3>
          <Badge variant="outline" className="text-xs" data-testid="badge-phase-count">
            {phases.length} {phases.length === 1 ? "phase" : "phases"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            disabled={zoomLevel <= 0.5}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
            disabled={zoomLevel >= 3}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="border border-border/50 rounded-sm overflow-hidden">
        <div className="flex">
          <div className="w-48 min-w-[192px] shrink-0 border-r border-border/50 bg-muted/30">
            <div className="h-10 border-b border-border/50 flex items-center px-3">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Phase</span>
            </div>
            {phases.map((phase) => (
              <div
                key={phase.id}
                className="h-12 border-b border-border/30 flex items-center px-3 gap-2"
                data-testid={`gantt-phase-label-${phase.id}`}
              >
                <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${PHASE_COLORS[phase.colorIndex]}`} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm truncate cursor-default">
                      {phase.title}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="font-medium">{phase.title}</p>
                    {phase.startDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(phase.startDate, "MMM d")} — {phase.endDate ? format(phase.endDate, "MMM d, yyyy") : "TBD"}
                      </p>
                    )}
                    {phase.totalTasks > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {phase.doneTasks}/{phase.totalTasks} tasks complete ({phase.progress}%)
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>

          <ScrollArea className="flex-1" orientation="horizontal">
            <div style={{ width: totalWidth, minWidth: "100%" }}>
              <div className="h-10 border-b border-border/50 flex relative bg-muted/20">
                {months.map((month) => {
                  const offset = differenceInDays(month, timelineStart) * dayWidth;
                  const monthDays = differenceInDays(endOfMonth(month), month) + 1;
                  const monthWidth = monthDays * dayWidth;
                  return (
                    <div
                      key={month.toISOString()}
                      className="absolute top-0 h-full border-l border-border/30 flex items-center px-2"
                      style={{ left: offset, width: monthWidth }}
                    >
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {format(month, "MMM yyyy")}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="relative">
                {todayOffset >= 0 && todayOffset <= totalWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10"
                    style={{ left: todayOffset }}
                    data-testid="gantt-today-line"
                  >
                    <div className="absolute -top-0 -translate-x-1/2 bg-red-500 text-white text-[9px] px-1 py-0.5 rounded-b-sm leading-none">
                      Today
                    </div>
                  </div>
                )}

                {phases.map((phase) => (
                  <div key={phase.id} className="h-12 border-b border-border/30 relative" data-testid={`gantt-phase-row-${phase.id}`}>
                    {months.map((month) => {
                      const offset = differenceInDays(month, timelineStart) * dayWidth;
                      return (
                        <div
                          key={month.toISOString()}
                          className="absolute top-0 h-full border-l border-border/10"
                          style={{ left: offset }}
                        />
                      );
                    })}

                    {phase.startDate && phase.endDate && (() => {
                      const { left, width } = getBarPosition(phase.startDate, phase.endDate);
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-2 h-8 rounded-sm cursor-default overflow-hidden ${PHASE_COLORS_LIGHT[phase.colorIndex]} border border-border/20`}
                              style={{ left, width }}
                              data-testid={`gantt-bar-${phase.id}`}
                            >
                              <div
                                className={`h-full ${PHASE_COLORS[phase.colorIndex]} transition-all duration-300`}
                                style={{ width: `${phase.progress}%` }}
                              />
                              {width > 60 && (
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-foreground/80 truncate">
                                  {phase.progress}%
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{phase.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(phase.startDate, "MMM d")} — {format(phase.endDate, "MMM d, yyyy")}
                            </p>
                            <p className="text-xs">{phase.progress}% complete</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground pt-1">
        {phases.map((phase) => (
          <div key={phase.id} className="flex items-center gap-1.5" data-testid={`gantt-legend-${phase.id}`}>
            <div className={`w-2.5 h-2.5 rounded-sm ${PHASE_COLORS[phase.colorIndex]}`} />
            <span>{phase.title}</span>
            {phase.completed && <span className="text-green-600">✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
