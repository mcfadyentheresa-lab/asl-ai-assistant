import { useMemo, useState } from "react";
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut, Plus, Trash2, Pencil, FolderPlus, Check, X, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateSection, useUpdateSection, useDeleteSection, useCreateMilestone, useCreateTask } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import type { InsertMilestone } from "@shared/schema";
import { ListPlus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface PhaseRow {
  type: "phase";
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  totalTasks: number;
  doneTasks: number;
  completed: boolean;
  colorIndex: number;
  depth: 0;
}

interface SectionRow {
  type: "section";
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
  depth: 1;
}

interface TaskRow {
  type: "task";
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string | null;
  colorIndex: number;
  depth: 2;
}

type RowItem = PhaseRow | SectionRow | TaskRow;

function isGroupRow(row: RowItem): row is PhaseRow | SectionRow {
  return row.type === "phase" || row.type === "section";
}

export default function GanttChart({ projectId, milestones, sections, tasks, userRole }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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

  const isAdmin = userRole !== "client";

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rows = useMemo(() => {
    const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
    const result: RowItem[] = [];

    sorted.forEach((ms, idx) => {
      const colorIndex = idx % PHASE_COLORS.length;
      const msTasks = tasks.filter(t => t.milestoneId === ms.id);
      const msSections = sections.filter(s => s.milestoneId === ms.id).sort((a, b) => (a.order || 0) - (b.order || 0));

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

      result.push({
        type: "phase", id: ms.id, title: ms.title, startDate: phaseStart, endDate: phaseEnd,
        progress, totalTasks, doneTasks, completed: !!ms.completed, colorIndex, depth: 0,
      });

      const phaseKey = `phase-${ms.id}`;
      if (collapsed.has(phaseKey)) return;

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
          : secDates.length > 0 ? new Date(Math.min(...secDates.map(d => d.getTime()))) : phaseStart;
        let secEnd = sec.endDate ? parseISO(sec.endDate)
          : secDates.length > 0 ? new Date(Math.max(...secDates.map(d => d.getTime()))) : null;
        if (secStart && (!secEnd || secEnd.getTime() <= secStart.getTime())) {
          secEnd = addDays(secStart, 7);
        }

        result.push({
          type: "section", id: sec.id, milestoneId: sec.milestoneId, title: sec.title, startDate: secStart, endDate: secEnd,
          progress: secProgress, totalTasks: secTotal, doneTasks: secDone, completed: !!sec.completed, colorIndex, depth: 1,
        });

        const sectionKey = `section-${sec.id}`;
        if (collapsed.has(sectionKey)) return;

        secTasks.forEach(t => {
          const taskDate = t.dueDate ? parseISO(t.dueDate) : null;
          result.push({
            type: "task", id: t.id, title: t.title,
            startDate: taskDate ? addDays(taskDate, -3) : null,
            endDate: taskDate,
            status: t.status, colorIndex, depth: 2,
          });
        });
      });

      const unsectionedTasks = msTasks.filter(t => !t.sectionId);
      unsectionedTasks.forEach(t => {
        const taskDate = t.dueDate ? parseISO(t.dueDate) : null;
        result.push({
          type: "task", id: t.id, title: t.title,
          startDate: taskDate ? addDays(taskDate, -3) : null,
          endDate: taskDate,
          status: t.status, colorIndex, depth: 2,
        });
      });
    });

    return result;
  }, [milestones, sections, tasks, collapsed]);

  const rowsWithDates = rows.filter(r => r.startDate && r.endDate);

  const { timelineStart, timelineEnd, months, dayWidth } = useMemo(() => {
    if (rowsWithDates.length === 0) {
      const now = new Date();
      const s = startOfMonth(now);
      const e = endOfMonth(addDays(now, 90));
      return { timelineStart: s, timelineEnd: e, months: eachMonthOfInterval({ start: s, end: e }), dayWidth: 4 * zoomLevel };
    }

    const allStarts = rowsWithDates.map(r => r.startDate!.getTime());
    const allEnds = rowsWithDates.map(r => r.endDate!.getTime());
    const earliest = new Date(Math.min(...allStarts));
    const latest = new Date(Math.max(...allEnds));
    const s = startOfMonth(addDays(earliest, -14));
    const e = endOfMonth(addDays(latest, 30));

    return { timelineStart: s, timelineEnd: e, months: eachMonthOfInterval({ start: s, end: e }), dayWidth: 4 * zoomLevel };
  }, [rowsWithDates, zoomLevel]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const totalWidth = totalDays * dayWidth;

  const getBarPosition = (start: Date, end: Date) => {
    const left = differenceInDays(start, timelineStart) * dayWidth;
    const width = Math.max(differenceInDays(end, start) * dayWidth, 16);
    return { left, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart) * dayWidth;

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
        setNewPhaseTitle("");
        setNewPhaseStart("");
        setNewPhaseEnd("");
        setAddingPhase(false);
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
          setNewSectionTitle("");
          setNewSectionStart("");
          setNewSectionEnd("");
          setAddingSectionFor(null);
        },
        onError: () => toast({ title: "Failed to add section", variant: "destructive" }),
      }
    );
  };

  const handleEditSection = () => {
    if (!editingSection || !editSectionForm.title.trim()) return;
    updateSection(
      {
        id: editingSection.id,
        projectId,
        title: editSectionForm.title.trim(),
        startDate: editSectionForm.startDate || null,
        endDate: editSectionForm.endDate || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Section updated" });
          setEditingSection(null);
        },
        onError: () => toast({ title: "Failed to update section", variant: "destructive" }),
      }
    );
  };

  const openEditSection = (sectionId: number) => {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    setEditingSection(sec);
    setEditSectionForm({
      title: sec.title,
      startDate: sec.startDate || "",
      endDate: sec.endDate || "",
    });
  };

  const handleAddTask = () => {
    if (!addingTask || !newTaskTitle.trim()) return;
    createTask(
      {
        projectId,
        milestoneId: addingTask.milestoneId,
        sectionId: addingTask.sectionId,
        title: newTaskTitle.trim(),
        dueDate: newTaskDueDate || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Task added" });
          setNewTaskTitle("");
          setNewTaskDueDate("");
          setAddingTask(null);
        },
        onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
      }
    );
  };

  const ROW_HEIGHT = 36;
  const HEADER_HEIGHT = 40;
  const depthPadding = [12, 28, 44];

  const renderTooltipDetails = (row: RowItem) => {
    if (isGroupRow(row)) {
      return (
        <>
          <p className="font-medium text-sm">{row.title}</p>
          {row.startDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {format(row.startDate, "MMM d")} — {row.endDate ? format(row.endDate, "MMM d, yyyy") : "TBD"}
            </p>
          )}
          {row.totalTasks > 0 && (
            <p className="text-xs text-muted-foreground">
              {row.doneTasks}/{row.totalTasks} tasks ({row.progress}%)
            </p>
          )}
        </>
      );
    }
    return (
      <>
        <p className="font-medium text-sm">{row.title}</p>
        <p className="text-xs text-muted-foreground capitalize">{row.status || "to-do"}</p>
        {row.endDate && <p className="text-xs text-muted-foreground">Due: {format(row.endDate, "MMM d, yyyy")}</p>}
      </>
    );
  };

  const renderBar = (row: RowItem) => {
    if (!row.startDate || !row.endDate) return null;
    const { left, width } = getBarPosition(row.startDate, row.endDate);

    if (row.type === "task") {
      const isDone = row.status === "done";
      const barHeight = 12;
      const topOffset = (ROW_HEIGHT - barHeight) / 2;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute rounded-sm cursor-default"
              style={{ left, width, top: topOffset, height: barHeight, backgroundColor: PHASE_COLORS[row.colorIndex], opacity: isDone ? 0.4 : 0.55 }}
            />
          </TooltipTrigger>
          <TooltipContent>{renderTooltipDetails(row)}</TooltipContent>
        </Tooltip>
      );
    }

    const barHeight = row.type === "phase" ? 20 : 16;
    const topOffset = (ROW_HEIGHT - barHeight) / 2;
    const opacity = row.type === "phase" ? 1 : 0.75;
    const color = PHASE_COLORS[row.colorIndex];

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute rounded-sm cursor-default overflow-hidden border border-border/20"
            style={{ left, width, top: topOffset, height: barHeight, backgroundColor: `${color}22` }}
            data-testid={`gantt-bar-${row.type}-${row.id}`}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${row.progress}%`, backgroundColor: color, opacity }}
            />
            {width > 50 && (
              <span className="absolute inset-0 flex items-center px-1.5 text-[9px] font-medium text-foreground/70 truncate">
                {row.progress}%
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{renderTooltipDetails(row)}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-4" data-testid="gantt-chart">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-lg font-semibold tracking-tight uppercase" data-testid="text-gantt-heading">
            Project Timeline
          </h3>
          <Badge variant="outline" className="text-xs" data-testid="badge-phase-count">
            {milestones.length} {milestones.length === 1 ? "phase" : "phases"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setAddingPhase(true)}
              data-testid="button-add-phase-timeline"
            >
              <Plus className="h-3 w-3" />
              Phase
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
              disabled={zoomLevel <= 0.5}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}
              disabled={zoomLevel >= 3}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {addingPhase && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-phase-inline">
          <Input
            placeholder="Phase name"
            value={newPhaseTitle}
            onChange={e => setNewPhaseTitle(e.target.value)}
            className="flex-1"
            autoFocus
            data-testid="input-phase-title"
            onKeyDown={e => { if (e.key === "Enter") handleAddPhase(); }}
          />
          <Input
            type="date"
            value={newPhaseStart}
            onChange={e => setNewPhaseStart(e.target.value)}
            className="w-36"
            data-testid="input-phase-start-date"
          />
          <Input
            type="date"
            value={newPhaseEnd}
            onChange={e => setNewPhaseEnd(e.target.value)}
            className="w-36"
            data-testid="input-phase-end-date"
          />
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

      {editingSection && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-primary/30 rounded-sm bg-muted/20" data-testid="form-edit-section-inline">
          <Input
            placeholder="Section name"
            value={editSectionForm.title}
            onChange={e => setEditSectionForm({ ...editSectionForm, title: e.target.value })}
            className="flex-1"
            autoFocus
            data-testid="input-edit-section-title"
            onKeyDown={e => { if (e.key === "Enter") handleEditSection(); }}
          />
          <Input
            type="date"
            value={editSectionForm.startDate}
            onChange={e => setEditSectionForm({ ...editSectionForm, startDate: e.target.value })}
            className="w-36"
            data-testid="input-edit-section-start"
          />
          <Input
            type="date"
            value={editSectionForm.endDate}
            onChange={e => setEditSectionForm({ ...editSectionForm, endDate: e.target.value })}
            className="w-36"
            data-testid="input-edit-section-end"
          />
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

      {milestones.length === 0 && !addingPhase ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-gantt-empty">
            No phases yet. Add a phase to start building the project timeline.
          </p>
        </div>
      ) : milestones.length > 0 && (
        <div className="border border-border/50 rounded-sm overflow-hidden">
          <div className="flex">
            <div className="w-56 min-w-[224px] shrink-0 border-r border-border/50 bg-muted/30">
              <div className="border-b border-border/50 flex items-center px-3" style={{ height: HEADER_HEIGHT }}>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Work Breakdown</span>
              </div>
              {rows.map((row) => {
                const key = `${row.type}-${row.id}`;
                const isPhase = row.type === "phase";
                const isSection = row.type === "section";
                const isTask = row.type === "task";
                const collapseKey = isPhase ? `phase-${row.id}` : isSection ? `section-${row.id}` : null;
                const isCollapsed = collapseKey ? collapsed.has(collapseKey) : false;

                return (
                  <div
                    key={key}
                    className={`border-b border-border/30 flex items-center gap-1.5 ${isPhase ? "bg-muted/10 font-medium" : ""} ${isSection ? "bg-muted/5" : ""}`}
                    style={{ height: ROW_HEIGHT, paddingLeft: depthPadding[row.depth] }}
                    data-testid={`gantt-label-${row.type}-${row.id}`}
                  >
                    {(isPhase || isSection) && collapseKey && (
                      <button
                        onClick={() => toggleCollapse(collapseKey)}
                        className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                        data-testid={`button-toggle-${row.type}-${row.id}`}
                      >
                        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                    {isPhase && (
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: PHASE_COLORS[row.colorIndex] }} />
                    )}
                    {isSection && (
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PHASE_COLORS[row.colorIndex], opacity: 0.6 }} />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`truncate cursor-default ${isPhase ? "text-xs" : "text-[11px]"} ${isTask ? "text-muted-foreground pl-3" : ""}`}>
                          {row.title}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        {renderTooltipDetails(row)}
                      </TooltipContent>
                    </Tooltip>

                    <div className="ml-auto flex items-center shrink-0 pr-1">
                      {isAdmin && isPhase && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-5 w-5" data-testid={`button-phase-menu-${row.id}`}>
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => { setAddingSectionFor(row.id); setNewSectionTitle(""); setNewSectionStart(""); setNewSectionEnd(""); }}
                              data-testid={`button-add-section-${row.id}`}
                            >
                              <FolderPlus className="h-3.5 w-3.5 mr-2" />
                              Add Section
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => { setAddingTask({ milestoneId: row.id, sectionId: null }); setNewTaskTitle(""); setNewTaskDueDate(""); }}
                              data-testid={`button-add-task-phase-${row.id}`}
                            >
                              <ListPlus className="h-3.5 w-3.5 mr-2" />
                              Add Task
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {isAdmin && isSection && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-5 w-5" data-testid={`button-section-menu-${row.id}`}>
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditSection(row.id)}
                              data-testid={`button-edit-section-${row.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit Section
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => { if (row.type === "section") { setAddingTask({ milestoneId: row.milestoneId, sectionId: row.id }); setNewTaskTitle(""); setNewTaskDueDate(""); } }}
                              data-testid={`button-add-task-section-${row.id}`}
                            >
                              <ListPlus className="h-3.5 w-3.5 mr-2" />
                              Add Task
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteSection({ id: row.id, projectId }, {
                                onSuccess: () => toast({ title: "Section deleted" }),
                                onError: () => toast({ title: "Failed to delete section", variant: "destructive" }),
                              })}
                              data-testid={`button-delete-section-${row.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete Section
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}

              {addingSectionFor !== null && isAdmin && (
                <div className="border-b border-border/30 flex items-center gap-1.5 px-3 py-1.5 bg-muted/10" data-testid="form-add-section-inline">
                  <Input
                    placeholder="Section name"
                    value={newSectionTitle}
                    onChange={e => setNewSectionTitle(e.target.value)}
                    className="h-7 text-xs flex-1"
                    autoFocus
                    data-testid="input-section-title"
                    onKeyDown={e => { if (e.key === "Enter") handleAddSection(addingSectionFor); }}
                  />
                  <Input
                    type="date"
                    value={newSectionStart}
                    onChange={e => setNewSectionStart(e.target.value)}
                    className="h-7 text-xs w-28"
                    data-testid="input-section-start-date"
                  />
                  <Input
                    type="date"
                    value={newSectionEnd}
                    onChange={e => setNewSectionEnd(e.target.value)}
                    className="h-7 text-xs w-28"
                    data-testid="input-section-end-date"
                  />
                  <Button size="icon" className="h-6 w-6" onClick={() => handleAddSection(addingSectionFor)} disabled={creatingSection || !newSectionTitle.trim()} data-testid="button-confirm-add-section">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddingSectionFor(null)} data-testid="button-cancel-add-section">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {addingTask !== null && isAdmin && (
                <div className="border-b border-border/30 flex items-center gap-1.5 px-3 py-1.5 bg-muted/10" data-testid="form-add-task-inline">
                  <Input
                    placeholder="Task title"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    className="h-7 text-xs flex-1"
                    autoFocus
                    data-testid="input-task-title"
                    onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
                  />
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="h-7 text-xs w-28"
                    data-testid="input-task-due-date"
                  />
                  {addingTask.sectionId === null && sections.filter(s => s.milestoneId === addingTask.milestoneId).length > 0 && (
                    <Select
                      value={addingTask.sectionId !== null ? String(addingTask.sectionId) : "__none__"}
                      onValueChange={v => setAddingTask({ ...addingTask, sectionId: v === "__none__" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-7 text-xs w-28" data-testid="select-task-section">
                        <SelectValue placeholder="Section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No section</SelectItem>
                        {sections.filter(s => s.milestoneId === addingTask.milestoneId).map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="icon" className="h-6 w-6" onClick={handleAddTask} disabled={creatingTask || !newTaskTitle.trim()} data-testid="button-confirm-add-task">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddingTask(null)} data-testid="button-cancel-add-task">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1" orientation="horizontal">
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

                  {rows.map(row => {
                    const key = `${row.type}-${row.id}`;
                    return (
                      <div
                        key={key}
                        className="relative border-b border-border/30"
                        style={{ height: ROW_HEIGHT }}
                        data-testid={`gantt-row-${row.type}-${row.id}`}
                      >
                        {months.map(month => {
                          const offset = differenceInDays(month, timelineStart) * dayWidth;
                          return (
                            <div key={month.toISOString()} className="absolute top-0 h-full border-l border-border/10" style={{ left: offset }} />
                          );
                        })}
                        {renderBar(row)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground pt-1">
          {milestones
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((ms, idx) => (
              <div key={ms.id} className="flex items-center gap-1.5" data-testid={`gantt-legend-${ms.id}`}>
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PHASE_COLORS[idx % PHASE_COLORS.length] }} />
                <span>{ms.title}</span>
                {ms.completed && <span className="text-green-600">✓</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
