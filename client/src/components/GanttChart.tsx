import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronDown, ChevronUp, ChevronRight, ZoomIn, ZoomOut, Plus, Trash2, Pencil, FolderPlus, Check, X, MoreVertical, CheckSquare, Square, GripVertical, Palette, Search } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateSection, useUpdateSection, useDeleteSection, useCreateMilestone, useUpdateMilestone, useCreateTask, useUpdateTask } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import type { InsertMilestone } from "@shared/schema";
import { ListPlus } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import type { PaintColor } from "@shared/schema";

interface Milestone {
  id: number;
  title: string;
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  completed: boolean;
  order: number;
  colorHex?: string | null;
  paintColorIds?: number[] | null;
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
  order: number | null;
}

interface GanttChartProps {
  projectId: number;
  milestones: Milestone[];
  sections: SectionData[];
  tasks: Task[];
  userRole: string;
}

const BUILDING_COLORS = [
  "#173B2F", "#2E6B4F", "#3F8A66", "#B87333", "#4D7A68",
  "#5A7D4C", "#8C6239", "#6B8E23", "#7A6A58", "#3E6F73",
  "#8B3F2F", "#4E6B8A", "#C49A6C", "#5B4B8A", "#7C9A5A",
];

const TRADE_PRESETS = [
  "Painting", "Electrical", "Plumbing", "Framing", "Drywall",
  "Flooring", "Cabinetry", "Trim", "HVAC", "Roofing",
  "Demolition", "Insulation", "Tiling", "Countertops",
];

type DrillLevel = "buildings" | "tasks";

interface BuildingInfo {
  id: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  totalTasks: number;
  doneTasks: number;
  completed: boolean;
  colorIndex: number;
  colorHex?: string | null;
  paintColorIds?: number[] | null;
}

interface RoomInfo {
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
  parentColorHex?: string | null;
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

function BuildingColourPicker({ currentHex, onSelect }: { currentHex: string | null | undefined; onSelect: (hex: string | null) => void }) {
  const QUICK_COLOURS = [
    "#1E3A2F", "#2D5A47", "#3D7A5F", "#8B7355", "#6B8E73",
    "#4A6741", "#7A6B5D", "#556B2F", "#C4A882", "#3B5249",
    "#8B4513", "#2F4F4F", "#5D4037", "#6B4423", "#4682B4",
    "#708090",
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()} data-testid="button-building-colour-picker">
          {currentHex ? (
            <div className="w-4 h-4 rounded-sm border border-border/60" style={{ backgroundColor: currentHex }} />
          ) : (
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Building Colour</p>
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_COLOURS.map((hex) => (
            <button
              key={hex}
              className={`w-8 h-8 rounded-sm border transition-all ${currentHex === hex ? "ring-2 ring-offset-1 ring-foreground" : "border-border/40 hover:border-border"}`}
              style={{ backgroundColor: hex }}
              onClick={(e) => { e.stopPropagation(); onSelect(hex); }}
              data-testid={`colour-option-${hex.slice(1)}`}
            />
          ))}
        </div>
        {currentHex && (
          <button
            className="w-full text-[10px] text-muted-foreground mt-2 hover:text-foreground transition-colors text-center py-1"
            onClick={(e) => { e.stopPropagation(); onSelect(null); }}
            data-testid="button-clear-building-colour"
          >
            Remove colour
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PaintColourSwatches({ paintColorIds }: { paintColorIds: number[] | null | undefined }) {
  const { data: colors } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors", "by-ids", ...(paintColorIds || [])],
    queryFn: async () => {
      if (!paintColorIds || paintColorIds.length === 0) return [];
      const res = await fetch(`/api/paint-colors`, { credentials: "include" });
      if (!res.ok) return [];
      const all: PaintColor[] = await res.json();
      return all.filter(c => paintColorIds.includes(c.id));
    },
    enabled: !!paintColorIds && paintColorIds.length > 0,
  });

  if (!colors || colors.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5" data-testid="paint-colour-swatches">
      {colors.slice(0, 4).map((c) => (
        <Tooltip key={c.id}>
          <TooltipTrigger asChild>
            <div
              className="w-3 h-3 rounded-full border border-border/60 shrink-0"
              style={{ backgroundColor: c.hex }}
              data-testid={`paint-swatch-${c.id}`}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{c.name} ({c.code})</p>
            <p className="text-[10px] text-muted-foreground">{c.brand}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      {colors.length > 4 && (
        <span className="text-[9px] text-muted-foreground">+{colors.length - 4}</span>
      )}
    </div>
  );
}

function PaintColourPanel({ paintColorIds, onUpdate, isAdmin }: { paintColorIds: number[] | null | undefined; onUpdate: (ids: number[]) => void; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: linkedColors } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors", "linked", ...(paintColorIds || [])],
    queryFn: async () => {
      if (!paintColorIds || paintColorIds.length === 0) return [];
      const res = await fetch(`/api/paint-colors`, { credentials: "include" });
      if (!res.ok) return [];
      const all: PaintColor[] = await res.json();
      return all.filter(c => paintColorIds.includes(c.id));
    },
    enabled: !!paintColorIds && paintColorIds.length > 0,
  });

  const { data: allColors } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors"],
    enabled: expanded && isAdmin,
  });

  const filteredColors = useMemo(() => {
    if (!allColors) return [];
    const ids = paintColorIds || [];
    const available = allColors.filter(c => !ids.includes(c.id));
    if (!searchTerm.trim()) return available.slice(0, 20);
    const term = searchTerm.toLowerCase();
    return available.filter(c =>
      c.name.toLowerCase().includes(term) || c.code?.toLowerCase().includes(term) || c.brand?.toLowerCase().includes(term)
    ).slice(0, 20);
  }, [allColors, paintColorIds, searchTerm]);

  const handleAdd = (id: number) => {
    onUpdate([...(paintColorIds || []), id]);
  };

  const handleRemove = (id: number) => {
    onUpdate((paintColorIds || []).filter(x => x !== id));
  };

  return (
    <div className="border border-border/40 rounded-sm bg-muted/20" data-testid="paint-colour-panel">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-paint-colours"
      >
        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex-1">
          Paint Colours {paintColorIds && paintColorIds.length > 0 ? `(${paintColorIds.length})` : ""}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {linkedColors && linkedColors.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="linked-paint-colours">
              {linkedColors.map((c) => (
                <div key={c.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-border/60 bg-background">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                  <span className="text-[10px] font-medium">{c.name}</span>
                  {isAdmin && (
                    <button onClick={() => handleRemove(c.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-0.5" data-testid={`button-remove-paint-colour-${c.id}`}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search paint colours..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 text-xs pl-7"
                  data-testid="input-search-paint-colours"
                />
              </div>
              {filteredColors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-0.5" data-testid="paint-colour-search-results">
                  {filteredColors.map((c) => (
                    <button
                      key={c.id}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-muted/60 transition-colors text-left"
                      onClick={() => handleAdd(c.id)}
                      data-testid={`button-add-paint-colour-${c.id}`}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0 border border-border/40" style={{ backgroundColor: c.hex }} />
                      <span className="text-[10px] font-medium truncate">{c.name}</span>
                      <span className="text-[9px] text-muted-foreground ml-auto">{c.code}</span>
                    </button>
                  ))}
                </div>
              )}
              {filteredColors.length === 0 && searchTerm && (
                <p className="text-[10px] text-muted-foreground text-center py-2">No colours found</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GanttChart({ projectId, milestones, sections, tasks, userRole }: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("buildings");
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());

  const [addingBuilding, setAddingBuilding] = useState(false);
  const [newBuildingTitle, setNewBuildingTitle] = useState("");
  const [newBuildingStart, setNewBuildingStart] = useState("");
  const [newBuildingEnd, setNewBuildingEnd] = useState("");
  const [newBuildingColorHex, setNewBuildingColorHex] = useState<string | null>(null);
  const [addingRoomFor, setAddingRoomFor] = useState<number | null>(null);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomStart, setNewRoomStart] = useState("");
  const [newRoomEnd, setNewRoomEnd] = useState("");
  const [editingSection, setEditingSection] = useState<SectionData | null>(null);
  const [editSectionForm, setEditSectionForm] = useState({ title: "", startDate: "", endDate: "" });
  const [addingTask, setAddingTask] = useState<{ milestoneId: number; sectionId: number | null } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [resizePreview, setResizePreview] = useState<{ rowId: number; rowType: BarItem["type"]; startDate: Date; endDate: Date } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { mutate: createMilestone, isPending: creatingMilestone } = useCreateMilestone();
  const { mutate: updateMilestone } = useUpdateMilestone();
  const { mutate: createSection, isPending: creatingSection } = useCreateSection();
  const { mutate: updateSection, isPending: updatingSection } = useUpdateSection();
  const { mutate: deleteSection } = useDeleteSection();
  const { mutate: createTask, isPending: creatingTask } = useCreateTask();
  const { mutate: updateTask } = useUpdateTask();

  const isAdmin = userRole !== "client";

  const toggleBuilding = useCallback((buildingId: number) => {
    setExpandedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (selectedBuildingId && !milestones.some(m => m.id === selectedBuildingId)) {
      setSelectedBuildingId(null);
      setSelectedRoomId(null);
      setDrillLevel("buildings");
    }
  }, [milestones, selectedBuildingId]);

  useEffect(() => {
    if (selectedRoomId !== null && selectedRoomId !== -1 && !sections.some(s => s.id === selectedRoomId)) {
      setSelectedRoomId(null);
      if (selectedBuildingId) {
        setDrillLevel("buildings");
        setSelectedBuildingId(null);
      }
    }
  }, [sections, selectedRoomId, selectedBuildingId]);

  const buildingInfos = useMemo((): BuildingInfo[] => {
    const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
    return sorted.map((ms, idx) => {
      const colorIndex = idx % BUILDING_COLORS.length;
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

      const today = new Date();
      const bStart = ms.startDate ? parseISO(ms.startDate)
        : allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today;
      let bEnd = ms.endDate ? parseISO(ms.endDate)
        : allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : addDays(bStart, 3);
      if (bEnd.getTime() <= bStart.getTime()) {
        bEnd = addDays(bStart, 3);
      }

      return {
        id: ms.id, title: ms.title, startDate: bStart, endDate: bEnd,
        progress, totalTasks, doneTasks, completed: !!ms.completed, colorIndex,
        colorHex: ms.colorHex, paintColorIds: ms.paintColorIds,
      };
    });
  }, [milestones, sections, tasks]);

  const roomInfosForBuilding = useCallback((buildingId: number): RoomInfo[] => {
    const building = buildingInfos.find(b => b.id === buildingId);
    if (!building) return [];
    const bSections = sections.filter(s => s.milestoneId === buildingId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const bTasks = tasks.filter(t => t.milestoneId === buildingId);

    return bSections.map(sec => {
      const secTasks = bTasks.filter(t => t.sectionId === sec.id);
      const secTotal = secTasks.length;
      const secDone = secTasks.filter(t => t.status === "done").length;
      const secProgress = secTotal > 0 ? Math.round((secDone / secTotal) * 100) : sec.completed ? 100 : 0;

      const secDates: Date[] = [];
      if (sec.startDate) secDates.push(parseISO(sec.startDate));
      if (sec.endDate) secDates.push(parseISO(sec.endDate));
      secTasks.forEach(t => { if (t.dueDate) secDates.push(parseISO(t.dueDate)); });

      const secToday = new Date();
      const secStart = sec.startDate ? parseISO(sec.startDate)
        : secDates.length > 0 ? new Date(Math.min(...secDates.map(d => d.getTime()))) : secToday;
      let secEnd = sec.endDate ? parseISO(sec.endDate)
        : secDates.length > 0 ? new Date(Math.max(...secDates.map(d => d.getTime()))) : addDays(secStart, 3);
      if (secEnd.getTime() <= secStart.getTime()) {
        secEnd = addDays(secStart, 3);
      }

      return {
        id: sec.id, milestoneId: sec.milestoneId, title: sec.title,
        startDate: secStart, endDate: secEnd, progress: secProgress,
        totalTasks: secTotal, doneTasks: secDone, completed: !!sec.completed,
        colorIndex: building.colorIndex, parentColorHex: building.colorHex,
      };
    });
  }, [buildingInfos, sections, tasks]);

  const selectedBuilding = buildingInfos.find(b => b.id === selectedBuildingId) || null;
  const selectedRoom = useMemo(() => {
    if (!selectedBuildingId || selectedRoomId === null) return null;
    if (selectedRoomId === -1) return { id: -1, title: "General Tasks", milestoneId: selectedBuildingId, startDate: null, endDate: null, progress: 0, totalTasks: 0, doneTasks: 0, completed: false, colorIndex: 0, parentColorHex: null } as RoomInfo;
    return roomInfosForBuilding(selectedBuildingId).find(r => r.id === selectedRoomId) || null;
  }, [selectedBuildingId, selectedRoomId, roomInfosForBuilding]);

  const taskInfos = useMemo((): TaskInfo[] => {
    if (drillLevel !== "tasks" || !selectedBuildingId || selectedRoomId === null) return [];
    const building = buildingInfos.find(b => b.id === selectedBuildingId);
    if (!building) return [];

    let filteredTasks: Task[];
    if (selectedRoomId === -1) {
      filteredTasks = tasks.filter(t => t.milestoneId === selectedBuildingId && !t.sectionId);
    } else {
      filteredTasks = tasks.filter(t => t.sectionId === selectedRoomId);
    }

    filteredTasks = [...filteredTasks].sort((a, b) => (a.order || 0) - (b.order || 0));

    const taskToday = new Date();
    return filteredTasks.map(t => {
      const taskDate = t.dueDate ? parseISO(t.dueDate) : addDays(taskToday, 1);
      const taskStart = t.dueDate ? addDays(taskDate, -3) : taskToday;
      return {
        id: t.id, title: t.title,
        startDate: taskStart,
        endDate: taskDate, status: t.status, colorIndex: building.colorIndex,
      };
    });
  }, [drillLevel, selectedBuildingId, selectedRoomId, buildingInfos, tasks]);

  type BarItem = { startDate: Date | null; endDate: Date | null; colorIndex: number; progress?: number; status?: string | null; type: "building" | "room" | "task"; id: number; title: string; colorHex?: string | null };

  const nestedRows: BarItem[] = useMemo(() => {
    const rows: BarItem[] = [];
    buildingInfos.forEach(b => {
      rows.push({ ...b, type: "building" as const });
      if (expandedBuildings.has(b.id)) {
        const rooms = roomInfosForBuilding(b.id);
        rooms.forEach(r => {
          rows.push({ ...r, type: "room" as const, colorHex: r.parentColorHex });
        });
        const unsectionedTasks = tasks.filter(t => t.milestoneId === b.id && !t.sectionId);
        if (unsectionedTasks.length > 0) {
          const genDone = unsectionedTasks.filter(t => t.status === "done").length;
          const genTotal = unsectionedTasks.length;
          const genProgress = genTotal > 0 ? Math.round((genDone / genTotal) * 100) : 0;
          rows.push({
            id: -b.id,
            title: "General Tasks",
            startDate: b.startDate,
            endDate: b.endDate,
            colorIndex: b.colorIndex,
            colorHex: b.colorHex,
            type: "room" as const,
            progress: genProgress,
          });
        }
      }
    });
    return rows;
  }, [buildingInfos, expandedBuildings, roomInfosForBuilding, tasks]);

  const currentRows: BarItem[] = useMemo(() => {
    if (drillLevel === "buildings") return nestedRows;
    return taskInfos.map(t => ({ ...t, type: "task" as const }));
  }, [drillLevel, nestedRows, taskInfos]);

  const rowsWithDates = currentRows.filter(r => r.startDate && r.endDate);

  const { timelineStart, timelineEnd, months, dayWidth } = useMemo(() => {
    if (rowsWithDates.length === 0) {
      let fallbackStart: Date | null = null;
      let fallbackEnd: Date | null = null;
      if (drillLevel === "tasks" && selectedRoom && selectedRoom.startDate) {
        fallbackStart = selectedRoom.startDate;
        fallbackEnd = selectedRoom.endDate || addDays(selectedRoom.startDate, 30);
      } else if (drillLevel === "tasks" && selectedBuilding && selectedBuilding.startDate) {
        fallbackStart = selectedBuilding.startDate;
        fallbackEnd = selectedBuilding.endDate || addDays(selectedBuilding.startDate, 60);
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
  }, [rowsWithDates, zoomLevel, drillLevel, selectedBuilding, selectedRoom]);

  const totalDays = differenceInDays(timelineEnd, timelineStart);
  const totalWidth = totalDays * dayWidth;

  const getBarPosition = (start: Date, end: Date) => {
    const left = differenceInDays(start, timelineStart) * dayWidth;
    const width = Math.max(differenceInDays(end, start) * dayWidth, 16);
    return { left, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart) * dayWidth;

  const ROW_HEIGHT = 36;
  const ROOM_ROW_HEIGHT = 30;
  const HEADER_HEIGHT = 34;

  const handleAddBuilding = () => {
    if (!newBuildingTitle.trim()) return;
    const payload: InsertMilestone & { projectId: number } = {
      projectId,
      title: newBuildingTitle.trim(),
      startDate: newBuildingStart || null,
      endDate: newBuildingEnd || null,
      colorHex: newBuildingColorHex,
    };
    createMilestone(payload, {
      onSuccess: () => {
        toast({ title: "Building added" });
        setNewBuildingTitle(""); setNewBuildingStart(""); setNewBuildingEnd(""); setNewBuildingColorHex(null); setAddingBuilding(false);
      },
      onError: () => toast({ title: "Failed to add building", variant: "destructive" }),
    });
  };

  const handleAddRoom = (milestoneId: number) => {
    if (!newRoomTitle.trim()) return;
    createSection(
      { projectId, milestoneId, title: newRoomTitle.trim(), startDate: newRoomStart || null, endDate: newRoomEnd || null },
      {
        onSuccess: () => {
          toast({ title: "Room added" });
          setNewRoomTitle(""); setNewRoomStart(""); setNewRoomEnd(""); setAddingRoomFor(null);
          setExpandedBuildings(prev => new Set(prev).add(milestoneId));
        },
        onError: () => toast({ title: "Failed to add room", variant: "destructive" }),
      }
    );
  };

  const handleEditSection = () => {
    if (!editingSection || !editSectionForm.title.trim()) return;
    updateSection(
      { id: editingSection.id, projectId, title: editSectionForm.title.trim(), startDate: editSectionForm.startDate || null, endDate: editSectionForm.endDate || null },
      {
        onSuccess: () => { toast({ title: "Room updated" }); setEditingSection(null); },
        onError: () => toast({ title: "Failed to update room", variant: "destructive" }),
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

  const handleBuildingColourChange = useCallback((buildingId: number, hex: string | null) => {
    updateMilestone({ id: buildingId, projectId, colorHex: hex }, {
      onError: () => toast({ title: "Failed to update colour", variant: "destructive" }),
    });
  }, [updateMilestone, projectId, toast]);

  const handleDragStart = (id: number) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: number) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const handleRoomDrop = useCallback((buildingId: number, targetId: number) => {
    if (dragId === null || dragId === targetId || targetId < 0) { setDragId(null); setDragOverId(null); return; }
    const draggedRoom = sections.find(s => s.id === dragId);
    if (!draggedRoom) { setDragId(null); setDragOverId(null); return; }

    if (draggedRoom.milestoneId !== buildingId) {
      updateSection({ id: draggedRoom.id, projectId } as any);
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const buildingSections = sections.filter(s => s.milestoneId === buildingId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const dragIdx = buildingSections.findIndex(s => s.id === dragId);
    const targetIdx = buildingSections.findIndex(s => s.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...buildingSections];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    reordered.forEach((s, i) => {
      if ((s.order || 0) !== i) {
        updateSection({ id: s.id, projectId, order: i });
      }
    });
    setDragId(null);
    setDragOverId(null);
  }, [dragId, sections, updateSection, projectId]);

  const handleDrop = useCallback((targetId: number) => {
    if (dragId === null || dragId === targetId) { setDragId(null); setDragOverId(null); return; }

    if (drillLevel === "buildings") {
      const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
      const dragIdx = sorted.findIndex(m => m.id === dragId);
      const targetIdx = sorted.findIndex(m => m.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return;
      const reordered = [...sorted];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      reordered.forEach((m, i) => {
        if ((m.order || 0) !== i) {
          updateMilestone({ id: m.id, projectId, order: i });
        }
      });
    } else if (drillLevel === "tasks" && selectedRoomId !== null) {
      const roomTasks = tasks.filter(t =>
        selectedRoomId === -1 ? (t.milestoneId === selectedBuildingId && !t.sectionId) : t.sectionId === selectedRoomId
      ).sort((a, b) => (a.order || 0) - (b.order || 0));
      const dragIdx = roomTasks.findIndex(t => t.id === dragId);
      const targetIdx = roomTasks.findIndex(t => t.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return;
      const reordered = [...roomTasks];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      reordered.forEach((t, i) => {
        if ((t.order || 0) !== i) {
          updateTask({ id: t.id, order: i });
        }
      });
    }

    setDragId(null);
    setDragOverId(null);
  }, [dragId, drillLevel, milestones, tasks, selectedBuildingId, selectedRoomId, updateMilestone, updateTask, projectId]);

  const drillIntoRoom = (buildingId: number, roomId: number) => {
    setSelectedBuildingId(buildingId);
    setSelectedRoomId(roomId);
    setDrillLevel("tasks");
  };

  const goBack = () => {
    setSelectedBuildingId(null);
    setSelectedRoomId(null);
    setDrillLevel("buildings");
  };

  const renderBar = (row: BarItem) => {
    if (!row.startDate || !row.endDate) return null;

    const displayStart = resizePreview?.rowId === row.id && resizePreview?.rowType === row.type ? resizePreview.startDate : row.startDate;
    const displayEnd = resizePreview?.rowId === row.id && resizePreview?.rowType === row.type ? resizePreview.endDate : row.endDate;

    const { left, width } = getBarPosition(displayStart, displayEnd);
    const visibleWidth = Math.max(width, 36);
    const barColor = row.colorHex || BUILDING_COLORS[row.colorIndex];
    const rowH = row.type === "room" ? ROOM_ROW_HEIGHT : ROW_HEIGHT;
    const canResize = isAdmin && row.startDate && row.endDate && row.id > 0;
    const commitResize = (start: Date, end: Date) => {
      if (row.type === "building") updateMilestone({ id: row.id, projectId, startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd") });
      else if (row.type === "room") updateSection({ id: row.id, projectId, startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd") } as any);
      else updateTask({ id: row.id, dueDate: format(end, "yyyy-MM-dd") } as any);
    };
    const bindResize = (edge: "start" | "end", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const originalStart = row.startDate!;
      const originalEnd = row.endDate!;
      const rangeDays = Math.max(differenceInDays(originalEnd, originalStart), 1);
      const pxPerDay = Math.max(getBarPosition(originalStart, originalEnd).width, 36) / rangeDays;
      let lastX = startX;
      const onMove = (moveEvent: MouseEvent) => {
        lastX = moveEvent.clientX;
        const deltaDays = (lastX - startX) / pxPerDay;
        if (edge === "start") {
          const nextStart = addDays(originalStart, deltaDays);
          if (nextStart >= originalEnd) return;
          setResizePreview({ rowId: row.id, rowType: row.type, startDate: nextStart, endDate: originalEnd });
        } else {
          const nextEnd = addDays(originalEnd, deltaDays);
          if (nextEnd <= originalStart) return;
          setResizePreview({ rowId: row.id, rowType: row.type, startDate: originalStart, endDate: nextEnd });
        }
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const finalDelta = Math.round((lastX - startX) / pxPerDay);
        if (finalDelta === 0) { setResizePreview(null); return; }
        const finalStart = edge === "start" ? addDays(originalStart, finalDelta) : originalStart;
        const finalEnd = edge === "end" ? addDays(originalEnd, finalDelta) : originalEnd;
        if ((edge === "start" && finalStart < originalEnd) || (edge === "end" && finalEnd > originalStart)) {
          commitResize(finalStart, finalEnd);
        }
        setResizePreview(null);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    if (row.type === "task") {
      const isDone = row.status === "done";
      const barHeight = 10;
      const topOffset = (rowH - barHeight) / 2;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute rounded-sm select-none cursor-default min-w-[20px]"
              style={{ left, width: visibleWidth, top: topOffset, height: barHeight, backgroundColor: barColor, opacity: isDone ? 0.55 : 0.95 }}
              data-testid={`gantt-bar-task-${row.id}`}
            >
              {canResize && (
                <>
                  <div
                  className="absolute left-0 top-0 h-full w-5 cursor-ew-resize bg-transparent z-20"
                  onMouseDown={(e) => bindResize("start", e)}
                    data-testid={`handle-start-${row.type}-${row.id}`}
                    aria-label="Resize start date"
                  >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-white/80 shadow-sm" />
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full w-5 cursor-ew-resize bg-transparent z-20"
                    onMouseDown={(e) => bindResize("end", e)}
                    data-testid={`handle-end-${row.type}-${row.id}`}
                    aria-label="Resize finish date"
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-white/80 shadow-sm" />
                  </div>
                </>
              )}
              {isDone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-px bg-foreground/30" />
                </div>
              )}
              {width > 80 && displayEnd && (
                <span className="absolute inset-0 flex items-center px-1.5 text-[8px] font-medium text-white/80 truncate">
                  {format(displayEnd, "MMM d")}
                </span>
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

    const isRoom = row.type === "room";
    const barHeight = isRoom ? 14 : 18;
    const topOffset = (rowH - barHeight) / 2;
    const progress = row.progress || 0;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute rounded-sm overflow-hidden border border-border/20 select-none cursor-default min-w-[36px]"
            style={{ left, width: visibleWidth, top: topOffset, height: barHeight, backgroundColor: `${barColor}22` }}
            data-testid={`gantt-bar-${row.type}-${row.id}`}
          >
            {canResize && (
              <>
                <div
                  className="absolute left-0 top-0 h-full w-5 cursor-ew-resize bg-transparent z-20"
                  onMouseDown={(e) => bindResize("start", e)}
                  data-testid={`handle-start-${row.type}-${row.id}`}
                  aria-label="Resize start date"
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-white/80 shadow-sm" />
                </div>
                <div
                  className="absolute right-0 top-0 h-full w-5 cursor-ew-resize bg-transparent z-20"
                  onMouseDown={(e) => bindResize("end", e)}
                  data-testid={`handle-end-${row.type}-${row.id}`}
                  aria-label="Resize finish date"
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-white/80 shadow-sm" />
                </div>
              </>
            )}
            <div className="h-full" style={{ width: `${progress}%`, backgroundColor: barColor, opacity: isRoom ? 0.9 : 1 }} />
            <span className="absolute inset-0 flex items-center justify-between px-1.5 text-[9px] font-medium text-foreground/70 truncate">
              <span>{width > 50 ? `${progress}%` : ""}</span>
              {width > 80 && displayStart && displayEnd && (
                <span className="text-[8px] text-foreground/50">
                  {format(displayStart, "MMM d")} – {format(displayEnd, "MMM d")}
                </span>
              )}
              {width > 40 && width <= 80 && displayStart && (
                <span className="text-[8px] text-foreground/50">
                  {format(displayStart, "MMM d")}
                </span>
              )}
            </span>
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

  const showBreadcrumb = drillLevel === "tasks";

  const currentProgress = useMemo(() => {
    if (drillLevel === "tasks" && selectedRoom) return selectedRoom.progress;
    return null;
  }, [drillLevel, selectedRoom]);

  const scopeHeading = useMemo(() => {
    if (drillLevel === "buildings") return "Buildings";
    return "Tasks";
  }, [drillLevel]);

  return (
    <div className="space-y-4" data-testid="gantt-chart">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {drillLevel === "tasks" && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} data-testid="button-gantt-back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h3 className="font-serif text-lg font-semibold tracking-tight uppercase" data-testid="text-gantt-heading">
            Project Timeline
          </h3>
          {drillLevel === "buildings" && (
            <Badge variant="outline" className="text-xs" data-testid="badge-building-count">
              {milestones.length} {milestones.length === 1 ? "building" : "buildings"}
            </Badge>
          )}
          {currentProgress !== null && (
            <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-drill-progress">
              {currentProgress}% complete
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && drillLevel === "buildings" && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingBuilding(true)} data-testid="button-add-building-timeline">
              <Plus className="h-3 w-3" />
              Building
            </Button>
          )}
          {isAdmin && drillLevel === "tasks" && selectedBuildingId && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAddingTask({ milestoneId: selectedBuildingId, sectionId: selectedRoomId === -1 ? null : selectedRoomId }); setNewTaskTitle(""); setNewTaskDueDate(""); }} data-testid="button-add-task-timeline">
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
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline" data-testid="button-breadcrumb-all">
            All Buildings
          </button>
          {selectedBuilding && (
            <>
              <span className="text-muted-foreground">›</span>
              <span className="text-muted-foreground" data-testid="text-breadcrumb-building">
                {selectedBuilding.title}
              </span>
            </>
          )}
          {selectedRoom && (
            <>
              <span className="text-muted-foreground">›</span>
              <span className="font-medium text-foreground" data-testid="text-breadcrumb-room">
                {selectedRoom.title}
              </span>
            </>
          )}
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

      {drillLevel === "tasks" && selectedBuilding && (
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border/40 sticky top-0 z-10"
            style={{ backgroundColor: selectedBuilding.colorHex ? `${selectedBuilding.colorHex}15` : undefined, borderLeftWidth: "3px", borderLeftColor: selectedBuilding.colorHex || "transparent" }}
            data-testid="building-header-band"
          >
            <span className="text-xs font-semibold uppercase tracking-wide">{selectedBuilding.title}</span>
            {selectedRoom && selectedRoom.id !== -1 && (
              <>
                <span className="text-muted-foreground text-xs">›</span>
                <span className="text-xs font-medium">{selectedRoom.title}</span>
              </>
            )}
          </div>
          <PaintColourPanel
            paintColorIds={selectedBuilding.paintColorIds}
            isAdmin={isAdmin}
            onUpdate={(ids) => {
              const building = milestones.find(m => m.id === selectedBuildingId);
              if (building) {
                updateMilestone({ id: building.id, projectId, paintColorIds: ids });
              }
            }}
          />
        </div>
      )}

      {addingBuilding && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-building-inline">
          <Input placeholder="Building name (e.g., Cottage, Boathouse, Bunkie)" value={newBuildingTitle} onChange={e => setNewBuildingTitle(e.target.value)} className="flex-1" autoFocus data-testid="input-building-title" onKeyDown={e => { if (e.key === "Enter") handleAddBuilding(); }} />
          <DateField label="Start date" value={newBuildingStart} onChange={setNewBuildingStart} placeholder="Start date" testId="button-building-start-date" />
          <DateField label="End date" value={newBuildingEnd} onChange={setNewBuildingEnd} placeholder="End date" testId="button-building-end-date" />
          <BuildingColourPicker currentHex={newBuildingColorHex} onSelect={setNewBuildingColorHex} />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleAddBuilding} disabled={creatingMilestone || !newBuildingTitle.trim()} data-testid="button-confirm-add-building">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingBuilding(false); setNewBuildingTitle(""); setNewBuildingStart(""); setNewBuildingEnd(""); setNewBuildingColorHex(null); }} data-testid="button-cancel-add-building">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {addingRoomFor !== null && isAdmin && (
        <div className="space-y-2 p-3 border border-border/60 rounded-sm bg-muted/20" data-testid="form-add-room-inline">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Room or space name (e.g., Kitchen, Primary Suite, Deck)" value={newRoomTitle} onChange={e => setNewRoomTitle(e.target.value)} className="flex-1" autoFocus data-testid="input-room-title" onKeyDown={e => { if (e.key === "Enter") handleAddRoom(addingRoomFor); }} />
            <DateField label="Start" value={newRoomStart} onChange={setNewRoomStart} placeholder="Start" testId="button-room-start-date" />
            <DateField label="End" value={newRoomEnd} onChange={setNewRoomEnd} placeholder="End" testId="button-room-end-date" />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => handleAddRoom(addingRoomFor)} disabled={creatingSection || !newRoomTitle.trim()} data-testid="button-confirm-add-room">
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingRoomFor(null)} data-testid="button-cancel-add-room">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1" data-testid="trade-preset-chips">
            {TRADE_PRESETS.map((trade) => (
              <button
                key={trade}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${newRoomTitle === trade ? "bg-foreground text-background border-foreground" : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"}`}
                onClick={() => setNewRoomTitle(trade)}
                data-testid={`trade-chip-${trade.toLowerCase()}`}
              >
                {trade}
              </button>
            ))}
          </div>
        </div>
      )}

      {editingSection && isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 border border-primary/30 rounded-sm bg-muted/20" data-testid="form-edit-section-inline">
          <Input placeholder="Name" value={editSectionForm.title} onChange={e => setEditSectionForm({ ...editSectionForm, title: e.target.value })} className="flex-1" autoFocus data-testid="input-edit-section-title" onKeyDown={e => { if (e.key === "Enter") handleEditSection(); }} />
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

      {currentRows.length === 0 && !addingBuilding && !addingRoomFor && !addingTask ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-gantt-empty">
            {drillLevel === "buildings" && "No buildings yet. Add a building to start organising your project timeline."}
            {drillLevel === "tasks" && "No tasks in this room yet. Add a task to get started."}
          </p>
        </div>
      ) : currentRows.length > 0 && (
        <div className="border border-border/50 rounded-sm overflow-hidden">
          <div className="flex">
            <div className="w-64 min-w-[256px] shrink-0 border-r border-border/50 bg-muted/30">
              <div className="border-b border-border/50 flex items-center px-2" style={{ height: HEADER_HEIGHT }}>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground" data-testid="text-scope-header">{scopeHeading}</span>
              </div>

              {drillLevel === "buildings" && nestedRows.map((row) => {
                if (row.type === "building") {
                  const building = buildingInfos.find(b => b.id === row.id)!;
                  const accentColor = building.colorHex || BUILDING_COLORS[building.colorIndex];
                  const isExpanded = expandedBuildings.has(building.id);
                  const roomCount = sections.filter(s => s.milestoneId === building.id).length;
                  return (
                    <div
                      key={`building-${building.id}`}
                      className={`border-b border-border/30 flex items-center gap-1 px-0 hover:bg-muted/20 transition-colors group ${dragOverId === building.id ? "bg-muted/40" : ""}`}
                      style={{ height: ROW_HEIGHT, borderLeft: `3px solid ${accentColor}` }}
                      draggable={isAdmin}
                      onDragStart={() => handleDragStart(building.id)}
                      onDragOver={(e) => handleDragOver(e, building.id)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => { e.preventDefault(); handleDrop(building.id); }}
                      data-testid={`gantt-building-row-${building.id}`}
                    >
                      {isAdmin && (
                        <div className="shrink-0 pl-1 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity" onClick={(e) => e.stopPropagation()} data-testid={`drag-handle-building-${building.id}`}>
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        className="shrink-0 p-0.5 hover:bg-muted/40 rounded-sm transition-colors"
                        onClick={(e) => { e.stopPropagation(); toggleBuilding(building.id); }}
                        data-testid={`button-toggle-building-${building.id}`}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide truncate">{building.title}</span>
                          {building.totalTasks > 0 && building.doneTasks === building.totalTasks && <Check className="h-2.5 w-2.5 text-green-600 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${building.progress}%`, backgroundColor: accentColor }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground">{building.doneTasks}/{building.totalTasks}</span>
                          {roomCount > 0 && (
                            <span className="text-[9px] text-muted-foreground/60">{roomCount} {roomCount === 1 ? "area" : "areas"}</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                          <BuildingColourPicker
                            currentHex={building.colorHex}
                            onSelect={(hex) => handleBuildingColourChange(building.id, hex)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-building-menu-${building.id}`}>
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setAddingRoomFor(building.id); setNewRoomTitle(""); setNewRoomStart(""); setNewRoomEnd(""); }} data-testid={`button-add-room-${building.id}`}>
                                <FolderPlus className="h-3.5 w-3.5 mr-2" />
                                Add Room
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setAddingTask({ milestoneId: building.id, sectionId: null }); setNewTaskTitle(""); setNewTaskDueDate(""); }} data-testid={`button-add-task-building-${building.id}`}>
                                <ListPlus className="h-3.5 w-3.5 mr-2" />
                                Add Task
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                }

                if (row.type === "room") {
                  const roomData = row;
                  const isGeneralTasks = roomData.id < 0;
                  const actualBuildingId = isGeneralTasks ? -roomData.id : sections.find(s => s.id === roomData.id)?.milestoneId;
                  const parentBuilding = buildingInfos.find(b => b.id === actualBuildingId);
                  const accentColor = roomData.colorHex || BUILDING_COLORS[roomData.colorIndex];
                  const roomInfo = (!isGeneralTasks && parentBuilding) ? roomInfosForBuilding(parentBuilding.id).find(r => r.id === roomData.id) : null;

                  const actualRoomId = isGeneralTasks ? -1 : roomData.id;
                  const drillBuildingId = isGeneralTasks ? -roomData.id : parentBuilding?.id;

                  return (
                    <div
                      key={`room-${roomData.id}`}
                      className={`border-b border-border/30 flex items-center gap-1.5 cursor-pointer hover:bg-muted/20 transition-colors group ${dragOverId === roomData.id ? "bg-muted/40" : ""}`}
                      style={{ height: ROOM_ROW_HEIGHT, borderLeft: `3px solid ${accentColor}20`, paddingLeft: isAdmin && !isGeneralTasks ? "10px" : "24px" }}
                      onClick={() => drillBuildingId && drillIntoRoom(drillBuildingId, actualRoomId)}
                      draggable={isAdmin && !isGeneralTasks}
                      onDragStart={() => !isGeneralTasks && handleDragStart(roomData.id)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => { e.preventDefault(); !isGeneralTasks && parentBuilding && handleRoomDrop(parentBuilding.id, roomData.id); }}
                      onDragOver={(e) => !isGeneralTasks && handleDragOver(e, roomData.id)}
                      data-testid={`gantt-room-row-${roomData.id}`}
                    >
                      {isAdmin && !isGeneralTasks && (
                        <div className="shrink-0 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity" onClick={(e) => e.stopPropagation()} data-testid={`drag-handle-room-${roomData.id}`}>
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium truncate text-foreground/80">{roomData.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-[3px] bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${roomInfo?.progress || roomData.progress || 0}%`, backgroundColor: accentColor }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {isGeneralTasks
                              ? (() => { const ut = tasks.filter(t => t.milestoneId === (drillBuildingId || 0) && !t.sectionId); return `${ut.filter(t => t.status === "done").length}/${ut.length}`; })()
                              : `${roomInfo?.doneTasks || 0}/${roomInfo?.totalTasks || 0}`
                            }
                          </span>
                        </div>
                      </div>
                      {isAdmin && !isGeneralTasks && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity mr-1.5" data-testid={`button-room-menu-${roomData.id}`}>
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditSection(roomData.id)} data-testid={`button-edit-room-${roomData.id}`}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit Room
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { if (parentBuilding) { setAddingTask({ milestoneId: parentBuilding.id, sectionId: roomData.id }); setNewTaskTitle(""); setNewTaskDueDate(""); } }} data-testid={`button-add-task-room-${roomData.id}`}>
                              <ListPlus className="h-3.5 w-3.5 mr-2" />
                              Add Task
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteSection({ id: roomData.id, projectId }, { onSuccess: () => toast({ title: "Room deleted" }), onError: () => toast({ title: "Failed to delete room", variant: "destructive" }) })} data-testid={`button-delete-room-${roomData.id}`}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete Room
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                }
                return null;
              })}

              {drillLevel === "tasks" && taskInfos.map((task) => {
                const isDone = task.status === "done";
                return (
                  <div
                    key={task.id}
                    className={`border-b border-border/30 flex items-center gap-1.5 px-0 group ${dragOverId === task.id ? "bg-muted/40" : ""}`}
                    style={{ height: ROW_HEIGHT }}
                    draggable={isAdmin}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={() => handleDrop(task.id)}
                    data-testid={`gantt-task-row-${task.id}`}
                  >
                    {isAdmin && (
                      <div className="shrink-0 pl-1 cursor-grab opacity-0 group-hover:opacity-50 transition-opacity" onClick={(e) => e.stopPropagation()} data-testid={`drag-handle-task-${task.id}`}>
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="pl-1">
                      {isAdmin ? (
                        <Checkbox
                          checked={isDone}
                          onCheckedChange={() => handleToggleTask(task.id, task.status)}
                          className="shrink-0 h-3.5 w-3.5"
                          data-testid={`checkbox-task-${task.id}`}
                        />
                      ) : (
                        <div className="shrink-0">
                          {isDone ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[11px] truncate block leading-tight ${isDone ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                      {task.endDate && (
                        <span className="text-[9px] text-muted-foreground/70 leading-none">Due {format(task.endDate, "MMM d")}</span>
                      )}
                    </div>
                    <Badge variant={isDone ? "secondary" : "outline"} className="text-[9px] px-1 py-0 h-3.5 shrink-0 capitalize" data-testid={`badge-task-status-${task.id}`}>
                      {isDone ? "Done" : (task.status || "To-do")}
                    </Badge>
                    {isAdmin && selectedBuildingId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity mr-1.5 shrink-0" data-testid={`button-task-menu-${task.id}`}>
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sections.filter(s => s.milestoneId === selectedBuildingId && s.id !== selectedRoomId).map(s => (
                            <DropdownMenuItem
                              key={s.id}
                              onClick={() => {
                                updateTask({ id: task.id, sectionId: s.id }, {
                                  onSuccess: () => toast({ title: `Moved to ${s.title}` }),
                                  onError: () => toast({ title: "Failed to move task", variant: "destructive" }),
                                });
                              }}
                              data-testid={`button-move-task-${task.id}-to-${s.id}`}
                            >
                              Move to {s.title}
                            </DropdownMenuItem>
                          ))}
                          {sections.filter(s => s.milestoneId === selectedBuildingId && s.id !== selectedRoomId).length === 0 && (
                            <DropdownMenuItem disabled>No other areas</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
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

                  {currentRows.map((row) => {
                    const rowH = row.type === "room" ? ROOM_ROW_HEIGHT : ROW_HEIGHT;
                    return (
                      <div key={`${row.type}-${row.id}`} className="relative border-b border-border/30" style={{ height: rowH }} data-testid={`gantt-row-${row.type}-${row.id}`}>
                        {months.map(month => {
                          const offset = differenceInDays(month, timelineStart) * dayWidth;
                          return <div key={month.toISOString()} className="absolute top-0 h-full border-l border-border/10" style={{ left: offset }} />;
                        })}
                        {renderBar(row)}
                      </div>
                    );
                  })}
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      )}

      {drillLevel === "buildings" && milestones.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground pt-1">
          {buildingInfos.map((building) => (
            <div key={building.id} className="flex items-center gap-1" data-testid={`gantt-legend-${building.id}`}>
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: building.colorHex || BUILDING_COLORS[building.colorIndex] }} />
              <span>{building.title}</span>
              {building.totalTasks > 0 && building.doneTasks === building.totalTasks && <span className="text-green-600">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
