import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  Loader2, Plus, ChevronLeft, ChevronRight, CalendarIcon, CalendarDays, Trash2, Bell,
  ImageIcon, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useCalendarEvents, useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent,
  useUploadCalendarEventImage, useMilestones, useSections, useTasks, useUsers, useNotifyTeam,
} from "@/hooks/use-projects";
import { queryClient } from "@/lib/queryClient";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths,
  isSameDay, parseISO, isWithinInterval,
} from "date-fns";
import type { CalendarEvent, Milestone, Section, Task } from "@shared/schema";

export const eventTypeColors: Record<string, string> = {
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

export const eventTypeLabelsCalendar: Record<string, string> = {
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

const CALENDAR_BUILDING_COLORS = [
  "#173B2F", "#2E6B4F", "#3F8A66", "#B87333", "#4D7A68",
  "#5A7D4C", "#8C6239", "#6B8E23", "#7A6A58", "#3E6F73",
  "#8B3F2F", "#4E6B8A", "#C49A6C", "#5B4B8A", "#7C9A5A",
];

type TimelineItem = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  layer: "timeline";
  kind: "milestone" | "room" | "task";
};

interface CalendarPanelProps {
  projectId: number;
  compact?: boolean;
  readOnly?: boolean;
}

export default function CalendarPanel({ projectId, compact = false, readOnly = false }: CalendarPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: events, isLoading } = useCalendarEvents(projectId);
  const { data: milestonesData } = useMilestones(projectId);
  const { data: sectionsData } = useSections(projectId);
  const { data: tasksData } = useTasks(projectId);
  const { data: allUsers } = useUsers();
  const { mutate: createEvent, isPending: isCreating } = useCreateCalendarEvent();
  const { mutate: updateEvent } = useUpdateCalendarEvent();
  const { mutate: deleteEvent } = useDeleteCalendarEvent();
  const { mutate: uploadEventImage } = useUploadCalendarEventImage();
  const { mutate: notifyTeam, isPending: sendingNotification } = useNotifyTeam();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", description: "", type: "event" });
  const [timeOffCrewId, setTimeOffCrewId] = useState<string>("");
  const typedUsers = (allUsers || []) as { id: string; firstName: string | null; lastName: string | null; role: string | null }[];
  const crewMembers = typedUsers.filter((u) => u.role === "crew" || u.role === "admin");
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventImagePreview, setEventImagePreview] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [draggedEventId, setDraggedEventId] = useState<number | null>(null);
  const [moveEvent, setMoveEvent] = useState<{ id: number; title: string } | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const canEdit = !readOnly && (user?.role === "admin" || user?.role === "crew");
  // Note: canEdit preserves the original CalendarTab behavior where only admin/crew could edit
  const canNotify = user?.role === "admin" || user?.role === "crew";
  const eventImageInputRef = useRef<HTMLInputElement>(null);

  const [showTimeline, setShowTimeline] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showTeam, setShowTeam] = useState(true);
  const [showPersonal, setShowPersonal] = useState(true);

  const milestonesList = (milestonesData || []) as Milestone[];
  const sectionsList = (sectionsData || []) as Section[];
  const tasksList = (tasksData || []) as Task[];

  const timelineItems: TimelineItem[] = (() => {
    const items: TimelineItem[] = [];

    milestonesList.forEach((ms, idx) => {
      if (ms.startDate && ms.endDate) {
        items.push({
          id: `ms-${ms.id}`,
          title: ms.title,
          startDate: ms.startDate,
          endDate: ms.endDate,
          color: ms.colorHex || CALENDAR_BUILDING_COLORS[idx % CALENDAR_BUILDING_COLORS.length],
          layer: "timeline",
          kind: "milestone",
        });
      }
    });

    sectionsList.forEach((s) => {
      if (s.startDate && s.endDate) {
        const parent = milestonesList.find((m) => m.id === s.milestoneId);
        const parentIdx = parent ? milestonesList.indexOf(parent) : 0;
        items.push({
          id: `sec-${s.id}`,
          title: s.title,
          startDate: s.startDate,
          endDate: s.endDate,
          color: parent?.colorHex || CALENDAR_BUILDING_COLORS[parentIdx % CALENDAR_BUILDING_COLORS.length],
          layer: "timeline",
          kind: "room",
        });
      }
    });

    tasksList.forEach((t) => {
      if (t.startDate && t.dueDate) {
        const parent = milestonesList.find((m) => m.id === t.milestoneId);
        const parentIdx = parent ? milestonesList.indexOf(parent) : 0;
        items.push({
          id: `task-${t.id}`,
          title: t.title,
          startDate: t.startDate,
          endDate: t.dueDate,
          color: parent?.colorHex || CALENDAR_BUILDING_COLORS[parentIdx % CALENDAR_BUILDING_COLORS.length],
          layer: "timeline",
          kind: "task",
        });
      }
    });

    return items;
  })();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const isEventVisible = (ev: CalendarEvent) => {
    const evType = ev.type || "event";
    if (TEAM_EVENT_TYPES.has(evType)) return showTeam;
    if (PERSONAL_EVENT_TYPES.has(evType)) return showPersonal;
    return showEvents;
  };

  const calendarEvents = (events || []) as CalendarEvent[];

  const getEventsForDate = (date: Date) => {
    return calendarEvents.filter((e) => {
      if (!isEventVisible(e)) return false;
      const start = parseISO(e.date);
      const end = e.endDate ? parseISO(e.endDate) : start;
      return isWithinInterval(date, { start, end });
    });
  };

  const getTimelineForDate = (date: Date) => {
    if (!showTimeline) return [];
    return timelineItems.filter((item) => {
      const start = parseISO(item.startDate);
      const end = parseISO(item.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
      return isWithinInterval(date, { start, end });
    });
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];
  const selectedDateTimeline = selectedDate ? getTimelineForDate(selectedDate) : [];

  const kindLabel = (k: string) => k === "milestone" ? "Building" : k === "room" ? "Room" : "Task";

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEventImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setEventImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearEventImage = () => {
    setEventImageFile(null);
    setEventImagePreview(null);
    if (eventImageInputRef.current) eventImageInputRef.current.value = "";
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    let title = eventForm.title.trim();
    if (eventForm.type === "time_off" && timeOffCrewId) {
      const member = crewMembers.find((u) => u.id === timeOffCrewId);
      if (member) {
        title = title || `${member.firstName} ${member.lastName} — Time Off`;
      }
    }
    if (!title || !selectedDate) return;
    createEvent(
      {
        projectId,
        title,
        description: eventForm.description.trim() || null,
        date: format(selectedDate, "yyyy-MM-dd"),
        type: eventForm.type,
      },
      {
        onSuccess: (created: CalendarEvent) => {
          if (eventImageFile && created?.id) {
            uploadEventImage(
              { eventId: created.id, file: eventImageFile, projectId },
              {
                onSuccess: () => {
                  toast({ title: "Added", description: "Event added with image." });
                },
                onError: () => {
                  toast({ title: "Added", description: "Event added, but image upload failed." });
                },
              }
            );
          } else {
            toast({ title: "Added", description: "Event added to calendar." });
          }
          setAddDialogOpen(false);
          setEventForm({ title: "", description: "", type: "event" });
          setTimeOffCrewId("");
          clearEventImage();
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDeleteEvent = (id: number) => {
    deleteEvent(id, {
      onSuccess: () => {
        toast({ title: "Removed", description: "Event deleted." });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'activity'] });
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const weekDayLabels = compact ? ["S", "M", "T", "W", "T", "F", "S"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      <div className={`flex items-center justify-between gap-2 flex-wrap ${compact ? "gap-1" : "gap-4"}`}>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className={compact ? "h-7 w-7" : ""}
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            data-testid="button-prev-month"
          >
            <ChevronLeft className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>
          <h3 className={`font-serif font-bold text-foreground text-center ${compact ? "text-sm min-w-[140px]" : "text-xl min-w-[180px]"}`} data-testid="text-current-month">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <Button
            size="icon"
            variant="ghost"
            className={compact ? "h-7 w-7" : ""}
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            data-testid="button-next-month"
          >
            <ChevronRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 flex-wrap ${compact ? "gap-1.5" : ""}`}>
            <label className={`flex items-center gap-1 text-muted-foreground cursor-pointer ${compact ? "text-[10px]" : "text-xs"}`} data-testid="toggle-timeline">
              <Switch checked={showTimeline} onCheckedChange={setShowTimeline} className="scale-75" />
              Timeline
            </label>
            <label className={`flex items-center gap-1 text-muted-foreground cursor-pointer ${compact ? "text-[10px]" : "text-xs"}`} data-testid="toggle-events">
              <Switch checked={showEvents} onCheckedChange={setShowEvents} className="scale-75" />
              Events
            </label>
            {canEdit && (
              <>
                <label className={`flex items-center gap-1 text-muted-foreground cursor-pointer ${compact ? "text-[10px]" : "text-xs"}`} data-testid="toggle-team">
                  <Switch checked={showTeam} onCheckedChange={setShowTeam} className="scale-75" />
                  Team
                </label>
                <label className={`flex items-center gap-1 text-muted-foreground cursor-pointer ${compact ? "text-[10px]" : "text-xs"}`} data-testid="toggle-personal">
                  <Switch checked={showPersonal} onCheckedChange={setShowPersonal} className="scale-75" />
                  Personal
                </label>
              </>
            )}
          </div>
          {canEdit && (
            <Button
              size={compact ? "sm" : "default"}
              onClick={() => {
                setSelectedDate(selectedDate || new Date());
                setAddDialogOpen(true);
              }}
              data-testid="button-add-event"
            >
              <Plus className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} mr-1.5`} />
              Add Event
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-calendar" />
        </div>
      ) : (() => {
        const allDays: (Date | null)[] = [];
        for (let i = 0; i < startDayOfWeek; i++) allDays.push(null);
        daysInMonth.forEach((d) => allDays.push(d));
        while (allDays.length % 7 !== 0) allDays.push(null);
        const weeks: (Date | null)[][] = [];
        for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

        const getSpanBars = (weekDays: (Date | null)[]) => {
          const bars: { id: string; title: string; color: string; startCol: number; span: number; layer: "timeline" | "event" }[] = [];
          const seen = new Set<string>();

          const firstDay = weekDays.find((d) => d !== null);
          const lastDay = [...weekDays].reverse().find((d) => d !== null);
          if (!firstDay || !lastDay) return bars;

          const allSpanItems = [
            ...timelineItems.map((t) => ({ id: t.id, title: t.title, color: t.color, start: parseISO(t.startDate), end: parseISO(t.endDate), layer: "timeline" as const })),
            ...calendarEvents.filter(isEventVisible).filter((e) => e.endDate && e.endDate !== e.date).map((e) => ({
              id: `ev-${e.id}`,
              title: e.title,
              color: eventTypeColors[e.type || "event"] || eventTypeColors.event,
              start: parseISO(e.date),
              end: parseISO(e.endDate!),
              layer: "event" as const,
            })),
          ];

          for (const item of allSpanItems) {
            if (isNaN(item.start.getTime()) || isNaN(item.end.getTime())) continue;
            if (item.layer === "timeline" && !showTimeline) continue;

            let startCol = -1;
            let endCol = -1;
            for (let c = 0; c < 7; c++) {
              const d = weekDays[c];
              if (!d) continue;
              if (isWithinInterval(d, { start: item.start, end: item.end })) {
                if (startCol === -1) startCol = c;
                endCol = c;
              }
            }
            if (startCol === -1) continue;
            const barKey = `${item.id}-w${format(firstDay, "MMdd")}`;
            if (seen.has(barKey)) continue;
            seen.add(barKey);
            bars.push({ id: item.id, title: item.title, color: item.color, startCol, span: endCol - startCol + 1, layer: item.layer });
          }
          return bars;
        };

        return (
          <div className="rounded-md overflow-hidden border border-border" data-testid="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-border">
              {weekDayLabels.map((day, i) => (
                <div key={`${day}-${i}`} className={`bg-muted text-center text-xs font-medium text-muted-foreground ${compact ? "py-1" : "py-2"}`}>
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
                      if (!day) return <div key={`empty-${wi}-${di}`} className={`bg-card ${compact ? "min-h-[36px]" : "min-h-[48px]"}`} />;
                      const dayEvents = getEventsForDate(day);
                      const singleDayEvents = dayEvents.filter((e) => !e.endDate || e.endDate === e.date);
                      const dayTimeline = getTimelineForDate(day);
                      const singleDayTimeline = dayTimeline.filter((t) => t.startDate === t.endDate);
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isToday = isSameDay(day, new Date());
                      const dateStr = format(day, "yyyy-MM-dd");
                      const dayHasItems = dayTimeline.length > 0 || dayEvents.length > 0;
                      return (
                        <div
                          key={day.toISOString()}
                          className={`bg-card ${compact ? "min-h-[36px]" : "min-h-[48px]"} p-1 cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "ring-2 ring-primary ring-inset" : ""} ${canEdit && draggedEventId ? "ring-1 ring-inset ring-transparent hover:ring-primary/40" : ""}`}
                          onClick={() => setSelectedDate(day)}
                          onDragOver={canEdit ? (e) => { e.preventDefault(); e.currentTarget.classList.add("ring-primary/40"); } : undefined}
                          onDragLeave={canEdit ? (e) => { e.currentTarget.classList.remove("ring-primary/40"); } : undefined}
                          onDrop={canEdit ? (e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove("ring-primary/40");
                            const evId = parseInt(e.dataTransfer.getData("text/plain"), 10);
                            if (!evId) return;
                            updateEvent(
                              { id: evId, date: dateStr },
                              {
                                onSuccess: () => {
                                  toast({ title: "Moved", description: `Event moved to ${format(day, "MMM d")}.` });
                                  setSelectedDate(day);
                                },
                                onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                              }
                            );
                            setDraggedEventId(null);
                          } : undefined}
                          data-testid={`calendar-day-${dateStr}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-medium inline-flex items-center justify-center rounded-full ${compact ? "text-[10px] w-5 h-5" : "text-xs w-6 h-6"} ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                              {format(day, "d")}
                            </span>
                            {dayHasItems && <span className={`rounded-full bg-primary/50 ${compact ? "h-1 w-1" : "h-1.5 w-1.5"}`} />}
                          </div>
                          {singleDayTimeline.slice(0, compact ? 1 : 2).map((tl) => (
                            <div
                              key={tl.id}
                              className={`leading-tight truncate rounded px-1 py-0.5 mt-0.5 text-white/90 ${compact ? "text-[8px]" : "text-[10px]"}`}
                              style={{ backgroundColor: tl.color, opacity: 0.85 }}
                              data-testid={`calendar-timeline-${tl.id}`}
                            >
                              {tl.title}
                            </div>
                          ))}
                          {singleDayEvents.slice(0, Math.max(1, (compact ? 1 : 2) - singleDayTimeline.length)).map((ev) => (
                            <div
                              key={ev.id}
                              draggable={canEdit}
                              onDragStart={canEdit ? (e) => {
                                e.dataTransfer.setData("text/plain", String(ev.id));
                                e.dataTransfer.effectAllowed = "move";
                                setDraggedEventId(ev.id);
                              } : undefined}
                              onDragEnd={canEdit ? () => setDraggedEventId(null) : undefined}
                              className={`leading-tight truncate rounded px-1 py-0.5 mt-0.5 text-white ${compact ? "text-[8px]" : "text-[10px]"} ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                              style={{ backgroundColor: eventTypeColors[ev.type || "event"] || eventTypeColors.event }}
                              data-testid={`calendar-event-dot-${ev.id}`}
                            >
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {spanBars.length > 0 && (
                    <div className="bg-card border-t border-border/30">
                      {spanBars.slice(0, compact ? 2 : 4).map((bar) => (
                        <div key={bar.id} className="grid grid-cols-7 gap-px" data-testid={`calendar-bar-${bar.id}`}>
                          {bar.startCol > 0 && <div style={{ gridColumn: `span ${bar.startCol}` }} />}
                          <div
                            className={`leading-tight truncate rounded-sm px-1.5 py-0.5 text-white/90 my-px mx-0.5 ${compact ? "text-[8px]" : "text-[10px]"}`}
                            style={{ gridColumn: `span ${bar.span}`, backgroundColor: bar.color, opacity: bar.layer === "timeline" ? 0.85 : 1 }}
                          >
                            {bar.title}
                          </div>
                        </div>
                      ))}
                      {spanBars.length > (compact ? 2 : 4) && (
                        <p className={`text-muted-foreground px-2 pb-0.5 ${compact ? "text-[8px]" : "text-[10px]"}`}>+{spanBars.length - (compact ? 2 : 4)} more</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {showTimeline && timelineItems.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1" data-testid="timeline-legend">
          {milestonesList.map((ms, idx) => (
            <div key={ms.id} className={`flex items-center gap-1.5 text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: ms.colorHex || CALENDAR_BUILDING_COLORS[idx % CALENDAR_BUILDING_COLORS.length] }} />
              {ms.title}
            </div>
          ))}
        </div>
      )}

      <Dialog open={selectedDate !== null} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col" data-testid="selected-date-panel">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2" data-testid="text-selected-date">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
            </DialogTitle>
            <DialogDescription>
              {(selectedDateEvents.length + selectedDateTimeline.length) > 0
                ? <span className="inline-flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">{selectedDateEvents.length + selectedDateTimeline.length}</span>{`item${(selectedDateEvents.length + selectedDateTimeline.length) > 1 ? "s" : ""} on this date`}</span>
                : "No items on this date"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pb-4">
              {selectedDateTimeline.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Timeline</p>
                  {selectedDateTimeline.map((tl) => (
                    <div key={tl.id} className="rounded-md bg-muted p-3 flex items-center gap-3" data-testid={`detail-timeline-${tl.id}`}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tl.color }} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground">{tl.title}</p>
                        <p className="text-xs text-muted-foreground">{kindLabel(tl.kind)} &middot; {format(parseISO(tl.startDate), "MMM d")} — {format(parseISO(tl.endDate), "MMM d")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedDateEvents.length > 0 && (
                <div className="space-y-2">
                  {selectedDateTimeline.length > 0 && <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Events</p>}
                  {selectedDateEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-md bg-muted overflow-hidden"
                    data-testid={`calendar-event-${ev.id}`}
                  >
                    {ev.imageUrl && (
                      <div
                        className="relative w-full cursor-pointer"
                        onClick={() => setExpandedImage(ev.imageUrl)}
                        data-testid={`event-image-${ev.id}`}
                      >
                        <img
                          src={ev.imageUrl}
                          alt={ev.title}
                          className="w-full max-h-48 object-contain bg-black/5"
                        />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3 p-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                          style={{ backgroundColor: eventTypeColors[ev.type || "event"] || eventTypeColors.event }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground" data-testid={`text-event-title-${ev.id}`}>
                            {ev.title}
                          </p>
                          {ev.description && (
                            <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-event-desc-${ev.id}`}>
                              {ev.description}
                            </p>
                          )}
                          <Badge variant="outline" className="mt-1 text-[10px] no-default-hover-elevate" data-testid={`badge-event-type-${ev.id}`}>
                            {eventTypeLabelsCalendar[ev.type || "event"] || ev.type || "Event"}
                          </Badge>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          {canNotify && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={sendingNotification}
                                  onClick={() => {
                                    const eventDate = ev.date ? format(parseISO(ev.date), "MMM d") : "";
                                    const msg = `Reminder: ${ev.title}${eventDate ? ` on ${eventDate}` : ""}${ev.description ? ` — ${ev.description}` : ""}`;
                                    notifyTeam(
                                      { projectId, message: msg.slice(0, 300) },
                                      {
                                        onSuccess: (data: { message: string }) => toast({ title: "Team notified", description: data.message }),
                                        onError: (err: Error) => toast({ title: "Failed to notify", description: err.message, variant: "destructive" }),
                                      }
                                    );
                                  }}
                                  data-testid={`button-notify-event-${ev.id}`}
                                >
                                  {sendingNotification ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Notify team about this event</TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setMoveEvent({ id: ev.id, title: ev.title });
                              setMoveDate("");
                            }}
                            data-testid={`button-move-event-${ev.id}`}
                          >
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteEvent(ev.id)}
                            data-testid={`button-delete-event-${ev.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                </div>
              )}
              {selectedDateEvents.length === 0 && selectedDateTimeline.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-events">
                  No items on this date.
                </p>
              )}
            </div>
          </ScrollArea>
          {canEdit && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setAddDialogOpen(true)}
              data-testid="button-add-event-for-date"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Event for {selectedDate && format(selectedDate, "MMM d")}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {canEdit && (
        <>
          <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { clearEventImage(); setTimeOffCrewId(""); } }}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle className="font-serif text-xl" data-testid="text-add-event-title">
                  Add Event
                </DialogTitle>
                <DialogDescription>
                  {selectedDate ? `Add an event for ${format(selectedDate, "MMMM d, yyyy")}` : "Select a date and add an event."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddEvent} className="space-y-4 pt-2" data-testid="form-add-event">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title</label>
                  <Input
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    placeholder="Event title..."
                    data-testid="input-event-title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Description</label>
                  <Textarea
                    value={eventForm.description}
                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                    placeholder="Optional description..."
                    className="resize-none"
                    rows={2}
                    data-testid="textarea-event-description"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Type</label>
                  <Select value={eventForm.type} onValueChange={(v) => {
                    setEventForm({ ...eventForm, type: v });
                    if (v !== "time_off") setTimeOffCrewId("");
                  }}>
                    <SelectTrigger data-testid="select-event-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="milestone">Milestone</SelectItem>
                      <SelectItem value="deadline">Deadline</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                      {user?.role === "admin" && <SelectItem value="time_off">Time Off</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                {eventForm.type === "time_off" && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Crew Member</label>
                    <Select value={timeOffCrewId} onValueChange={(v) => {
                      setTimeOffCrewId(v);
                      const member = crewMembers.find((u) => u.id === v);
                      if (member && !eventForm.title.trim()) {
                        setEventForm({ ...eventForm, title: `${member.firstName} ${member.lastName} — Time Off` });
                      }
                    }}>
                      <SelectTrigger data-testid="select-time-off-crew">
                        <SelectValue placeholder="Select crew member..." />
                      </SelectTrigger>
                      <SelectContent>
                        {crewMembers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.firstName} {u.lastName} ({u.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">For planning around scheduled holidays and time away</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Date</label>
                  <Input
                    type="date"
                    value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => setSelectedDate(e.target.value ? parseISO(e.target.value) : null)}
                    data-testid="input-event-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Image (optional)</label>
                  <input
                    ref={eventImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    data-testid="input-event-image-file"
                  />
                  {eventImagePreview ? (
                    <div className="relative rounded-md overflow-hidden">
                      <img src={eventImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-md" />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute top-1 right-1 bg-black/50 text-white"
                        onClick={clearEventImage}
                        data-testid="button-remove-event-image"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => eventImageInputRef.current?.click()}
                      data-testid="button-attach-event-image"
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Attach Image
                    </Button>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); clearEventImage(); }} data-testid="button-cancel-event">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating || (!eventForm.title.trim() && !(eventForm.type === "time_off" && timeOffCrewId)) || !selectedDate} data-testid="button-save-event">
                    {isCreating ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Add Event
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={moveEvent !== null} onOpenChange={(open) => { if (!open) setMoveEvent(null); }}>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle className="font-serif text-xl" data-testid="text-move-event-title">
                  Move Event
                </DialogTitle>
                <DialogDescription>
                  Pick a new date for "{moveEvent?.title}".
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">New Date</label>
                  <Input
                    type="date"
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                    data-testid="input-move-date"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setMoveEvent(null)} data-testid="button-cancel-move">
                    Cancel
                  </Button>
                  <Button
                    disabled={!moveDate}
                    onClick={() => {
                      if (!moveEvent || !moveDate) return;
                      const newDate = parseISO(moveDate);
                      updateEvent(
                        { id: moveEvent.id, date: moveDate },
                        {
                          onSuccess: () => {
                            toast({ title: "Moved", description: `"${moveEvent.title}" moved to ${format(newDate, "MMMM d, yyyy")}.` });
                            setCurrentMonth(newDate);
                            setSelectedDate(newDate);
                            setMoveEvent(null);
                          },
                          onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                        }
                      );
                    }}
                    data-testid="button-confirm-move"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Move Event
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={expandedImage !== null} onOpenChange={(open) => { if (!open) setExpandedImage(null); }}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Event Image</DialogTitle>
            <DialogDescription>Full size event image</DialogDescription>
          </DialogHeader>
          {expandedImage && (
            <img src={expandedImage} alt="Event" className="w-full max-h-[80vh] object-contain" data-testid="img-expanded-event" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
