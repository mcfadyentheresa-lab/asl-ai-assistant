import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ZoomIn, ZoomOut, Plus, Trash2, Pencil, FolderPlus, Check, X, MoreVertical, CheckSquare, Square } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateSection, useUpdateSection, useDeleteSection, useCreateMilestone, useCreateTask, useUpdateTask } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import type { InsertMilestone } from "@shared/schema";
import { ListPlus } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";

interface Milestone {
  id: number;
  title: string;
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  completed: boolean;
  order: number;
}

interface SectionData {
  id: number;
  milestoneId: number;
  projectId: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  completed: boolean;
  order: number;
}

interface Task {
  id: number;
  title: string;
  status: string | null;
  dueDate: string | null;
  milestoneId: number | null;
  sectionId: number | null;
}

interface GanttChartProps {
  projectId: number;
  milestones: Milestone[];
  sections: SectionData[];
  tasks: Task[];
  userRole: string;
}

const PHASE_COLORS = [
  "#1E3A2F", "#2D5A47", "#3D7A5F", "#8B7355", "#6B8E73",
  "#4A6741", "#7A6B5D", "#556B2F", "#8B8378", "#5F7161",
];

type DrillLevel = "phases" | "sections" | "tasks";

interface PhaseInfo {
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  totalTasks: number;
  doneTasks: number;
  completed: boolean;
  colorIndex: number;
}

interface SectionInfo {
  id: number;
  milestoneId: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  totalTasks: number;
  doneTasks: number;
  completed: boolean;
  colorIndex: number;
}

interface TaskInfo {
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
  colorIndex: number;
}

function DatePopover({ value, onChange, placeholder, testId }: { value: string; onChange: (value: string) => void; placeholder: string; testId: string }) {
  const selectedDate = value ? parseISO(value) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 justify-start text-left font-normal" data-testid={testId}>
          {value ? format(selectedDate!, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function DateField({ label, value, onChange, placeholder, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1">
      <DatePopover value={value} onChange={onChange} placeholder={placeholder} testId={testId} />
      {value ? <span className="text-[10px] text-muted-foreground" data-testid={`status-${testId}`}>{label} selected</span> : <span className="text-[10px] text-muted-foreground">&nbsp;</span>}
    </div>
  );
}

export default function GanttChart({ projectId, milestones, sections, tasks, userRole }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("phases");
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [newPhaseStart, setNewPhaseStart] = useState("");
  const [newPhaseEnd, setNewPhaseEnd] = useState("");
  const [addingSectionFor, setAddingSectionFor] = useState<number | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionStart, setNewSectionStart] = useState("");
  const [newSectionEnd, setNewSectionEnd] = useState("");
  const [editingSection, setEditingSection] = useState<SectionData | null>(null);
  const [editSectionForm, setEditSectionForm] = useState({ title: "", startDate: "", endDate: "" });
  const [addingTask, setAddingTask] = useState<{ milestoneId: number; sectionId: number | null } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const { toast } = useToast();
  const { mutate: createMilestone, isPending: creatingMilestone } = useCreateMilestone();
  const { mutate: createSection, isPending: creatingSection } = useCreateSection();
  const { mutate: updateSection, isPending: updatingSection } = useUpdateSection();
  const { mutate: deleteSection } = useDeleteSection();
  const { mutate: createTask, isPending: creatingTask } = useCreateTask();
  const { mutate: updateTask } = useUpdateTask();

  const isAdmin = userRole !== "client";

  useEffect(() => {
    if (selectedPhaseId && !milestones.some(m => m.id === selectedPhaseId)) {
      setSelectedPhaseId(null);
      setSelectedSectionId(null);
      setDrillLevel("phases");
    }
  }, [milestones, selectedPhaseId]);

  useEffect(() => {
    if (selectedSectionId !== null && selectedSectionId !== -1 && !sections.some(s => s.id === selectedSectionId)) {
      setSelectedSectionId(null);
      setDrillLevel("sections");
    }
  }, [sections, selectedSectionId]);

  const phaseInfos = useMemo((): PhaseInfo[] => {
    const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sorted.map((ms, idx) => {
      const colorIndex = idx % PHASE_COLORS.length;
      const msTasks = tasks.filter(t => t.milestoneId === ms.id);
      const msSections = sections.filter(s => s.milestoneId === ms.id);

      const totalTasks = msTasks.length;
      const doneTasks = msTasks.filter(t => t.status === "done").length;
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : ms.completed ? 100 : 0;

      const allDates: Date[] = [];
      if (ms.startDate) allDates.push(parseISO(ms.startDate));
      if (ms.endDate) allDates.push(parseISO(ms.endDate));
      if (ms.date) allDates.push(parseISO(ms.date));
      msTasks.forEach(t => { if (t.dueDate) allDates.push(parseISO(t.dueDate)); });
      msSections.forEach(s => {
        if (s.startDate) allDates.push(parseISO(s.startDate));
        if (s.endDate) allDates.push(parseISO(s.endDate));
      });

      const phaseStart = ms.startDate ? parseISO(ms.startDate)
        : allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
      let phaseEnd = ms.endDate ? parseISO(ms.endDate)
        : allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;
      if (phaseStart && (!phaseEnd || phaseEnd.getTime() <= phaseStart.getTime())) {
        phaseEnd = addDays(phaseStart, 14);
      }

      return { id: ms.id, title: ms.title, startDate: phaseStart, endDate: phaseEnd, progress, totalTasks, doneTasks, completed: !!ms.completed, colorIndex };
    });
  }, [milestones, sections, tasks]);

  const selectedPhase = phaseInfos.find(p => p.id === selectedPhaseId) || null;

  const sectionInfos = useMemo((): SectionInfo[] => {
    if (!selectedPhaseId) return [];
    const phase = phaseInfos.find(p => p.id === selectedPhaseId);
    if (!phase) return [];
    const msSections = sections.filter(s => s.milestoneId === selectedPhaseId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const msTasks = tasks.filter(t => t.milestoneId === selectedPhaseId);

    const result: SectionInfo[] = [];
    msSections.forEach(sec => {
      const secTasks = msTasks.filter(t => t.sectionId === sec.id);
      const secTotal = secTasks.length;
      const secDone = secTasks.filter(t => t.status === "done").length;
      const secProgress = secTotal > 0 ? Math.round((secDone / secTotal) * 100) : sec.completed ? 100 : 0;

      const secDates: Date[] = [];
      if (sec.startDate) secDates.push(parseISO(sec.startDate));
      if (sec.endDate) secDates.push(parseISO(sec.endDate));
      secTasks.forEach(t => { if (t.dueDate) secDates.push(parseISO(t.dueDate)); });

      const secStart = sec.startDate ? parseISO(sec.startDate)
        : secDates.length > 0 ? new Date(Math.min(...secDates.map(d => d.getTime()))) : phase.startDate;
      let secEnd = sec.endDate ? parseISO(sec.endDate)
        : secDates.length > 0 ? new Date(Math.max(...secDates.map(d => d.getTime()))) : null;
      if (secStart && (!secEnd || secEnd.getTime() <= secStart.getTime())) {
        secEnd = addDays(secStart, 7);
      }

      result.push({ id: sec.id, milestoneId: sec.milestoneId, title: sec.title, startDate: secStart, endDate: secEnd, progress: secProgress, totalTasks: secTotal, doneTasks: secDone, completed: !!sec.completed, colorIndex: phase.colorIndex });
    });

    const unsectionedTasks = msTasks.filter(t => !t.sectionId);
    if (unsectionedTasks.length > 0) {
      const uDone = unsectionedTasks.filter(t => t.status === "done").length;
      const uDates = unsectionedTasks.filter(t => t.dueDate).map(t => parseISO(t.dueDate!));
      const uStart = uDates.length > 0 ? new Date(Math.min(...uDates.map(d => d.getTime()))) : phase.startDate;
      let uEnd = uDates.length > 0 ? new Date(Math.max(...uDates.map(d => d.getTime()))) : null;
      if (uStart && (!uEnd || uEnd.getTime() <= uStart.getTime())) uEnd = addDays(uStart, 7);

      result.push({
        id: -1,
        milestoneId: selectedPhaseId,
        title: "General Tasks",
        startDate: uStart,
        endDate: uEnd,
        progress: unsectionedTasks.length > 0 ? Math.round((uDone / unsectionedTasks.length) * 100) : 0,
        totalTasks: unsectionedTasks.length,
        doneTasks: uDone,
        completed: false,
        colorIndex: phase.colorIndex,
      });
    }

    return result;
  }, [selectedPhaseId, phaseInfos, sections, tasks]);

  const selectedSection = sectionInfos.find(s => s.id === selectedSectionId) || null;

  const taskInfos = useMemo((): TaskInfo[] => {
    if (!selectedPhaseId) return [];
    const phase = phaseInfos.find(p => p.id === selectedPhaseId);
    if (!phase) return [];

    let filteredTasks: Task[];
    if (selectedSectionId === -1) {
      filteredTasks = tasks.filter(t => t.milestoneId === selectedPhaseId && !t.sectionId);
    } else if (selectedSectionId !== null) {
      filteredTasks = tasks.filter(t => t.sectionId === selectedSectionId);
    } else {
      return [];
    }

    return filteredTasks.map(t => {
      const taskDate = t.dueDate ? parseISO(t.dueDate) : null;
      return {
        id: t.id,
        title: t.title,
        startDate: taskDate ? addDays(taskDate, -3) : null,
        endDate: taskDate,
        status: t.status,
        colorIndex: phase.colorIndex,
      };
    });
  }, [selectedPhaseId, selectedSectionId, phaseInfos, tasks]);

  type BarItem = { startDate: Date | null; endDate: Date | null; colorIndex: number; progress?: number; status?: string | null; type: "phase" | "section" | "task"; id: number; title: string };

  const currentRows: BarItem[] = useMemo(() => {
    if (drillLevel === "phases") {
      return phaseInfos.map(p => ({ ...p, type: "phase" as const }));
    }
    if (drillLevel === "sections") {
      return sectionInfos.map(s => ({ ...s, type: "section" as const }));
    }
    return taskInfos.map(t => ({ ...t, type: "task" as const }));
  }, [drillLevel, phaseInfos, sectionInfos, taskInfos]);

  const rowsWithDates = currentRows.filter(r => r.startDate && r.endDate);

  const { timelineStart, timelineEnd, months, dayWidth } = useMemo(() => {
    if (rowsWithDates.length === 0) {
      let fallbackStart: Date | null = null;
      let fallbackEnd: Date | null = null;
      if (drillLevel === "tasks" && selectedSection && selectedSection.startDate) {
        fallbackStart = selectedSection.startDate;
        fallbackEnd = selectedSection.endDate || addDays(selectedSection.startDate, 30);
      } else if (drillLevel === "tasks" && selectedPhase && selectedPhase.startDate) {
        fallbackStart = selectedPhase.startDate;
        fallbackEnd = selectedPhase.endDate || addDays(selectedPhase.startDate, 60);
      } else if (drillLevel === "sections" && selectedPhase && selectedPhase.startDate) {
        fallbackStart = selectedPhase.startDate;
        fallbackEnd = selectedPhase.endDate || addDays(selectedPhase.startDate, 60);
      }
      const now = new Date();
      const s = startOfMonth(fallbackStart || now);
      const e = endOfMonth(fallbackEnd || addDays(now, 90));
      return { timelineStart: s, timelineEnd: e, months: eachMonthOfInterval({ start: s, end: e }), dayWidth: 4 * zoomLevel };
    }

    const allStarts = rowsWithDates.map(r => r.startDate!.getTime());
    const allEnds = rowsWithDates.map(r => r.endDate!.getTime());
    const earliest = new Date(Math.min(...allStarts));
    const latest = new Date(Math.max(...allEnds));
    const s = startOfMonth(addDays(earliest, -14));
    const e = endOfMonth(addDays(latest, 30));

    return { timelineStart: s, timelineEnd: e, months: eachMonthOfInterval({ start: s, end: e }), dayWidth: 4 * zoomLevel };
  }, [rowsWithDates, zoomLevel, drillLevel, selectedPhase, selectedSection]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const totalWidth = totalDays * dayWidth;

  const getBarPosition = (start: Date, end: Date) => {
    const left = differenceInDays(start, timelineStart) * dayWidth;
    const width = Math.max(differenceInDays(end, start) * dayWidth, 16);
    return { left, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart) * dayWidth;

  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = 40;

  const handleAddPhase = () => {
    if (!newPhaseTitle.trim()) return;
    const payload: InsertMilestone & { projectId: number } = {
      projectId,
      title: newPhaseTitle.trim(),
      startDate: newPhaseStart || null,
      endDate: newPhaseEnd || null,
    };
    createMilestone(payload, {
      onSuccess: () => {
        toast({ title: "Phase added" });
        setNewPhaseTitle(""); setNewPhaseStart(""); setNewPhaseEnd(""); setAddingPhase(false);
      },
      onError: () => toast({ title: "Failed to add phase", variant: "destructive" }),
    });
  };

  const handleAddSection = (milestoneId: number) => {
    if (!newSectionTitle.trim()) return;
    createSection(
      { projectId, milestoneId, title: newSectionTitle.trim(), startDate: newSectionStart || null, endDate: newSectionEnd || null },
      {
        onSuccess: () => {
          toast({ title: "Section added" });
          setNewSectionTitle(""); setNewSectionStart(""); setNewSectionEnd(""); setAddingSectionFor(null);
        },
        onError: () => toast({ title: "Failed to add section", variant: "destructive" }),
      }
    );
  };

  const handleEditSection = () => {
    if (!editingSection || !editSectionForm.title.trim()) return;
    updateSection(
      { id: editingSection.id, projectId, title: editSectionForm.title.trim(), startDate: editSectionForm.startDate || null, endDate: editSectionForm.endDate || null },
      {
        onSuccess: () => { toast({ title: "Section updated" }); setEditingSection(null); },
        onError: () => toast({ title: "Failed to update section", variant: "destructive" }),
      }
    );
  };

  const openEditSection = (sectionId: number) => {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    setEditingSection(sec);
    setEditSectionForm({ title: sec.title, startDate: sec.startDate || "", endDate: sec.endDate || "" });
  };

  const handleAddTask = () => {
    if (!addingTask || !newTaskTitle.trim()) return;
    createTask(
      { projectId, milestoneId: addingTask.milestoneId, sectionId: addingTask.sectionId, title: newTaskTitle.trim(), dueDate: newTaskDueDate || null },
      {
        onSuccess: () => { toast({ title: "Task added" }); setNewTaskTitle(""); setNewTaskDueDate(""); setAddingTask(null); },
        onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
      }
    );
  };

  const handleToggleTask = (taskId: number, currentStatus: string | null) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    updateTask({ id: taskId, status: newStatus }, {
      onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
    });
  };

  const drillIntoPhase = (phaseId: number) => {
    setSelectedPhaseId(phaseId);
    setSelectedSectionId(null);
    setDrillLevel("sections");
  };

  const drillIntoSection = (sectionId: number) => {
    setSelectedSectionId(sectionId);
    setDrillLevel("tasks");
  };

  const goBack = () => {
    if (drillLevel === "tasks") {
      setSelectedSectionId(null);
      setDrillLevel("sections");
    } else if (drillLevel === "sections") {
      setSelectedPhaseId(null);
      setDrillLevel("phases");
    }
  };

  const renderBar = (row: BarItem) => {
    if (!row.startDate || !row.endDate) return null;
    const { left, width } = getBarPosition(row.startDate, row.endDate);

    if (row.type === "task") {
      const isDone = row.status === "done";
      const barHeight = 14;
      const topOffset = (ROW_HEIGHT - barHeight) / 2;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute rounded-sm cursor-default"
              style={{ left, width, top: topOffset, height: barHeight, backgroundColor: PHASE_COLORS[row.colorIndex], opacity: isDone ? 0.35 : 0.6 }}
              data-testid={`gantt-bar-task-${row.id}`}
            >
              {isDone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-px bg-foreground/30" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium text-sm">{row.title}</p>
            <p className="text-xs text-muted-foreground capitalize">{row.status || "to-do"}</p>
            {row.endDate && <p className="text-xs text-muted-foreground">Due: {format(row.endDate, "MMM d, yyyy")}</p>}
          </TooltipContent>
        </Tooltip>
      );
    }

    const barHeight = row.type === "phase" ? 22 : 18;
    const topOffset = (ROW_HEIGHT - barHeight) / 2;
    const color = PHASE_COLORS[row.colorIndex];
    const progress = row.progress || 0;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute rounded-sm cursor-default overflow-hidden border border-border/20"
            style={{ left, width, top: topOffset, height: barHeight, backgroundColor: `${color}22` }}
            data-testid={`gantt-bar-${row.type}-${row.id}`}
          >
            <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: color, opacity: row.type === "phase" ? 1 : 0.75 }} />
            {width > 50 && (
              <span className="absolute inset-0 flex items-center px-1.5 text-[9px] font-medium text-foreground/70 truncate">
                {progress}%
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium text-sm">{row.title}</p>
          {row.startDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {format(row.startDate, "MMM d")} — {row.endDate ? format(row.endDate, "MMM d, yyyy") : "TBD"}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  const showBreadcrumb = drillLevel !== "phases";

  const currentProgress = useMemo(() => {
    if (drillLevel === "tasks" && selectedSection) return selectedSection.progress;
    if (drillLevel === "sections" && selectedPhase) return selectedPhase.progress;
    return null;
  }, [drillLevel, selectedPhase, selectedSection]);

  const scopeHeading = useMemo(() => {
    if (drillLevel === "phases") return "Scope";
    if (drillLevel === "sections") return "Sections";
    return "Tasks";
  }, [drillLevel]);

  return (
    <div className="space-y-4" data-testid="gantt-chart">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {drillLevel !== "phases" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} data-testid="button-gantt-back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h3 className="font-serif text-lg font-semibold tracking-tight uppercase" data-testid="text-gantt-heading">
            Project Timeline
          </h3>
          {drillLevel === "phases" && (
            <Badge variant="outline" className="text-xs" data-testid="badge-phase-count">
              {milestones.length} {milestones.length === 1 ? "phase" : "phases"}
            </Badge>
          )}
          {currentProgress !== null && (
            <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-drill-progress">
              {currentProgress}% complete
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && drillLevel === "phases" && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingPhase(true)} data-testid="button-add-phase-timeline">
              <Plus className="h-3 w-3" />
              Phase
            </Button>
          )}
          {isAdmin && drillLevel === "sections" && selectedPhaseId && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAddingSectionFor(selectedPhaseId); setNewSectionTitle(""); setNewSectionStart(""); setNewSectionEnd(""); }} data-testid="button-add-section-timeline">
              <Plus className="h-3 w-3" />
              Section
            </Button>
          )}
          {isAdmin && drillLevel === "tasks" && selectedPhaseId && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAddingTask({ milestoneId: selectedPhaseId, sectionId: selectedSectionId === -1 ? null : selectedSectionId }); setNewTaskTitle(""); setNewTaskDueDate(""); }} data-testid="button-add-task-timeline">
              <Plus className="h-3 w-3" />
              Task
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} disabled={zoomLevel <= 0.5} data-testid="button-zoom-out">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} disabled={zoomLevel >= 3} data-testid="button-zoom-in">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {showBreadcrumb && (
        <div className="flex items-center gap-2 text-sm">
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline" data-testid="button-breadcrumb-back">
            {drillLevel === "tasks" && selectedPhase ? selectedPhase.title : "All Phases"}
          </button>
          <span className="text-muted-foreground">›</span>
          <span className="font-medium text-foreground" data-testid="text-breadcrumb-current">
            {drillLevel === "tasks" && selectedSection ? selectedSection.title : selectedPhase?.title}
          </span>
          {currentProgress !== null && (
            <div className="ml-auto flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${currentProgress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{currentProgress}%</span>
            </div>
          )}
        </div>
      )}

      {addingPhase && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-phase-inline">
          <Input placeholder="Phase name" value={newPhaseTitle} onChange={e => setNewPhaseTitle(e.target.value)} className="flex-1" autoFocus data-testid="input-phase-title" onKeyDown={e => { if (e.key === "Enter") handleAddPhase(); }} />
          <DateField label="Start date" value={newPhaseStart} onChange={setNewPhaseStart} placeholder="Start date" testId="button-phase-start-date" />
          <DateField label="End date" value={newPhaseEnd} onChange={setNewPhaseEnd} placeholder="End date" testId="button-phase-end-date" />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleAddPhase} disabled={creatingMilestone || !newPhaseTitle.trim()} data-testid="button-confirm-add-phase">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingPhase(false); setNewPhaseTitle(""); setNewPhaseStart(""); setNewPhaseEnd(""); }} data-testid="button-cancel-add-phase">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {addingSectionFor !== null && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-section-inline">
          <Input placeholder="Section name" value={newSectionTitle} onChange={e => setNewSectionTitle(e.target.value)} className="flex-1" autoFocus data-testid="input-section-title" onKeyDown={e => { if (e.key === "Enter") handleAddSection(addingSectionFor); }} />
          <DateField label="Start" value={newSectionStart} onChange={setNewSectionStart} placeholder="Start" testId="button-section-start-date" />
          <DateField label="End" value={newSectionEnd} onChange={setNewSectionEnd} placeholder="End" testId="button-section-end-date" />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => handleAddSection(addingSectionFor)} disabled={creatingSection || !newSectionTitle.trim()} data-testid="button-confirm-add-section">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingSectionFor(null)} data-testid="button-cancel-add-section">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {editingSection && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-primary/30 rounded-sm bg-muted/20" data-testid="form-edit-section-inline">
          <Input placeholder="Section name" value={editSectionForm.title} onChange={e => setEditSectionForm({ ...editSectionForm, title: e.target.value })} className="flex-1" autoFocus data-testid="input-edit-section-title" onKeyDown={e => { if (e.key === "Enter") handleEditSection(); }} />
          <DateField label="Start date" value={editSectionForm.startDate} onChange={(value) => setEditSectionForm({ ...editSectionForm, startDate: value })} placeholder="Start date" testId="button-edit-section-start" />
          <DateField label="End date" value={editSectionForm.endDate} onChange={(value) => setEditSectionForm({ ...editSectionForm, endDate: value })} placeholder="End date" testId="button-edit-section-end" />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleEditSection} disabled={updatingSection || !editSectionForm.title.trim()} data-testid="button-save-section">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)} data-testid="button-cancel-edit-section">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {addingTask !== null && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-task-inline">
          <Input placeholder="Task title" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} className="flex-1" autoFocus data-testid="input-task-title" onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }} />
          <DateField label="Due date" value={newTaskDueDate} onChange={setNewTaskDueDate} placeholder="Due date" testId="button-task-due-date" />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleAddTask} disabled={creatingTask || !newTaskTitle.trim()} data-testid="button-confirm-add-task">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingTask(null)} data-testid="button-cancel-add-task">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {currentRows.length === 0 && !addingPhase && !addingSectionFor && !addingTask ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-gantt-empty">
            {drillLevel === "phases" && "No phases yet. Add a phase to start building the project scope."}
            {drillLevel === "sections" && "No sections in this phase yet. Add a section to organise tasks."}
            {drillLevel === "tasks" && "No tasks in this section yet. Add a task to get started."}
          </p>
        </div>
      ) : currentRows.length > 0 && (
        <div className="border border-border/50 rounded-sm overflow-hidden">
          <div className="flex">
            <div className="w-64 min-w-[256px] shrink-0 border-r border-border/50 bg-muted/30">
              <div className="border-b border-border/50 flex items-center px-3" style={{ height: HEADER_HEIGHT }}>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground" data-testid="text-scope-header">{scopeHeading}</span>
              </div>

              {drillLevel === "phases" && phaseInfos.map((phase) => (
                <div
                  key={phase.id}
                  className="border-b border-border/30 flex items-center gap-2.5 px-3 cursor-pointer hover:bg-muted/20 transition-colors group"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => drillIntoPhase(phase.id)}
                  data-testid={`gantt-phase-row-${phase.id}`}
                >
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PHASE_COLORS[phase.colorIndex] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate">{phase.title}</span>
                      {phase.completed && <Check className="h-3 w-3 text-green-600 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${phase.progress}%`, backgroundColor: PHASE_COLORS[phase.colorIndex] }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{phase.doneTasks}/{phase.totalTasks}</span>
                      {phase.startDate && (
                        <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                          {format(phase.startDate, "MMM d")}{phase.endDate ? ` – ${format(phase.endDate, "MMM d")}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-phase-menu-${phase.id}`}>
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setAddingSectionFor(phase.id); setNewSectionTitle(""); setNewSectionStart(""); setNewSectionEnd(""); }} data-testid={`button-add-section-${phase.id}`}>
                          <FolderPlus className="h-3.5 w-3.5 mr-2" />
                          Add Section
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setAddingTask({ milestoneId: phase.id, sectionId: null }); setNewTaskTitle(""); setNewTaskDueDate(""); }} data-testid={`button-add-task-phase-${phase.id}`}>
                          <ListPlus className="h-3.5 w-3.5 mr-2" />
                          Add Task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}

              {drillLevel === "sections" && sectionInfos.map((sec) => (
                <div
                  key={sec.id}
                  className="border-b border-border/30 flex items-center gap-2.5 px-3 cursor-pointer hover:bg-muted/20 transition-colors group"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => drillIntoSection(sec.id)}
                  data-testid={`gantt-section-row-${sec.id}`}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PHASE_COLORS[sec.colorIndex], opacity: 0.7 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate">{sec.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${sec.progress}%`, backgroundColor: PHASE_COLORS[sec.colorIndex] }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{sec.doneTasks}/{sec.totalTasks}</span>
                      {sec.startDate && (
                        <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                          {format(sec.startDate, "MMM d")}{sec.endDate ? ` – ${format(sec.endDate, "MMM d")}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && sec.id !== -1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-section-menu-${sec.id}`}>
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditSection(sec.id)} data-testid={`button-edit-section-${sec.id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit Section
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setAddingTask({ milestoneId: sec.milestoneId, sectionId: sec.id }); setNewTaskTitle(""); setNewTaskDueDate(""); }} data-testid={`button-add-task-section-${sec.id}`}>
                          <ListPlus className="h-3.5 w-3.5 mr-2" />
                          Add Task
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteSection({ id: sec.id, projectId }, { onSuccess: () => toast({ title: "Section deleted" }), onError: () => toast({ title: "Failed to delete section", variant: "destructive" }) })} data-testid={`button-delete-section-${sec.id}`}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete Section
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}

              {drillLevel === "tasks" && taskInfos.map((task) => {
                const isDone = task.status === "done";
                return (
                  <div
                    key={task.id}
                    className="border-b border-border/30 flex items-center gap-2.5 px-3 group"
                    style={{ height: ROW_HEIGHT }}
                    data-testid={`gantt-task-row-${task.id}`}
                  >
                    {isAdmin ? (
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={() => handleToggleTask(task.id, task.status)}
                        className="shrink-0"
                        data-testid={`checkbox-task-${task.id}`}
                      />
                    ) : (
                      <div className="shrink-0">
                        {isDone ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground/40" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs truncate block ${isDone ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                      {task.endDate && (
                        <span className="text-[10px] text-muted-foreground/70">Due {format(task.endDate, "MMM d")}</span>
                      )}
                    </div>
                    <Badge variant={isDone ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0 h-4 shrink-0 capitalize" data-testid={`badge-task-status-${task.id}`}>
                      {isDone ? "Done" : (task.status || "To-do")}
                    </Badge>
                  </div>
                );
              })}
            </div>

            <ScrollArea className="flex-1">
              <div style={{ width: totalWidth, minWidth: "100%" }}>
                <div className="border-b border-border/50 flex relative bg-muted/20" style={{ height: HEADER_HEIGHT }}>
                  {months.map(month => {
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
                    <div className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10" style={{ left: todayOffset }} data-testid="gantt-today-line">
                      <div className="absolute -top-0 -translate-x-1/2 bg-red-500 text-white text-[9px] px-1 py-0.5 rounded-b-sm leading-none">
                        Today
                      </div>
                    </div>
                  )}

                  {currentRows.map((row, idx) => (
                    <div key={`${row.type}-${row.id}`} className="relative border-b border-border/30" style={{ height: ROW_HEIGHT }} data-testid={`gantt-row-${row.type}-${row.id}`}>
                      {months.map(month => {
                        const offset = differenceInDays(month, timelineStart) * dayWidth;
                        return <div key={month.toISOString()} className="absolute top-0 h-full border-l border-border/10" style={{ left: offset }} />;
                      })}
                      {renderBar(row)}
                    </div>
                  ))}
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      )}

      {drillLevel === "phases" && milestones.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground pt-1">
          {phaseInfos.map((phase) => (
            <div key={phase.id} className="flex items-center gap-1.5" data-testid={`gantt-legend-${phase.id}`}>
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PHASE_COLORS[phase.colorIndex] }} />
              <span>{phase.title}</span>
              {phase.completed && <span className="text-green-600">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
