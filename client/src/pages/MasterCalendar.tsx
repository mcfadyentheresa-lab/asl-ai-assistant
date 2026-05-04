import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, CalendarIcon, ArrowLeft, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Milestone, Section, Task, CalendarEvent } from "@shared/schema";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  parseISO,
  isWithinInterval,
} from "date-fns";

const BUILDING_COLORS = [
  "#173B2F", "#2E6B4F", "#3F8A66", "#B87333", "#4D7A68",
  "#5A7D4C", "#8C6239", "#6B8E23", "#7A6A58", "#3E6F73",
  "#8B3F2F", "#4E6B8A", "#C49A6C", "#5B4B8A", "#7C9A5A",
];

const eventTypeColors: Record<string, string> = {
  event: "#4f46e5",
  milestone: "#b45309",
  deadline: "#dc2626",
  meeting: "#d97706",
  delivery: "#0891b2",
  inspection: "#7c3aed",
  time_off: "#64748b",
  team: "#0d9488",
  personal: "#8b5cf6",
};

const eventTypeLabels: Record<string, string> = {
  event: "Event",
  milestone: "Milestone",
  deadline: "Deadline",
  meeting: "Meeting",
  delivery: "Delivery",
  inspection: "Inspection",
  time_off: "Time Off",
  team: "Team",
  personal: "Personal",
};

const TEAM_EVENT_TYPES = new Set(["team"]);
const PERSONAL_EVENT_TYPES = new Set(["personal"]);

type MilestoneWithProject = Milestone & { projectName: string; projectColor: string | null };
type SectionWithProject = Section & { projectName: string; projectColor: string | null };
type TaskWithProject = Task & { projectName: string; projectColor: string | null };
type EventWithProject = CalendarEvent & { projectName: string; projectColor: string | null };

interface MasterCalendarData {
  events: EventWithProject[];
  milestones: MilestoneWithProject[];
  sections: SectionWithProject[];
  tasks: TaskWithProject[];
}

type UnifiedItem = {
  id: string;
  title: string;
  projectName: string;
  projectId: number;
  projectColor: string | null;
  startDate: string;
  endDate: string;
  color: string;
  layer: "timeline" | "event";
  kind: string;
  eventType?: string;
  description?: string | null;
};

function useMasterCalendar(enabled: boolean) {
  return useQuery<MasterCalendarData>({
    queryKey: ["/api/calendar/all"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/all", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch master calendar");
      return res.json();
    },
    enabled,
  });
}

export default function MasterCalendar() {
  const { user } = useAuth();
  const canAccess = user?.role === "admin" || user?.role === "crew";
  const { data, isLoading } = useMasterCalendar(!!canAccess);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showTeam, setShowTeam] = useState(true);
  const [showPersonal, setShowPersonal] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  if (!user || !canAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Access restricted to admin and crew.</p>
        </div>
      </div>
    );
  }

  const allItems: UnifiedItem[] = (() => {
    if (!data) return [];
    const items: UnifiedItem[] = [];
    const milestoneColorMap = new Map<number, string>();

    data.milestones.forEach((ms, idx) => {
      const color = ms.colorHex || BUILDING_COLORS[idx % BUILDING_COLORS.length];
      milestoneColorMap.set(ms.id, color);
      if (ms.startDate && ms.endDate) {
        items.push({
          id: `ms-${ms.id}`,
          title: ms.title,
          projectName: ms.projectName,
          projectId: ms.projectId,
          projectColor: ms.projectColor,
          startDate: ms.startDate,
          endDate: ms.endDate,
          color,
          layer: "timeline",
          kind: "Building",
        });
      }
    });

    data.sections.forEach((s) => {
      if (s.startDate && s.endDate) {
        items.push({
          id: `sec-${s.id}`,
          title: s.title,
          projectName: s.projectName,
          projectId: s.projectId,
          projectColor: s.projectColor,
          startDate: s.startDate,
          endDate: s.endDate,
          color: milestoneColorMap.get(s.milestoneId) || BUILDING_COLORS[0],
          layer: "timeline",
          kind: "Room",
        });
      }
    });

    data.tasks.forEach((t) => {
      // Show tasks whenever they have a due date — don't require startDate
      // (quick-add doesn't set it, so tasks were being silently hidden).
      if (t.dueDate) {
        items.push({
          id: `task-${t.id}`,
          title: t.title,
          projectName: t.projectName,
          projectId: t.projectId,
          projectColor: t.projectColor,
          startDate: t.startDate || t.dueDate,
          endDate: t.dueDate,
          color: milestoneColorMap.get(t.milestoneId ?? 0) || BUILDING_COLORS[0],
          layer: "timeline",
          kind: "Task",
        });
      }
    });

    data.events.forEach((ev) => {
      if (ev.date) {
        items.push({
          id: `ev-${ev.id}`,
          title: ev.title,
          projectName: ev.projectName,
          projectId: ev.projectId,
          projectColor: ev.projectColor,
          startDate: ev.date,
          endDate: ev.endDate || ev.date,
          color: eventTypeColors[ev.type || "event"] || eventTypeColors.event,
          layer: "event",
          kind: eventTypeLabels[ev.type || "event"] || "Event",
          eventType: ev.type || "event",
          description: ev.description,
        });
      }
    });

    return items;
  })();

  const projectNames = [...new Set(allItems.map(i => i.projectName))].sort();

  const filtered = allItems.filter((item) => {
    if (projectFilter !== "all" && item.projectName !== projectFilter) return false;
    if (item.layer === "timeline" && !showTimeline) return false;
    if (item.layer === "event") {
      const evType = item.eventType || "event";
      if (TEAM_EVENT_TYPES.has(evType) && !showTeam) return false;
      if (PERSONAL_EVENT_TYPES.has(evType) && !showPersonal) return false;
      if (!TEAM_EVENT_TYPES.has(evType) && !PERSONAL_EVENT_TYPES.has(evType) && !showEvents) return false;
    }
    return true;
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const getItemsForDate = (date: Date) => {
    return filtered.filter((item) => {
      const start = parseISO(item.startDate);
      const end = parseISO(item.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
      return isWithinInterval(date, { start, end });
    });
  };

  const selectedItems = selectedDate ? getItemsForDate(selectedDate) : [];

  const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-master-calendar">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-serif text-2xl font-bold text-foreground uppercase tracking-wide" data-testid="text-master-calendar-title">
            Master Calendar
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              data-testid="button-master-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-serif text-xl font-bold text-foreground min-w-[160px] text-center" data-testid="text-master-current-month">
              {format(currentMonth, "MMMM yyyy")}
            </h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              data-testid="button-master-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {/* P2-1 — quick jump back to current month after navigating away. */}
            <Button
              size="sm"
              variant="outline"
              className="ml-1 h-8"
              onClick={() => {
                const now = new Date();
                setCurrentMonth(now);
                setSelectedDate(now);
              }}
              data-testid="button-master-today"
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              Today
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-[190px]" data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-timeline">
                <Switch checked={showTimeline} onCheckedChange={setShowTimeline} className="scale-75" />
                Timeline
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-events">
                <Switch checked={showEvents} onCheckedChange={setShowEvents} className="scale-75" />
                Events
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-team">
                <Switch checked={showTeam} onCheckedChange={setShowTeam} className="scale-75" />
                Team
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-personal">
                <Switch checked={showPersonal} onCheckedChange={setShowPersonal} className="scale-75" />
                Personal
              </label>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-master-calendar" />
          </div>
        ) : (() => {
          const allDays: (Date | null)[] = [];
          for (let i = 0; i < startDayOfWeek; i++) allDays.push(null);
          daysInMonth.forEach((d) => allDays.push(d));
          while (allDays.length % 7 !== 0) allDays.push(null);
          const weeks: (Date | null)[][] = [];
          for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

          const getSpanBars = (weekCells: (Date | null)[]) => {
            const bars: { id: string; title: string; projectName: string; color: string; startCol: number; span: number; layer: "timeline" | "event" }[] = [];
            const seen = new Set<string>();
            const firstDay = weekCells.find((d) => d !== null);
            if (!firstDay) return bars;

            for (const item of filtered) {
              const start = parseISO(item.startDate);
              const end = parseISO(item.endDate);
              if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
              if (item.startDate === item.endDate) continue;

              let startCol = -1;
              let endCol = -1;
              for (let c = 0; c < 7; c++) {
                const d = weekCells[c];
                if (!d) continue;
                if (isWithinInterval(d, { start, end })) {
                  if (startCol === -1) startCol = c;
                  endCol = c;
                }
              }
              if (startCol === -1) continue;
              const barKey = `${item.id}-w${format(firstDay, "MMdd")}`;
              if (seen.has(barKey)) continue;
              seen.add(barKey);
              bars.push({ id: item.id, title: item.title, projectName: item.projectName, color: item.color, startCol, span: endCol - startCol + 1, layer: item.layer });
            }
            return bars;
          };

          return (
            <div className="rounded-md overflow-hidden border border-border" data-testid="master-calendar-grid">
              <div className="grid grid-cols-7 gap-px bg-border">
                {weekDayLabels.map((day) => (
                  <div key={day} className="bg-muted text-center py-2 text-xs font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              {weeks.map((week, wi) => {
                const spanBars = getSpanBars(week);
                return (
                  <div key={wi}>
                    <div className="grid grid-cols-7 gap-px bg-border">
                      {week.map((day, di) => {
                        if (!day) return <div key={`empty-${wi}-${di}`} className="bg-card min-h-[48px]" />;
                        const dayItems = getItemsForDate(day);
                        const singleDayTimeline = dayItems.filter((it) => it.layer === "timeline" && it.startDate === it.endDate);
                        const singleDayEvents = dayItems.filter((it) => it.layer === "event" && it.startDate === it.endDate);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isToday = isSameDay(day, new Date());
                        const dateStr = format(day, "yyyy-MM-dd");
                        const dayHasItems = dayItems.length > 0;
                        return (
                          <div
                            key={day.toISOString()}
                            className={`bg-card min-h-[48px] p-1 cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                            onClick={() => setSelectedDate(day)}
                            data-testid={`master-day-${dateStr}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                                {format(day, "d")}
                              </span>
                              {dayHasItems && <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />}
                            </div>
                            {singleDayTimeline.slice(0, 2).map((item) => (
                              <div
                                key={item.id}
                                className="text-[10px] leading-tight truncate rounded px-1 py-0.5 mt-0.5 text-white/90"
                                style={{ backgroundColor: item.color, opacity: 0.85 }}
                                title={`${item.projectName}: ${item.title}`}
                                data-testid={`master-item-${item.id}`}
                              >
                                {item.title}
                              </div>
                            ))}
                            {singleDayEvents.slice(0, Math.max(1, 2 - singleDayTimeline.length)).map((item) => (
                              <div
                                key={item.id}
                                className="text-[10px] leading-tight truncate rounded px-1 py-0.5 mt-0.5 text-white/90"
                                style={{ backgroundColor: item.color }}
                                title={`${item.projectName}: ${item.title}`}
                                data-testid={`master-item-${item.id}`}
                              >
                                {item.title}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    {spanBars.length > 0 && (
                      <div className="bg-card border-t border-border/30">
                        {spanBars.slice(0, 4).map((bar) => (
                          <div key={bar.id} className="grid grid-cols-7 gap-px" data-testid={`master-bar-${bar.id}`}>
                            {bar.startCol > 0 && <div style={{ gridColumn: `span ${bar.startCol}` }} />}
                            <div
                              className="text-[10px] leading-tight truncate rounded-sm px-1.5 py-0.5 text-white/90 my-px mx-0.5"
                              style={{ gridColumn: `span ${bar.span}`, backgroundColor: bar.color, opacity: bar.layer === "timeline" ? 0.85 : 1 }}
                              title={`${bar.projectName}: ${bar.title}`}
                            >
                              <span className="font-semibold">{bar.projectName}:</span> {bar.title}
                            </div>
                          </div>
                        ))}
                        {spanBars.length > 4 && (() => {
                          // P2-2 — "+N more" used to be a non-interactive <p>. Make it a
                          // real button that opens the day-detail dialog for the first day
                          // of this week so users can actually see the hidden items.
                          const firstDayOfWeek = week.find((d): d is Date => d !== null);
                          if (!firstDayOfWeek) return null;
                          return (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground hover:underline px-2 pb-0.5 text-left w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDate(firstDayOfWeek);
                              }}
                              data-testid={`master-week-more-${format(firstDayOfWeek, "yyyy-MM-dd")}`}
                              aria-label={`Show ${spanBars.length - 4} more items for the week of ${format(firstDayOfWeek, "MMMM d")}`}
                            >
                              +{spanBars.length - 4} more
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {data && (
          <div className="flex flex-wrap gap-3 px-1" data-testid="master-legend">
            {projectNames.map((name) => {
              const projectItem = allItems.find(i => i.projectName === name);
              const legendColor = projectItem?.projectColor || BUILDING_COLORS[0];
              return (
                <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: legendColor }} />
                  {name}
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={selectedDate !== null} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
          <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col" data-testid="master-date-panel">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl flex items-center gap-2" data-testid="text-master-selected-date">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
              </DialogTitle>
              <DialogDescription>
                {selectedItems.length > 0
                  ? <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">{selectedItems.length}</span>{`item${selectedItems.length > 1 ? "s" : ""} on this date`}</span>
                  : "No items on this date"}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2 pb-4">
                {selectedItems.length > 0 ? (
                  selectedItems.map((item) => (
                    <div key={item.id} className="rounded-md bg-muted p-3" data-testid={`master-detail-${item.id}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground">{item.title}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{item.kind}</Badge>
                            <Link href={`/project/${item.projectId}`}>
                              <Badge variant="secondary" className="text-[10px] cursor-pointer hover:bg-secondary/80">{item.projectName}</Badge>
                            </Link>
                            {item.layer === "timeline" && (
                              <span className="text-[10px] text-muted-foreground">
                                {format(parseISO(item.startDate), "MMM d")} — {format(parseISO(item.endDate), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No items on this date.</p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
