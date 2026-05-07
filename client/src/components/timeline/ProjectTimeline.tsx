/**
 * ProjectTimeline — replaces the old horizontal Gantt with a stacked,
 * vertical, mobile-first layout that works the same on phone, iPad, and
 * desktop. Desktop/iPad-landscape adds a one-screen "Schedule" mode that
 * shows section bars on a horizontal timeline (no horizontal scroll, no
 * nested task bars, no zoom levels). Phone never sees Schedule mode —
 * always the stack.
 *
 * Data model is unchanged: Milestone (Building) → Section → Task.
 *
 * Sort order: status-then-date.
 *   1. Overdue
 *   2. This week (due in next 7 days)
 *   3. Upcoming
 *   4. Done (collapsed by default)
 * Within each bucket, sorted by date ascending.
 *
 * No drag-to-reorder. Status + dates drive the order. If users want a
 * specific task surfaced, they update its status or due date.
 *
 * CRUD endpoints (unchanged):
 *   GET  /api/projects/:projectId/{milestones,sections,tasks}
 *   POST /api/projects/:projectId/{milestones,sections,tasks}
 *   PATCH /api/{milestones,sections}/:id
 *   PUT  /api/tasks/:id
 *   DELETE /api/{milestones,sections}/:id  (tasks: same pattern)
 */
import { useMemo, useState, useCallback, useEffect } from "react";
import { format, parseISO, differenceInDays, isValid } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  CalendarDays,
  Filter,
  Layers,
  X,
  LayoutList,
  GanttChartSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

// -------------------- types (matched to the existing GanttChart props) --------------------

interface Milestone {
  id: number;
  title: string;
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  completed: boolean;
  order: number;
  colorHex?: string | null;
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
  startDate: string | null;
  dueDate: string | null;
  milestoneId: number | null;
  sectionId: number | null;
  order: number | null;
  assignedTo: string | null;
}

interface ProjectTimelineProps {
  projectId: number;
  milestones: Milestone[];
  sections: SectionData[];
  tasks: Task[];
  userRole: string;
}

// -------------------- helpers --------------------

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

type StatusBucket = "overdue" | "thisweek" | "upcoming" | "done";

function safeParse(d: string | null): Date | null {
  if (!d) return null;
  const parsed = parseISO(d);
  return isValid(parsed) ? parsed : null;
}

function bucketForTask(t: Task): StatusBucket {
  if (t.status === "done") return "done";
  const due = safeParse(t.dueDate);
  if (!due) return "upcoming";
  const days = differenceInDays(due, TODAY);
  if (days < 0) return "overdue";
  if (days <= 7) return "thisweek";
  return "upcoming";
}

const BUCKET_RANK: Record<StatusBucket, number> = {
  overdue: 0,
  thisweek: 1,
  upcoming: 2,
  done: 3,
};

function compareTasks(a: Task, b: Task): number {
  const ra = BUCKET_RANK[bucketForTask(a)];
  const rb = BUCKET_RANK[bucketForTask(b)];
  if (ra !== rb) return ra - rb;
  // Within bucket, ascending due date; nulls last
  const da = safeParse(a.dueDate);
  const db = safeParse(b.dueDate);
  if (da && db) return da.getTime() - db.getTime();
  if (da && !db) return -1;
  if (!da && db) return 1;
  return (a.order ?? 0) - (b.order ?? 0);
}

function fmt(d: string | null): string {
  const parsed = safeParse(d);
  if (!parsed) return "—";
  return format(parsed, "MMM d");
}

function dateRange(start: string | null, end: string | null): string {
  const s = safeParse(start);
  const e = safeParse(end);
  if (!s && !e) return "No dates set";
  if (s && !e) return `Starts ${format(s, "MMM d")}`;
  if (!s && e) return `Due ${format(e, "MMM d")}`;
  if (s && e) {
    if (s.getFullYear() === e.getFullYear()) {
      return `${format(s, "MMM d")} – ${format(e, "MMM d")}`;
    }
    return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
  }
  return "—";
}

// -------------------- DueDate pill --------------------

function DueDatePill({
  task,
  isAdmin,
  onDueDateSave,
}: {
  task: Task;
  isAdmin?: boolean;
  onDueDateSave?: (taskId: number, dueDate: string | null) => void;
}) {
  const bucket = bucketForTask(task);
  const due = safeParse(task.dueDate);
  const [open, setOpen] = useState(false);
  // Stage edits so the user can clear, type, and confirm before we save.
  // dueDate is stored as ISO yyyy-MM-dd; the native picker uses the same.
  const [draft, setDraft] = useState<string>(task.dueDate?.slice(0, 10) || "");

  useEffect(() => {
    setDraft(task.dueDate?.slice(0, 10) || "");
  }, [task.dueDate, open]);

  // Build the visual badge that gets rendered — click target wraps it for admin.
  let badge: React.ReactNode;
  if (bucket === "done") {
    badge = (
      <Badge
        variant="outline"
        className="font-mono text-[10px] tracking-wider uppercase border-emerald-600/30 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
      >
        Done
      </Badge>
    );
  } else if (!due) {
    badge = (
      <Badge
        variant="outline"
        className="font-mono text-[10px] tracking-wider uppercase border-muted-foreground/20 text-muted-foreground"
      >
        {isAdmin ? "Set date" : "No date"}
      </Badge>
    );
  } else if (bucket === "overdue") {
    const days = Math.abs(differenceInDays(due, TODAY));
    badge = (
      <Badge
        variant="outline"
        className="font-mono text-[10px] tracking-wider uppercase border-rose-600/40 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
        title={`Overdue by ${days} day${days === 1 ? "" : "s"}`}
      >
        <AlertTriangle className="h-3 w-3 mr-1" aria-hidden />
        {days}d late
      </Badge>
    );
  } else if (bucket === "thisweek") {
    badge = (
      <Badge
        variant="outline"
        className="font-mono text-[10px] tracking-wider uppercase border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
      >
        <Clock className="h-3 w-3 mr-1" aria-hidden />
        {format(due, "EEE MMM d")}
      </Badge>
    );
  } else {
    badge = (
      <Badge
        variant="outline"
        className="font-mono text-[10px] tracking-wider uppercase border-muted-foreground/20 text-muted-foreground"
      >
        {format(due, "MMM d")}
      </Badge>
    );
  }

  // Non-admins (or rows missing a save handler) get the read-only pill.
  if (!isAdmin || !onDueDateSave || bucket === "done") return <>{badge}</>;

  const save = () => {
    const next = draft.trim() || null;
    const current = task.dueDate?.slice(0, 10) || null;
    if (next !== current) onDueDateSave(task.id, next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label={due ? `Change due date (currently ${format(due, "MMM d")})` : "Set due date"}
          data-testid={`task-duedate-trigger-${task.id}`}
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-3 space-y-2"
        onOpenAutoFocus={(e) => {
          // Keep keyboard focus inside the popover — native date pickers are
          // finicky on iOS Safari without an explicit focus pass.
          e.preventDefault();
          const inp = (e.currentTarget as HTMLElement).querySelector(
            'input[type="date"]',
          ) as HTMLInputElement | null;
          inp?.focus();
        }}
      >
        <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          Due date
        </label>
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-9 w-44"
          data-testid={`task-duedate-input-${task.id}`}
        />
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1"
            onClick={save}
            data-testid={`task-duedate-save-${task.id}`}
          >
            Save
          </Button>
          {due && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground"
              onClick={() => {
                setDraft("");
                onDueDateSave(task.id, null);
                setOpen(false);
              }}
              data-testid={`task-duedate-clear-${task.id}`}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// -------------------- Header strip (status counts) --------------------

function HeaderStrip({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => {
    let overdue = 0,
      thisweek = 0,
      upcoming = 0,
      done = 0;
    for (const t of tasks) {
      const b = bucketForTask(t);
      if (b === "overdue") overdue++;
      else if (b === "thisweek") thisweek++;
      else if (b === "upcoming") upcoming++;
      else done++;
    }
    return { overdue, thisweek, upcoming, done, total: tasks.length };
  }, [tasks]);

  const pct = counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);

  return (
    <div className="rounded-lg border border-border/50 bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Project progress
          </p>
          <p className="font-sans text-2xl font-semibold mt-0.5 leading-none tabular-nums">
            {pct}
            <span className="text-muted-foreground/60 text-base font-normal">%</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {counts.done} of {counts.total} done
          </p>
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="grid grid-cols-3 gap-2 mt-3">
        <CountTile label="Overdue" n={counts.overdue} tone="rose" />
        <CountTile label="This week" n={counts.thisweek} tone="amber" />
        <CountTile label="Upcoming" n={counts.upcoming} tone="muted" />
      </div>
    </div>
  );
}

function CountTile({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "rose" | "amber" | "muted";
}) {
  const palette: Record<string, string> = {
    rose: "border-rose-600/30 text-rose-700 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20",
    amber:
      "border-amber-500/30 text-amber-800 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20",
    muted: "border-border/60 text-muted-foreground bg-muted/30",
  };
  return (
    <div className={`rounded-md border ${palette[tone]} px-2.5 py-2`}>
      <p className="font-mono text-[9px] tracking-[0.18em] uppercase opacity-80">{label}</p>
      <p className="font-sans text-lg font-semibold leading-none mt-1 tabular-nums">{n}</p>
    </div>
  );
}

// -------------------- Section card (collapsed by default) --------------------

function SectionCard({
  section,
  milestone,
  tasks,
  expanded,
  onToggle,
  isAdmin,
  onTaskStatusToggle,
  onTaskDueDateSave,
  onAddTask,
  onTaskTitleSave,
}: {
  section: SectionData;
  milestone: Milestone | null;
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onTaskStatusToggle: (task: Task) => void;
  onTaskDueDateSave: (taskId: number, dueDate: string | null) => void;
  onAddTask: (sectionId: number, milestoneId: number) => void;
  onTaskTitleSave: (taskId: number, newTitle: string) => void;
}) {
  const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);
  const doneCount = sortedTasks.filter((t) => t.status === "done").length;
  const totalCount = sortedTasks.length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const stripeColor = milestone?.colorHex ?? "#3F8A66";

  return (
    <div
      className="rounded-lg border border-border/50 bg-card overflow-hidden transition-shadow hover:shadow-sm"
      data-testid={`section-card-${section.id}`}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`section-toggle-${section.id}`}
      >
        <span
          className="w-1 h-10 rounded-full flex-shrink-0"
          style={{ backgroundColor: stripeColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-sans text-sm sm:text-base font-semibold leading-tight truncate">
              {section.title}
            </h3>
            {milestone && (
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/70 truncate">
                {milestone.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
              {dateRange(section.startDate, section.endDate)}
            </span>
            <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground/60">
              · {doneCount}/{totalCount}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex flex-col items-end">
            <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground tabular-nums">
              {pct}%
            </span>
            <Progress value={pct} className="h-1 w-16 mt-1" />
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-background/50">
          {sortedTasks.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
                No tasks yet
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {sortedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  isAdmin={isAdmin}
                  onStatusToggle={() => onTaskStatusToggle(t)}
                  onTitleSave={(newTitle) => onTaskTitleSave(t.id, newTitle)}
                  onDueDateSave={onTaskDueDateSave}
                />
              ))}
            </ul>
          )}
          {isAdmin && (
            <div className="px-3 py-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => onAddTask(section.id, section.milestoneId)}
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 py-1"
                data-testid={`add-task-in-section-${section.id}`}
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add task to this section
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------- Task row --------------------

function TaskRow({
  task,
  isAdmin,
  onStatusToggle,
  onTitleSave,
  onDueDateSave,
}: {
  task: Task;
  isAdmin: boolean;
  onStatusToggle: () => void;
  onTitleSave: (newTitle: string) => void;
  onDueDateSave: (taskId: number, dueDate: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const isDone = task.status === "done";

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) onTitleSave(trimmed);
    setEditing(false);
  };

  return (
    <li className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/20">
      <button
        type="button"
        onClick={onStatusToggle}
        className="flex-shrink-0 h-9 w-9 sm:h-7 sm:w-7 rounded-md flex items-center justify-center hover:bg-muted/40 active:bg-muted/60 transition-colors"
        title={isDone ? "Mark as not done" : "Mark as done"}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
        data-testid={`task-toggle-${task.id}`}
        disabled={!isAdmin}
      >
        {isDone ? (
          <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 sm:h-4 sm:w-4 text-muted-foreground/60" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            className="h-8 text-sm"
            data-testid={`task-title-input-${task.id}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => isAdmin && setEditing(true)}
            className={`text-left w-full font-sans text-sm leading-snug truncate ${
              isDone ? "line-through text-muted-foreground/60" : ""
            } ${isAdmin ? "hover:text-foreground/80" : "cursor-default"}`}
            data-testid={`task-title-${task.id}`}
          >
            {task.title}
          </button>
        )}
      </div>

      <DueDatePill task={task} isAdmin={isAdmin} onDueDateSave={onDueDateSave} />
    </li>
  );
}

// -------------------- Quick-add task sheet --------------------

function QuickAddTaskSheet({
  open,
  onOpenChange,
  projectId,
  milestones,
  sections,
  presetSectionId,
  presetMilestoneId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: number;
  milestones: Milestone[];
  sections: SectionData[];
  presetSectionId: number | null;
  presetMilestoneId: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [milestoneId, setMilestoneId] = useState<number | null>(presetMilestoneId);
  const [sectionId, setSectionId] = useState<number | null>(presetSectionId);
  const [dueDate, setDueDate] = useState("");

  // Reset form when the sheet opens. Side effect, not a memo.
  useEffect(() => {
    if (open) {
      setTitle("");
      setMilestoneId(presetMilestoneId);
      setSectionId(presetSectionId);
      setDueDate("");
    }
  }, [open, presetMilestoneId, presetSectionId]);

  const sectionsForMilestone = useMemo(
    () => sections.filter((s) => milestoneId == null || s.milestoneId === milestoneId),
    [sections, milestoneId],
  );

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        milestoneId,
        sectionId,
      };
      if (dueDate) payload.dueDate = dueDate;
      const r = await apiRequest("POST", `/api/projects/${projectId}/tasks`, payload);
      if (!r.ok) throw new Error(await r.text().catch(() => "Save failed"));
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({ title: "Task added" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't add task",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Add a title", variant: "destructive" });
      return;
    }
    if (!sectionId) {
      toast({ title: "Pick a section", variant: "destructive" });
      return;
    }
    create.mutate();
  };

  const hasUnsaved = title.trim().length > 0 || dueDate.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v && hasUnsaved) {
          if (!window.confirm("Discard this task?")) return;
        }
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-xl sm:max-w-md sm:mx-auto sm:rounded-xl sm:bottom-4 sm:top-auto sm:left-1/2 sm:-translate-x-1/2"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-sans text-base">Add task</SheetTitle>
          <SheetDescription className="font-mono text-[10px] tracking-[0.18em] uppercase">
            Hit Enter to save
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-3 mt-4" data-testid="quick-add-task-form">
          <div>
            <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              Title
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              className="h-10 mt-1"
              data-testid="quick-add-task-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Building
              </label>
              <Select
                value={milestoneId ? String(milestoneId) : ""}
                onValueChange={(v: string) => {
                  const next = Number(v);
                  setMilestoneId(next);
                  // Clear section if it doesn't belong to this milestone
                  const stillValid = sections.find(
                    (s) => s.id === sectionId && s.milestoneId === next,
                  );
                  if (!stillValid) setSectionId(null);
                }}
              >
                <SelectTrigger className="h-10 mt-1" data-testid="quick-add-task-milestone">
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                Section
              </label>
              <Select
                value={sectionId ? String(sectionId) : ""}
                onValueChange={(v: string) => setSectionId(Number(v))}
                disabled={!milestoneId}
              >
                <SelectTrigger className="h-10 mt-1" data-testid="quick-add-task-section">
                  <SelectValue placeholder={milestoneId ? "Pick" : "Pick building first"} />
                </SelectTrigger>
                <SelectContent>
                  {sectionsForMilestone.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              Due date
            </label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 mt-1"
              data-testid="quick-add-task-due"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              className="flex-1 h-11"
              disabled={create.isPending}
              data-testid="quick-add-task-submit"
            >
              {create.isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                if (hasUnsaved && !window.confirm("Discard this task?")) return;
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// -------------------- Schedule view (desktop/iPad-landscape only) --------------------

function ScheduleView({
  milestones,
  sections,
  tasks,
  onSectionTap,
}: {
  milestones: Milestone[];
  sections: SectionData[];
  tasks: Task[];
  onSectionTap: (sectionId: number) => void;
}) {
  // Compute project-wide date range for horizontal scaling
  const range = useMemo(() => {
    const dates: number[] = [];
    for (const s of sections) {
      const a = safeParse(s.startDate);
      const b = safeParse(s.endDate);
      if (a) dates.push(a.getTime());
      if (b) dates.push(b.getTime());
    }
    for (const t of tasks) {
      const a = safeParse(t.startDate);
      const b = safeParse(t.dueDate);
      if (a) dates.push(a.getTime());
      if (b) dates.push(b.getTime());
    }
    if (dates.length === 0) {
      const today = TODAY.getTime();
      return { min: today, max: today + 1000 * 60 * 60 * 24 * 30 };
    }
    return { min: Math.min(...dates), max: Math.max(...dates) };
  }, [sections, tasks]);

  const span = Math.max(1, range.max - range.min);

  // Group sections by milestone, in milestone order
  const grouped = useMemo(() => {
    return milestones
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        milestone: m,
        rows: sections
          .filter((s) => s.milestoneId === m.id)
          .sort((a, b) => a.order - b.order),
      }));
  }, [milestones, sections]);

  const todayPct = ((TODAY.getTime() - range.min) / span) * 100;

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          Schedule
        </p>
        <p className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground tabular-nums">
          {format(new Date(range.min), "MMM d, yyyy")} → {format(new Date(range.max), "MMM d, yyyy")}
        </p>
      </div>
      <div className="relative">
        {/* Today line */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-rose-500/60 z-10 pointer-events-none"
            style={{ left: `calc(${todayPct}% + 200px)`, marginLeft: "-1px" }}
            aria-hidden
          >
            <span className="absolute -top-0.5 -translate-x-1/2 font-mono text-[9px] tracking-wider uppercase text-rose-600 bg-card px-1 py-0.5 rounded">
              Today
            </span>
          </div>
        )}

        <div className="divide-y divide-border/40">
          {grouped.map(({ milestone, rows }) => (
            <div key={milestone.id}>
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/20">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: milestone.colorHex ?? "#3F8A66" }}
                  aria-hidden
                />
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase font-medium">
                  {milestone.title}
                </p>
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/60">
                    No sections
                  </p>
                </div>
              ) : (
                rows.map((s) => {
                  const start = safeParse(s.startDate);
                  const end = safeParse(s.endDate);
                  const sectionTasks = tasks.filter((t) => t.sectionId === s.id);
                  const done = sectionTasks.filter((t) => t.status === "done").length;
                  const pct =
                    sectionTasks.length === 0
                      ? 0
                      : Math.round((done / sectionTasks.length) * 100);
                  let leftPct = 0;
                  let widthPct = 0;
                  if (start && end) {
                    leftPct = ((start.getTime() - range.min) / span) * 100;
                    widthPct = ((end.getTime() - start.getTime()) / span) * 100;
                    widthPct = Math.max(2, widthPct); // min visible width
                  }
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSectionTap(s.id)}
                      className="w-full flex items-center hover:bg-muted/20 active:bg-muted/30 transition-colors group"
                      data-testid={`schedule-row-${s.id}`}
                    >
                      <div className="w-[200px] flex-shrink-0 px-4 py-2.5 text-left">
                        <p className="font-sans text-xs font-medium truncate">{s.title}</p>
                        <p className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground tabular-nums">
                          {done}/{sectionTasks.length} · {dateRange(s.startDate, s.endDate)}
                        </p>
                      </div>
                      <div className="flex-1 relative h-12 px-2">
                        {start && end ? (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-7 rounded-md border overflow-hidden flex items-center"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: `${milestone.colorHex ?? "#3F8A66"}22`,
                              borderColor: `${milestone.colorHex ?? "#3F8A66"}66`,
                            }}
                            title={dateRange(s.startDate, s.endDate)}
                          >
                            <div
                              className="h-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: `${milestone.colorHex ?? "#3F8A66"}66`,
                              }}
                            />
                          </div>
                        ) : (
                          <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground/50 italic">
                            Set dates to display
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------- Main component --------------------

type ViewMode = "stack" | "schedule";
type FilterChip = "all" | "thisweek" | "overdue" | "upcoming" | "done";

export default function ProjectTimeline({
  projectId,
  milestones,
  sections,
  tasks,
  userRole,
}: ProjectTimelineProps) {
  const isMobile = useIsMobile();
  const isAdmin = userRole === "admin" || userRole === "crew";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("stack");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [milestoneFilter, setMilestoneFilter] = useState<number | "all">("all");
  // Default every section to expanded so tasks are immediately visible —
  // users were stuck on a list of section cards with no obvious way to
  // interact with the underlying tasks.
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(sections.map((s) => s.id)),
  );
  // Keep the expansion set in sync as sections load in. We add new section ids
  // to the expanded set but never remove ones the user has manually collapsed.
  const sectionIdsKey = sections.map((s) => s.id).join(",");
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      sections.forEach((s) => next.add(s.id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdsKey]);
  const [addOpen, setAddOpen] = useState(false);
  const [addPreset, setAddPreset] = useState<{ sectionId: number | null; milestoneId: number | null }>({
    sectionId: null,
    milestoneId: null,
  });

  // Status toggle mutation
  const statusMut = useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      const r = await apiRequest("PUT", `/api/tasks/${id}`, { status: done ? "done" : "todo" });
      if (!r.ok) throw new Error(await r.text().catch(() => "Save failed"));
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    },
    onError: () =>
      toast({ title: "Couldn't update task", variant: "destructive" }),
  });

  // Title save mutation
  const titleMut = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const r = await apiRequest("PUT", `/api/tasks/${id}`, { title });
      if (!r.ok) throw new Error(await r.text().catch(() => "Save failed"));
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    },
    onError: () =>
      toast({ title: "Couldn't rename task", variant: "destructive" }),
  });

  // Due-date save mutation — used by the editable pill on each task row.
  // Sending `null` clears the date.
  const dueDateMut = useMutation({
    mutationFn: async ({ id, dueDate }: { id: number; dueDate: string | null }) => {
      const r = await apiRequest("PUT", `/api/tasks/${id}`, { dueDate });
      if (!r.ok) throw new Error(await r.text().catch(() => "Save failed"));
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    },
    onError: () =>
      toast({ title: "Couldn't update due date", variant: "destructive" }),
  });

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter !== "all") {
        const b = bucketForTask(t);
        if (filter !== b) return false;
      }
      if (milestoneFilter !== "all" && t.milestoneId !== milestoneFilter) return false;
      return true;
    });
  }, [tasks, filter, milestoneFilter]);

  // Sections that have at least one filtered task — or all sections if filter=all
  const visibleSections = useMemo(() => {
    if (filter === "all" && milestoneFilter === "all") return sections;
    const sectionIdsWithTasks = new Set(filteredTasks.map((t) => t.sectionId));
    return sections.filter(
      (s) =>
        sectionIdsWithTasks.has(s.id) ||
        (milestoneFilter === "all" || s.milestoneId === milestoneFilter),
    );
  }, [sections, filteredTasks, filter, milestoneFilter]);

  // Sort sections: status-then-date.
  // Section "status" = max bucket of its tasks.
  const sortedSections = useMemo(() => {
    const sectionStatus = new Map<number, number>();
    for (const s of visibleSections) {
      const sTasks = filteredTasks.filter((t) => t.sectionId === s.id);
      let rank = 99;
      for (const t of sTasks) {
        const r = BUCKET_RANK[bucketForTask(t)];
        if (r < rank) rank = r;
      }
      sectionStatus.set(s.id, rank);
    }
    return [...visibleSections].sort((a, b) => {
      const ra = sectionStatus.get(a.id) ?? 99;
      const rb = sectionStatus.get(b.id) ?? 99;
      if (ra !== rb) return ra - rb;
      const da = safeParse(a.startDate);
      const db = safeParse(b.startDate);
      if (da && db) return da.getTime() - db.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.order - b.order;
    });
  }, [visibleSections, filteredTasks]);

  // Group tasks by section for fast lookup
  const tasksBySection = useMemo(() => {
    const m = new Map<number, Task[]>();
    for (const t of filteredTasks) {
      if (t.sectionId == null) continue;
      const arr = m.get(t.sectionId) ?? [];
      arr.push(t);
      m.set(t.sectionId, arr);
    }
    return m;
  }, [filteredTasks]);

  const milestoneById = useMemo(() => {
    const m = new Map<number, Milestone>();
    milestones.forEach((x) => m.set(x.id, x));
    return m;
  }, [milestones]);

  const toggleSection = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setExpanded(new Set(sortedSections.map((s) => s.id)));
  const collapseAll = () => setExpanded(new Set());

  const handleAddTask = (sectionId: number | null, milestoneId: number | null) => {
    setAddPreset({ sectionId, milestoneId });
    setAddOpen(true);
  };

  const handleScheduleSectionTap = (sectionId: number) => {
    setViewMode("stack");
    setExpanded((prev) => new Set([...prev, sectionId]));
    // Scroll the card into view on next paint
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-testid="section-card-${sectionId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const showScheduleToggle = !isMobile;

  return (
    <div className="relative space-y-3 sm:space-y-4 pb-24" data-testid="project-timeline">
      <HeaderStrip tasks={tasks} />

      {/* Filter bar */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 py-1 scrollbar-hide">
        <FilterChipBtn label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChipBtn
          label="Overdue"
          active={filter === "overdue"}
          tone="rose"
          onClick={() => setFilter("overdue")}
        />
        <FilterChipBtn
          label="This week"
          active={filter === "thisweek"}
          tone="amber"
          onClick={() => setFilter("thisweek")}
        />
        <FilterChipBtn
          label="Upcoming"
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
        />
        <FilterChipBtn
          label="Done"
          active={filter === "done"}
          onClick={() => setFilter("done")}
        />
        {milestones.length > 1 && (
          <Select
            value={milestoneFilter === "all" ? "all" : String(milestoneFilter)}
            onValueChange={(v: string) =>
              setMilestoneFilter(v === "all" ? "all" : Number(v))
            }
          >
            <SelectTrigger className="h-8 w-[140px] text-xs flex-shrink-0">
              <Layers className="h-3 w-3 mr-1" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buildings</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />

        {showScheduleToggle && (
          <div className="flex-shrink-0 flex items-center rounded-md border border-border/60 bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("stack")}
              className={`px-2.5 h-8 font-mono text-[10px] tracking-[0.16em] uppercase flex items-center gap-1 transition-colors ${
                viewMode === "stack"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="view-stack"
              title="List view"
            >
              <LayoutList className="h-3 w-3" aria-hidden />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("schedule")}
              className={`px-2.5 h-8 font-mono text-[10px] tracking-[0.16em] uppercase flex items-center gap-1 transition-colors ${
                viewMode === "schedule"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="view-schedule"
              title="Schedule view"
            >
              <GanttChartSquare className="h-3 w-3" aria-hidden />
              Schedule
            </button>
          </div>
        )}
      </div>

      {viewMode === "schedule" && showScheduleToggle ? (
        <ScheduleView
          milestones={milestones}
          sections={sections}
          tasks={tasks}
          onSectionTap={handleScheduleSectionTap}
        />
      ) : (
        <>
          {sortedSections.length > 1 && (
            <div className="flex items-center justify-end gap-2 px-1">
              <button
                type="button"
                onClick={expandAll}
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
              >
                Expand all
              </button>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button
                type="button"
                onClick={collapseAll}
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
              >
                Collapse all
              </button>
            </div>
          )}

          {sortedSections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
              <CalendarDays
                className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2"
                aria-hidden
              />
              <p className="font-sans text-sm text-muted-foreground">
                {filter === "all"
                  ? "No sections yet"
                  : "No tasks match this filter"}
              </p>
              {filter !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="mt-2 font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/70 hover:text-foreground"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedSections.map((s) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  milestone={milestoneById.get(s.milestoneId) ?? null}
                  tasks={tasksBySection.get(s.id) ?? []}
                  expanded={expanded.has(s.id)}
                  onToggle={() => toggleSection(s.id)}
                  isAdmin={isAdmin}
                  onTaskStatusToggle={(t) =>
                    statusMut.mutate({ id: t.id, done: t.status !== "done" })
                  }
                  onAddTask={(sectionId, milestoneId) =>
                    handleAddTask(sectionId, milestoneId)
                  }
                  onTaskTitleSave={(taskId, title) =>
                    titleMut.mutate({ id: taskId, title })
                  }
                  onTaskDueDateSave={(taskId, dueDate) =>
                    dueDateMut.mutate({ id: taskId, dueDate })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating add button — always reachable */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => handleAddTask(null, null)}
          className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-30 h-14 w-14 rounded-full bg-foreground text-background shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
          data-testid="floating-add-task"
          title="Add task"
          aria-label="Add task"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <QuickAddTaskSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        milestones={milestones}
        sections={sections}
        presetSectionId={addPreset.sectionId}
        presetMilestoneId={addPreset.milestoneId}
      />
    </div>
  );
}

// -------------------- filter chip --------------------

function FilterChipBtn({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: "rose" | "amber";
  onClick: () => void;
}) {
  const base =
    "flex-shrink-0 h-8 px-3 rounded-full font-mono text-[10px] tracking-[0.16em] uppercase transition-colors border";
  if (active) {
    if (tone === "rose")
      return (
        <button onClick={onClick} className={`${base} bg-rose-600 border-rose-600 text-white`}>
          {label}
        </button>
      );
    if (tone === "amber")
      return (
        <button onClick={onClick} className={`${base} bg-amber-500 border-amber-500 text-white`}>
          {label}
        </button>
      );
    return (
      <button onClick={onClick} className={`${base} bg-foreground border-foreground text-background`}>
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40`}
    >
      {label}
    </button>
  );
}
