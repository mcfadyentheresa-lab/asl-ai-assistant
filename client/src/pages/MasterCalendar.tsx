import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, ChevronLeft, ChevronRight, CalendarIcon, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
];

const eventTypeColors: Record<string, string> = {
  event: "#4f46e5",
  milestone: "#b45309",
  deadline: "#dc2626",
  meeting: "#d97706",
  delivery: "#0891b2",
  inspection: "#7c3aed",
  time_off: "#64748b",
};

const eventTypeLabels: Record<string, string> = {
  event: "Event",
  milestone: "Milestone",
  deadline: "Deadline",
  meeting: "Meeting",
  delivery: "Delivery",
  inspection: "Inspection",
  time_off: "Time Off",
};

type UnifiedItem = {
  id: string;
  title: string;
  projectName: string;
  projectId: number;
  startDate: string;
  endDate: string;
  color: string;
  layer: "timeline" | "event";
  kind: string;
  description?: string | null;
};

function useMasterCalendar(enabled: boolean) {
  return useQuery<{
    events: any[];
    milestones: any[];
    sections: any[];
    tasks: any[];
  }>({
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

    (data.milestones || []).forEach((ms: any, idx: number) => {
      const color = ms.colorHex || BUILDING_COLORS[idx % BUILDING_COLORS.length];
      milestoneColorMap.set(ms.id, color);
      if (ms.startDate && ms.endDate) {
        items.push({
          id: `ms-${ms.id}`,
          title: ms.title,
          projectName: ms.projectName,
          projectId: ms.projectId,
          startDate: ms.startDate,
          endDate: ms.endDate,
          color,
          layer: "timeline",
          kind: "Building",
        });
      }
    });

    (data.sections || []).forEach((s: any) => {
      if (s.startDate && s.endDate) {
        items.push({
          id: `sec-${s.id}`,
          title: s.title,
          projectName: s.projectName,
          projectId: s.projectId,
          startDate: s.startDate,
          endDate: s.endDate,
          color: milestoneColorMap.get(s.milestoneId) || BUILDING_COLORS[0],
          layer: "timeline",
          kind: "Room",
        });
      }
    });

    (data.tasks || []).forEach((t: any) => {
      if (t.startDate && t.dueDate) {
        items.push({
          id: `task-${t.id}`,
          title: t.title,
          projectName: t.projectName,
          projectId: t.projectId,
          startDate: t.startDate,
          endDate: t.dueDate,
          color: milestoneColorMap.get(t.milestoneId) || BUILDING_COLORS[0],
          layer: "timeline",
          kind: "Task",
        });
      }
    });

    (data.events || []).forEach((ev: any) => {
      if (ev.date) {
        items.push({
          id: `ev-${ev.id}`,
          title: ev.title,
          projectName: ev.projectName,
          projectId: ev.projectId,
          startDate: ev.date,
          endDate: ev.endDate || ev.date,
          color: eventTypeColors[ev.type || "event"] || eventTypeColors.event,
          layer: "event",
          kind: eventTypeLabels[ev.type || "event"] || "Event",
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
    if (item.layer === "event" && !showEvents) return false;
    return true;
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const getItemsForDate = (date: Date) => {
    return filtered.filter((item) => {
      try {
        return isWithinInterval(date, { start: parseISO(item.startDate), end: parseISO(item.endDate) });
      } catch { return false; }
    });
  };

  const selectedItems = selectedDate ? getItemsForDate(selectedDate) : [];

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-6 space-y-6">
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

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              data-testid="button-master-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-serif text-xl font-bold text-foreground min-w-[180px] text-center" data-testid="text-master-current-month">
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
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-timeline">
              <Switch checked={showTimeline} onCheckedChange={setShowTimeline} className="scale-75" />
              Timeline
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" data-testid="toggle-master-events">
              <Switch checked={showEvents} onCheckedChange={setShowEvents} className="scale-75" />
              Events
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-master-calendar" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden" data-testid="master-calendar-grid">
            {weekDays.map((day) => (
              <div key={day} className="bg-muted text-center py-2 text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-card min-h-[80px]" />
            ))}
            {daysInMonth.map((day) => {
              const dayItems = getItemsForDate(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              const dateStr = format(day, "yyyy-MM-dd");
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-card min-h-[80px] p-1.5 cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => setSelectedDate(day)}
                  data-testid={`master-day-${dateStr}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    {dayItems.length > 0 && (
                      <div className="flex gap-0.5">
                        {dayItems.slice(0, 3).map((a, i) => (
                          <span key={i} className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {dayItems.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="text-[10px] leading-tight truncate rounded px-1 py-0.5 text-white/90"
                        style={{ backgroundColor: item.color, opacity: item.layer === "timeline" ? 0.85 : 1 }}
                        data-testid={`master-item-${item.id}`}
                      >
                        {item.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data && (
          <div className="flex flex-wrap gap-3 px-1" data-testid="master-legend">
            {projectNames.map((name, idx) => (
              <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: BUILDING_COLORS[idx % BUILDING_COLORS.length] }} />
                {name}
              </div>
            ))}
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
