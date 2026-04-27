/**
 * SpatialCanvas — interaction model
 * --------------------------------------------------------------
 * Input is dispatched by `event.pointerType`:
 *   - 'pen'   (Apple Pencil / stylus): always draws.
 *               • Pointerdown on an element → ink saved as `content.annotations` on that element.
 *               • Pointerdown on board background → freestanding `draw` element (legacy flow).
 *   - 'touch' (finger): pan/zoom by default.
 *               • One-finger drag on background = pan.
 *               • Two-finger pinch / drag = zoom & pan.
 *               • Tap on element = select. Tap-and-drag does NOT move it.
 *               • Long-press (300ms, ≤6px slop) on a selected element arms drag, then drag moves it.
 *               • If "Finger drawing" toggle is ON, a single finger draws (two fingers still pan/zoom).
 *   - 'mouse' (desktop): selection / drag / panning unchanged. Drawing when the Draw tool is active.
 *
 * Discipline knobs:
 *   - Lock layout: when ON, no element can be moved/resized/deleted. Drawing & selection still work.
 *     Default ON for client view, OFF for admin/crew. Persisted per board in localStorage.
 *   - Finger drawing: toggle persisted in localStorage. Pencil ignores this toggle.
 *   - Palm rejection: while a Pen pointer is active, all concurrent touch pointers are ignored.
 *
 * Annotations (`content.annotations: Stroke[]`) live inside the element's bounding box; coordinates
 * are stored relative to the element's top-left corner so the ink moves with the card.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getStroke } from "perfect-freehand";
import templateKitchenPreview from "../assets/images/template-kitchen-faux.png";
import templateBathroomPreview from "../assets/images/template-bathroom-faux.png";
import templateCottagePreview from "../assets/images/template-cottage-faux.png";
import templateMoodboardPreview from "@assets/Screenshot_2026-04-08_at_12.56.52_PM_1775667416114.png";
import templateFurnitureRefinishingPreview from "@assets/Screenshot_2026-04-09_at_10.29.34_AM_1775744978712.png";
import templateCollageConceptPreview from "@assets/Screenshot_2026-04-09_at_10.54.53_AM_1775746499391.png";
import templateMaterialInspirationPreview from "@assets/Screenshot_2026-04-09_at_10.57.06_AM_1775746631248.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  StickyNote, Type, ImagePlus, Square, Columns3, Link2, Palette, Trash2, Plus,
  ZoomIn, ZoomOut, Maximize, Loader2, MoreVertical, Edit3, CheckSquare,
  X, ExternalLink, Pencil, Upload, Copy,
  Bold, Italic, Strikethrough, Underline, List, ListOrdered, Code, Link as LinkIcon,
  Eraser, Undo2, Redo2, Save, PenTool, Sparkles, TypeIcon, Shapes,
  CalendarDays, Milestone, ListChecks, Bell, BellOff,
  ChefHat, Bath, Home, FileText, LayoutPanelLeft, LayoutGrid, Move,
  Lock, LockOpen, Hand, Wrench, Check,
  Spline, MoveRight, Slash, Droplet,
  Play,
} from "lucide-react";
import HardwarePickerDialog, { type HardwareDraft } from "@/components/board/HardwarePickerDialog";
import PaletteExtractionDialog, { type PaletteAddPayload } from "@/components/board/PaletteExtractionDialog";
import CanvasConnectors, { CONNECTOR_DEFAULT_COLOR, anchorDots, type ConnectorContent, type ConnectorStyle, type ConnectorCurve } from "@/components/board/CanvasConnectors";
import PresentationMode from "@/components/board/PresentationMode";
import DesignCritiquePanel from "@/components/board/DesignCritiquePanel";
import { useToast } from "@/hooks/use-toast";
import { usePlanningBoards, useCreatePlanningBoard, useDeletePlanningBoard, useUpdatePlanningBoard, useUploadImage, useUsers, useProjects, useMilestones, useChecklistItems, useCalendarEvents, useUpdateCalendarEvent, useDeleteCalendarEvent, useCreateCalendarEvent, useCreateMilestone, useCreateChecklistItem, useBoardSnapshots, useCreateBoardSnapshot, useRestoreBoardSnapshot, useDeleteBoardSnapshot } from "@/hooks/use-projects";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CalendarPanel from "@/components/CalendarPanel";
import { useCanvasStore, debouncedSavePositions } from "@/stores/canvas-store";
import { useBoardRealtime } from "@/hooks/use-board-realtime";
import { useAuth } from "@/hooks/use-auth";
import { useViewMode } from "@/hooks/use-view-mode";
import { api, buildUrl } from "@shared/routes";
import { recognizeAllShapes, recognizeShape, looksLikeHandwriting } from "@/lib/shape-recognition";
import type { CanvasElement, PlanningBoard as PlanningBoardType, PaintColor } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

const SHEENS = ["Flat", "Eggshell", "Satin", "Semi-Gloss", "Gloss"] as const;
type Sheen = typeof SHEENS[number];

function BmColorPicker({
  onSelect,
  initialRoom,
  initialSheen,
}: {
  onSelect: (color: PaintColor, extras: { room?: string; sheen?: Sheen }) => void;
  initialRoom?: string;
  initialSheen?: Sheen;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [room, setRoom] = useState<string>(initialRoom ?? "");
  const [sheen, setSheen] = useState<Sheen | "">(initialSheen ?? "");
  const brand = "Benjamin Moore";

  const queryUrl = `/api/paint-colors?brand=${encodeURIComponent(brand)}`;

  const { data: allColors, isLoading } = useQuery<PaintColor[]>({
    queryKey: [queryUrl],
    enabled: open,
  });

  const filteredColors = (allColors ?? []).filter((c) => {
    if (family && c.colorFamily !== family) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      return c.name.toLowerCase().includes(s) || (c.code?.toLowerCase().includes(s) ?? false);
    }
    return true;
  });

  const families = ["White", "Neutral", "Gray", "Blue", "Green", "Brown", "Yellow", "Orange", "Red", "Pink", "Purple", "Black"];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" data-testid="button-pick-bm-color">
          <Palette className="w-3 h-3" />
          Benjamin Moore
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start" side="bottom">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Room (e.g. Kitchen)"
              className="h-7 text-xs"
              data-testid="input-bm-room"
            />
            <Select value={sheen} onValueChange={(v) => setSheen(v as Sheen)}>
              <SelectTrigger className="h-7 text-xs" data-testid="select-bm-sheen">
                <SelectValue placeholder="Sheen" />
              </SelectTrigger>
              <SelectContent>
                {SHEENS.map((s) => (
                  <SelectItem key={s} value={s} data-testid={`option-bm-sheen-${s.toLowerCase()}`}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search colors..."
            className="h-7 text-xs"
            data-testid="input-bm-search"
          />
          <div className="flex flex-wrap gap-1">
            {families.map((f) => (
              <button
                key={f}
                onClick={() => setFamily(family === f ? null : f)}
                className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${family === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover-elevate"}`}
                data-testid={`bm-family-${f.toLowerCase()}`}
              >
                {f}
              </button>
            ))}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredColors.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No colors found</p>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto pr-1">
                {filteredColors.slice(0, 60).map((pc) => (
                  <Tooltip key={pc.id}>
                    <TooltipTrigger asChild>
                      <button
                        className="w-full aspect-square rounded-sm border border-border/40 hover-elevate"
                        style={{ backgroundColor: pc.hex }}
                        onClick={() => { onSelect(pc, { room: room.trim() || undefined, sheen: sheen || undefined }); setOpen(false); }}
                        data-testid={`bm-color-${pc.id}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{pc.name}</p>
                      <p className="text-muted-foreground">{pc.code}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {filteredColors.length > 60 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Showing 60 of {filteredColors.length} — refine search for more
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SpatialCanvasProps {
  projectId: number;
}

const GRID_SIZE = 20;
const LONG_PRESS_MS = 300;
const LONG_PRESS_SLOP_PX = 6;

type StrokePoint = [number, number, number];
interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  createdAt: number;
  createdBy?: string;
}

const PERFECT_FREEHAND_OPTS = {
  size: 4,
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t: number) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
};

function strokeToSvgPath(stroke: Stroke): string {
  if (stroke.points.length === 0) return "";
  const polygon = getStroke(stroke.points, {
    ...PERFECT_FREEHAND_OPTS,
    size: stroke.width,
  });
  if (polygon.length === 0) return "";
  const d: string[] = [];
  d.push(`M ${polygon[0][0].toFixed(2)} ${polygon[0][1].toFixed(2)}`);
  for (let i = 1; i < polygon.length; i++) {
    d.push(`L ${polygon[i][0].toFixed(2)} ${polygon[i][1].toFixed(2)}`);
  }
  d.push("Z");
  return d.join(" ");
}

function renderAnnotations(annotations: Stroke[] | undefined, idPrefix: string) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      data-testid={`${idPrefix}-annotations`}
    >
      {annotations.map((s) => {
        const d = strokeToSvgPath(s);
        if (!d) return null;
        return <path key={s.id} d={d} fill={s.color} stroke="none" />;
      })}
    </svg>
  );
}

const ELEMENT_DEFAULTS: Record<string, { width: number; height: number; content: any }> = {
  note: { width: 240, height: 140, content: { title: "", text: "Type your note here...", plain: false } },
  plain_text: { width: 240, height: 120, content: { title: "", text: "Type your text here...", plain: true } },
  todo: { width: 240, height: 200, content: { title: "To-do", items: [{ text: "Add a task...", checked: false }] } },
  column: { width: 240, height: 400, content: { title: "New Column", subtitle: "0 cards" } },
  board_link: { width: 180, height: 80, content: { title: "Board", targetBoardId: null } },
  link: { width: 240, height: 100, content: { title: "", url: "" } },
  image: { width: 360, height: 260, content: { url: "", caption: "" } },
  color_swatch: { width: 220, height: 220, content: { color: "#1e3a2f", name: "Forest Green", hex: "#1E3A2F" } },
  section_header: { width: 600, height: 56, content: { title: "Section Title", tracking: "normal", align: "left", size: "lg" } },
  draw: { width: 400, height: 300, content: { paths: [], color: "#000000", strokeWidth: 2 } },
  room_zone: { width: 500, height: 400, content: { title: "Room Name", color: "#f0ede8", opacity: 0.5 } },
  material: { width: 220, height: 180, content: { name: "Material", supplier: "", code: "", imageUrl: "", notes: "" } },
  callout: { width: 200, height: 80, content: { text: "Add note...", color: "#fef9c3" } },
  product: { width: 240, height: 120, content: { name: "Product", price: "", supplier: "", url: "" } },
  hardware: { width: 280, height: 200, content: { category: "pull", name: "New hardware", status: "idea", currency: "CAD" } },
  connector: { width: 0, height: 0, content: { fromId: 0, toId: 0, style: "arrow", curve: "curved" } },
};

// Status chip styling — used by hardware now; reusable for future material/color picks.
const STATUS_CHIP: Record<string, { className: string; label: string; withCheck?: boolean }> = {
  idea:      { className: "bg-muted text-muted-foreground",       label: "Idea" },
  shortlist: { className: "bg-primary/10 text-primary",            label: "Shortlist" },
  selected:  { className: "bg-primary text-primary-foreground",    label: "Selected" },
  ordered:   { className: "bg-primary text-primary-foreground",    label: "Ordered", withCheck: true },
};

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)";
}

export default function SpatialCanvas({ projectId }: SpatialCanvasProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { viewMode } = useViewMode();
  const actualRole = user?.role || "client";
  const isAdmin = actualRole === "admin";
  const effectiveRole = isAdmin ? viewMode : actualRole;
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: templateCatalogue = [] } = useQuery<{ id: string; name: string; description: string; icon: string }[]>({
    queryKey: ["/api/board-templates"],
    enabled: isAdmin,
  });
  const templatePreviewById: Record<string, string> = {
    kitchen: templateKitchenPreview,
    bathroom: templateBathroomPreview,
    cottage: templateCottagePreview,
    moodboard: templateMoodboardPreview,
    "furniture-refinishing-working": templateFurnitureRefinishingPreview,
    "collage-concept": templateCollageConceptPreview,
    "material-inspiration": templateMaterialInspirationPreview,
  };

  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const justCreatedBoardId = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number; pan: { x: number; y: number }; cx: number; cy: number } | null>(null);
  const pendingDragRef = useRef<{ id: number; x: number; y: number; elX: number; elY: number } | null>(null);
  const [mobileUnlockedId, setMobileUnlockedId] = useState<number | null>(null);
  const spaceRef = useRef(false);

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showManageBoards, setShowManageBoards] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showCritique, setShowCritique] = useState(false);
  const [boardsToDelete, setBoardsToDelete] = useState<Set<number>>(new Set());
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);
  const [notifyOnLink, setNotifyOnLink] = useState(true);
  const [linkDetailSheet, setLinkDetailSheet] = useState<{ type: "calendar" | "milestone" | "checklist"; id: number } | null>(null);
  const [editingEventTitle, setEditingEventTitle] = useState<string | null>(null);
  const { mutateAsync: updateCalendarEvent } = useUpdateCalendarEvent();
  const { mutateAsync: deleteCalendarEvent } = useDeleteCalendarEvent();
  const { mutateAsync: createCalendarEvent } = useCreateCalendarEvent();
  const { mutateAsync: createMilestone } = useCreateMilestone();
  const { mutateAsync: createChecklistItem } = useCreateChecklistItem();
  const [linkCreateMode, setLinkCreateMode] = useState<{ milestone: boolean; checklist: boolean; calendar: boolean }>({ milestone: false, checklist: false, calendar: false });
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newCalendarTitle, setNewCalendarTitle] = useState("");
  const [newCalendarDate, setNewCalendarDate] = useState("");
  const [renameName, setRenameName] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState("");

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);
  const zoneChildrenRef = useRef<{ id: number; offsetX: number; offsetY: number }[]>([]);
  const [droppingIds, setDroppingIds] = useState<Set<number>>(new Set());
  const droppingTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [maxZ, setMaxZ] = useState(1);

  const [resizingId, setResizingId] = useState<number | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; elW: number; elH: number; elX: number; elY: number; handle: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showImagePopup, setShowImagePopup] = useState(false);
  // Add palette popover — persisted open/closed across sessions for power users.
  const [addPaletteOpen, setAddPaletteOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("asl-board-add-palette-open") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("asl-board-add-palette-open", addPaletteOpen ? "1" : "0"); } catch {}
  }, [addPaletteOpen]);
  const [showHardwareDialog, setShowHardwareDialog] = useState(false);
  const pendingHardwareDropRef = useRef<{ x: number; y: number } | null>(null);
  const [showPaletteDialog, setShowPaletteDialog] = useState(false);
  const [palettePresetUrl, setPalettePresetUrl] = useState<string | null>(null);
  const palettePresetSourceRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const imageUrlInputRef = useRef<HTMLInputElement | null>(null);
  const noteTextareaRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const [focusedTodoItem, setFocusedTodoItem] = useState<{ elementId: number; itemIdx: number } | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawTool, setDrawTool] = useState<"pen" | "eraser">("pen");
  const [drawColor, setDrawColor] = useState("#1e3a2f");
  const [drawStrokeWidth, setDrawStrokeWidth] = useState(3);
  const [drawingPaths, setDrawingPaths] = useState<any[]>([]);
  const [drawUndoStack, setDrawUndoStack] = useState<any[]>([]);
  const [_isDrawing, setIsDrawing] = useState(false);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const autoConvertInFlightRef = useRef(false);

  // Connect tool — two-tap arrow connector creation. Admin/crew only.
  const zombieConnectorMissesRef = useRef<Map<number, number>>(new Map());
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<number | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(null);
  const [connectCursor, setConnectCursor] = useState<{ x: number; y: number } | null>(null);
  const [connectorEdgeDrag, setConnectorEdgeDrag] = useState<{ connectorId: number; endpoint: "from" | "to"; clientX: number; clientY: number } | null>(null);
  const exitConnectMode = useCallback(() => {
    setConnectMode(false);
    setConnectSourceId(null);
    setConnectCursor(null);
  }, []);

  // Lock layout: persisted per-board in localStorage. Default ON for client, OFF for admin/crew.
  const lockLayoutKey = selectedBoardId ? `asl-board-locked-${selectedBoardId}` : null;
  const [lockLayout, setLockLayout] = useState<boolean>(false);
  useEffect(() => {
    if (!lockLayoutKey) return;
    const raw = localStorage.getItem(lockLayoutKey);
    if (raw === "1") setLockLayout(true);
    else if (raw === "0") setLockLayout(false);
    else setLockLayout(effectiveRole === "client");
  }, [lockLayoutKey, effectiveRole]);
  const toggleLockLayout = useCallback(() => {
    setLockLayout((v) => {
      const next = !v;
      if (lockLayoutKey) localStorage.setItem(lockLayoutKey, next ? "1" : "0");
      return next;
    });
  }, [lockLayoutKey]);

  // Finger-drawing toggle: persisted globally in localStorage. Pencil ignores this toggle.
  const [fingerDrawing, setFingerDrawing] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("asl-board-finger-drawing") === "1";
  });
  const toggleFingerDrawing = useCallback(() => {
    setFingerDrawing((v) => {
      const next = !v;
      try { localStorage.setItem("asl-board-finger-drawing", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // Pointer-event bookkeeping
  const activePointersRef = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  const penActiveRef = useRef(false);
  const longPressArmRef = useRef<{
    pointerId: number;
    elementId: number;
    startX: number;
    startY: number;
    elX: number;
    elY: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [longPressActiveId, setLongPressActiveId] = useState<number | null>(null);
  const cancelLongPress = useCallback(() => {
    if (longPressArmRef.current?.timer) clearTimeout(longPressArmRef.current.timer);
    longPressArmRef.current = null;
    setLongPressActiveId(null);
  }, []);

  // Per-element annotation drawing (live stroke) — keyed by element id
  const elementInkRef = useRef<{
    pointerId: number;
    elementId: number;
    points: StrokePoint[];
    color: string;
    width: number;
  } | null>(null);
  const [liveElementStroke, setLiveElementStroke] = useState<{
    elementId: number;
    stroke: Stroke;
  } | null>(null);

  const elements = useCanvasStore((s) => s.elements);
  const loading = useCanvasStore((s) => s.loading);
  const { setElements, addElement, updateElement, removeElement, moveElement, setLoading, setBoardId, pushUndo, popUndo } = useCanvasStore.getState();
  const undoStack = useCanvasStore((s) => s.undoStack);

  const {
    collaborators,
    cursors,
    activeEdits,
    getCollaboratorColor,
    sendElementAdd,
    sendElementUpdate,
    sendElementRemove,
    sendElementMove,
    sendCursorMove,
  } = useBoardRealtime(selectedBoardId, user);

  const { data: boards = [], isLoading: isLoadingBoards } = usePlanningBoards(projectId);
  const { mutateAsync: createBoard } = useCreatePlanningBoard();
  const { mutateAsync: updateBoard } = useUpdatePlanningBoard();
  const { mutateAsync: deleteBoard } = useDeletePlanningBoard();
  const { mutateAsync: uploadImage } = useUploadImage();
  const { data: allUsers = [] } = useUsers();
  const { data: allProjects = [] } = useProjects();
  const { data: milestones = [] } = useMilestones(projectId);
  const { data: checklistItems = [] } = useChecklistItems(projectId);
  const { data: calendarEvents = [] } = useCalendarEvents(projectId);
  const { data: snapshots = [] } = useBoardSnapshots(selectedBoardId);
  const { mutateAsync: createSnapshot, isPending: isCreatingSnapshot } = useCreateBoardSnapshot();
  const { mutateAsync: restoreSnapshot, isPending: isRestoringSnapshot } = useRestoreBoardSnapshot();
  const { mutateAsync: deleteSnapshot } = useDeleteBoardSnapshot();

  useEffect(() => {
    const timers = droppingTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (justCreatedBoardId.current && (boards as any[]).some((board: any) => board.id === justCreatedBoardId.current)) {
      justCreatedBoardId.current = null;
      return;
    }
    if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  useEffect(() => {
    if (!selectedBoardId) return;
    setBoardId(selectedBoardId);
    setLoading(true);
    const url = buildUrl(api.canvasElements.list.path, { boardId: selectedBoardId });
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((data: CanvasElement[]) => {
        setElements(data);
        if (data.length > 0) {
          setMaxZ(Math.max(...data.map((e) => e.zIndex)) + 1);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedBoardId]);

  const closeNewBoardDialog = () => {
    setShowNewBoardDialog(false);
    setNewBoardName("");
    setSelectedTemplateId(null);
  };

  const handleCreateBoard = async () => {
    try {
      const selectedTemplate = selectedTemplateId ? templateCatalogue.find((template) => template.id === selectedTemplateId) : null;
      const boardName = newBoardName.trim() || (selectedTemplate?.name || "Untitled Board");
      const boardResult = await createBoard({
        projectId,
        name: boardName,
        ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
      });
      const board = boardResult && typeof boardResult === "object" && "id" in boardResult ? boardResult : null;
      if (!board || !board.id) {
        toast({ title: "Error", description: "Failed to create board", variant: "destructive" });
        return;
      }
      closeNewBoardDialog();
      queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
      queryClient.invalidateQueries({ queryKey: [api.planningBoards.get.path, board.id] });
      setSelectedBoardId(board.id);
      setBoardId(board.id);
      justCreatedBoardId.current = board.id;
      toast({ title: "Board created", description: board.name || boardName });
    } catch (err: any) {
      console.error("Board creation error:", err);
      toast({ title: "Error", description: err?.message || "Failed to create board", variant: "destructive" });
    }
  };

  const handleRename = async () => {
    if (!selectedBoardId || !renameName.trim()) return;
    await updateBoard({ id: selectedBoardId, name: renameName.trim() });
    setShowRenameDialog(false);
    queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
  };

  const handleDeleteBoard = async () => {
    if (!selectedBoardId) return;
    const board = selectedBoard;
    const shouldDeleteEvent = board?.linkedCalendarEventId && !(board.linkedMilestoneId || board.linkedChecklistItemId);
    const eventIdToDelete = shouldDeleteEvent ? board.linkedCalendarEventId : null;
    await deleteBoard({ id: selectedBoardId, projectId });
    if (eventIdToDelete) {
      try {
        await deleteCalendarEvent(eventIdToDelete);
      } catch {}
    }
    setShowDeleteConfirm(false);
    setSelectedBoardId(null);
    queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
    queryClient.invalidateQueries({ queryKey: [api.calendar.list.path] });
    if (eventIdToDelete) {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'activity'] });
    }
  };

  const handleDeleteSelectedBoards = async () => {
    if (boardsToDelete.size === 0) return;
    let deleted = 0;
    let failed = 0;
    for (const id of boardsToDelete) {
      const board = boards.find((b: any) => b.id === id);
      if (!board) continue;
      const shouldDeleteEvent = board.linkedCalendarEventId && !(board.linkedMilestoneId || board.linkedChecklistItemId);
      const eventIdToDelete = shouldDeleteEvent ? board.linkedCalendarEventId : null;
      try {
        await deleteBoard({ id, projectId });
        deleted++;
        if (eventIdToDelete) {
          try { await deleteCalendarEvent(eventIdToDelete); } catch {}
        }
      } catch {
        failed++;
      }
    }
    if (boardsToDelete.has(selectedBoardId!) && deleted > 0) {
      setSelectedBoardId(null);
    }
    setBoardsToDelete(new Set());
    setShowManageBoards(false);
    queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
    queryClient.invalidateQueries({ queryKey: [api.calendar.list.path] });
    if (failed > 0) {
      toast({ title: "Some boards could not be deleted", description: `${deleted} deleted, ${failed} failed.`, variant: "destructive" });
    } else {
      toast({ title: "Boards deleted", description: `${deleted} board${deleted !== 1 ? "s" : ""} removed.` });
    }
  };

  const handleLinkUpdate = async (field: string, value: any, extraFields?: Record<string, any>) => {
    if (!selectedBoardId) return;
    try {
      await updateBoard({ id: selectedBoardId, [field]: value, ...extraFields } as any);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'planning-boards'] });
    } catch {
      toast({ title: "Error", description: "Failed to update link.", variant: "destructive" });
    }
  };

  const handleCreateAndLinkMilestone = async () => {
    if (!selectedBoardId || !newMilestoneTitle.trim()) return;
    try {
      const result = await createMilestone({ projectId, title: newMilestoneTitle.trim() });
      await updateBoard({ id: selectedBoardId, linkedMilestoneId: result.id } as any);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'planning-boards'] });
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.milestones.list.path, { projectId }), projectId] });
      setNewMilestoneTitle("");
      setLinkCreateMode(m => ({ ...m, milestone: false }));
      toast({ title: "Milestone created and linked" });
    } catch {
      toast({ title: "Error", description: "Failed to create milestone.", variant: "destructive" });
    }
  };

  const handleCreateAndLinkChecklist = async () => {
    if (!selectedBoardId || !newChecklistTitle.trim()) return;
    try {
      const result = await createChecklistItem({ projectId, title: newChecklistTitle.trim() });
      await updateBoard({ id: selectedBoardId, linkedChecklistItemId: result.id } as any);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'planning-boards'] });
      queryClient.invalidateQueries({ queryKey: [api.checklist.list.path, projectId] });
      setNewChecklistTitle("");
      setLinkCreateMode(m => ({ ...m, checklist: false }));
      toast({ title: "Checklist item created and linked" });
    } catch {
      toast({ title: "Error", description: "Failed to create checklist item.", variant: "destructive" });
    }
  };

  const handleCreateAndLinkCalendar = async () => {
    if (!selectedBoardId || !newCalendarTitle.trim() || !newCalendarDate) return;
    try {
      const result = await createCalendarEvent({ projectId, title: newCalendarTitle.trim(), date: newCalendarDate, type: "event" });
      await updateBoard({ id: selectedBoardId, linkedCalendarEventId: result.id } as any);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'planning-boards'] });
      queryClient.invalidateQueries({ queryKey: [api.calendar.list.path, projectId] });
      setNewCalendarTitle("");
      setNewCalendarDate("");
      setLinkCreateMode(m => ({ ...m, calendar: false }));
      toast({ title: "Calendar event created and linked" });
    } catch {
      toast({ title: "Error", description: "Failed to create calendar event.", variant: "destructive" });
    }
  };

  const toggleLinkedUser = (userId: string) => {
    const current = selectedBoard?.linkedUserIds || [];
    const isAdding = !current.includes(userId);
    const next = isAdding
      ? [...current, userId]
      : current.filter((id: string) => id !== userId);
    handleLinkUpdate("linkedUserIds", next, isAdding && notifyOnLink ? { notifyUsers: true } : undefined);
  };

  const toggleLinkedProject = (projectId: number) => {
    const current = (selectedBoard?.linkedProjectIds || []) as number[];
    const isAdding = !current.includes(projectId);
    const next = isAdding
      ? [...current, projectId]
      : current.filter((id: number) => id !== projectId);
    handleLinkUpdate("linkedProjectIds", next);
  };

  const createElement = async (type: string, x?: number, y?: number) => {
    if (!selectedBoardId) return;
    const def = ELEMENT_DEFAULTS[type] || ELEMENT_DEFAULTS.note;
    const centerX = x ?? Math.round((-pan.x + (containerRef.current?.clientWidth || 800) / 2) / zoom - def.width / 2);
    const centerY = y ?? Math.round((-pan.y + (containerRef.current?.clientHeight || 600) / 2) / zoom - def.height / 2);
    const newZ = maxZ;
    setMaxZ((z) => z + 1);

    try {
      const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: type === "plain_text" ? "note" : type, x: centerX, y: centerY, width: def.width, height: def.height, zIndex: newZ, content: { ...def.content, plain: type === "plain_text" } }),
      });
      const el = await res.json();
      addElement(el);
      sendElementAdd(el);
      pushUndo({ type: "create", elementId: el.id });
    } catch {
      toast({ title: "Error", description: "Failed to create element", variant: "destructive" });
    }
  };

  const createHardware = async (draft: HardwareDraft) => {
    if (!selectedBoardId) return;
    const def = ELEMENT_DEFAULTS.hardware;
    const drop = pendingHardwareDropRef.current;
    pendingHardwareDropRef.current = null;
    const centerX = drop ? drop.x : Math.round((-pan.x + (containerRef.current?.clientWidth || 800) / 2) / zoom - def.width / 2);
    const centerY = drop ? drop.y : Math.round((-pan.y + (containerRef.current?.clientHeight || 600) / 2) / zoom - def.height / 2);
    const newZ = maxZ;
    setMaxZ((z) => z + 1);
    try {
      const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "hardware",
          x: centerX,
          y: centerY,
          width: def.width,
          height: def.height,
          zIndex: newZ,
          content: { ...draft },
        }),
      });
      const el = await res.json();
      addElement(el);
      sendElementAdd(el);
      pushUndo({ type: "create", elementId: el.id });
      toast({ title: "Hardware added", description: draft.name });
    } catch {
      toast({ title: "Error", description: "Failed to add hardware", variant: "destructive" });
    }
  };

  // Drop a row of color_swatch elements onto the board from an extracted palette.
  // If the extraction came from a board image, anchor the row just below it; otherwise
  // anchor at the current viewport center.
  const createPaletteSwatches = async (payload: PaletteAddPayload) => {
    if (!selectedBoardId) return;
    const def = ELEMENT_DEFAULTS.color_swatch;
    const gap = 12;
    const rowSpacing = def.width + gap;

    const source = palettePresetSourceRef.current;
    palettePresetSourceRef.current = null;
    const rows = payload.rows;
    const totalWidth = rows.length * def.width + (rows.length - 1) * gap;

    let startX: number;
    let startY: number;
    if (source) {
      startX = source.x + Math.round((source.w - totalWidth) / 2);
      startY = source.y + source.h + 24;
    } else {
      const viewW = containerRef.current?.clientWidth || 800;
      const viewH = containerRef.current?.clientHeight || 600;
      const centerX = (-pan.x + viewW / 2) / zoom;
      const centerY = (-pan.y + viewH / 2) / zoom;
      startX = Math.round(centerX - totalWidth / 2);
      startY = Math.round(centerY - def.height / 2);
    }

    const baseZ = maxZ;
    setMaxZ((z) => z + rows.length);

    const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
    let added = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const matchHex = row.match?.hex || row.hex;
      const content: any = {
        color: matchHex,
        hex: matchHex,
        name: row.match?.name || "Extracted color",
      };
      if (row.match) {
        content.brand = row.match.brand;
        content.code = row.match.code;
        if (typeof row.match.lrv === "number") content.lrv = row.match.lrv;
      }
      if (payload.room) content.room = payload.room;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "color_swatch",
            x: startX + i * rowSpacing,
            y: startY,
            width: def.width,
            height: def.height,
            zIndex: baseZ + i,
            content,
          }),
        });
        const el = await res.json();
        addElement(el);
        sendElementAdd(el);
        pushUndo({ type: "create", elementId: el.id });
        added++;
      } catch {
        // Continue dropping the rest; we'll surface a partial-success toast at the end.
      }
    }
    if (added === 0) {
      toast({ title: "Error", description: "Failed to add palette to board", variant: "destructive" });
    } else {
      toast({
        title: "Palette added",
        description: payload.room
          ? `${added} color${added === 1 ? "" : "s"} for ${payload.room}`
          : `${added} color${added === 1 ? "" : "s"} dropped on the board`,
      });
    }
  };

  const createConnector = async (fromId: number, toId: number) => {
    if (!selectedBoardId || fromId === toId) return;
    const content: ConnectorContent = { fromId, toId, style: "arrow", curve: "curved" };
    try {
      const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "connector", x: 0, y: 0, width: 0, height: 0, zIndex: 0, content }),
      });
      const el = await res.json();
      addElement(el);
      sendElementAdd(el);
      pushUndo({ type: "create", elementId: el.id });
      setSelectedConnectorId(el.id);
    } catch {
      toast({ title: "Error", description: "Failed to create connector", variant: "destructive" });
    }
  };

  const handleDeleteElement = async (id: number) => {
    if (lockLayout) {
      toast({ title: "Layout locked", description: "Unlock layout to delete elements." });
      return;
    }
    const el = elements[id];
    if (el) pushUndo({ type: "delete", element: { ...el } });
    // Find dangling connectors that reference this element and delete them too.
    const danglingConnectorIds: number[] = [];
    Object.values(elements).forEach((other) => {
      if (other.type !== "connector") return;
      const c = (other.content || {}) as ConnectorContent;
      if (c.fromId === id || c.toId === id) danglingConnectorIds.push(other.id);
    });
    for (const cid of danglingConnectorIds) {
      const conn = elements[cid];
      if (conn) pushUndo({ type: "delete", element: { ...conn } });
      removeElement(cid);
      sendElementRemove(cid);
      try {
        const cUrl = buildUrl(api.canvasElements.delete.path, { id: cid });
        await fetch(cUrl, { method: "DELETE", credentials: "include" });
      } catch {}
    }
    if (selectedConnectorId && danglingConnectorIds.includes(selectedConnectorId)) {
      setSelectedConnectorId(null);
    }
    removeElement(id);
    sendElementRemove(id);
    setEditingId(null);
    try {
      const url = buildUrl(api.canvasElements.delete.path, { id });
      await fetch(url, { method: "DELETE", credentials: "include" });
    } catch {}
  };

  const handleDeleteConnector = async (id: number) => {
    if (lockLayout) {
      toast({ title: "Layout locked", description: "Unlock layout to delete connectors." });
      return;
    }
    const el = elements[id];
    if (el) pushUndo({ type: "delete", element: { ...el } });
    removeElement(id);
    sendElementRemove(id);
    setSelectedConnectorId(null);
    try {
      const url = buildUrl(api.canvasElements.delete.path, { id });
      await fetch(url, { method: "DELETE", credentials: "include" });
    } catch {}
  };

  const handleUpdateConnector = async (id: number, patch: Partial<ConnectorContent>) => {
    if (lockLayout) return;
    const el = elements[id];
    if (!el) return;
    const prev = (el.content || {}) as ConnectorContent;
    const next = { ...prev, ...patch };
    pushUndo({ type: "update", elementId: id, prevUpdates: { content: prev as any } });
    updateElement(id, { content: next as any });
    sendElementUpdate(id, { content: next as any });
    try {
      const url = buildUrl(api.canvasElements.update.path, { id });
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: next }),
      });
    } catch {}
  };

  const _handleDeleteRoomZone = async (id: number) => {
    const zone = elements[id];
    if (!zone || zone.type !== "room_zone") {
      await handleDeleteElement(id);
      return;
    }
    const zoneRight = zone.x + (zone.width || 500);
    const zoneBottom = zone.y + (zone.height || 400);
    const childIds = Object.values(elements)
      .filter((child) => child.id !== id && child.x >= zone.x && child.y >= zone.y && child.x < zoneRight && child.y < zoneBottom)
      .map((child) => child.id);
    for (const childId of childIds) {
      const child = elements[childId];
      if (child) pushUndo({ type: "delete", element: { ...child } });
      removeElement(childId);
      sendElementRemove(childId);
      try {
        const childUrl = buildUrl(api.canvasElements.delete.path, { id: childId });
        await fetch(childUrl, { method: "DELETE", credentials: "include" });
      } catch {}
    }
    await handleDeleteElement(id);
  };

  const handleUpdateContent = async (id: number, content: any) => {
    const prev = elements[id];
    if (prev) pushUndo({ type: "update", elementId: id, prevUpdates: { content: prev.content } });
    updateElement(id, { content });
    sendElementUpdate(id, { content });
    try {
      const url = buildUrl(api.canvasElements.update.path, { id });
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
    } catch {}
  };

  const handleUndo = useCallback(async () => {
    if (!selectedBoardId) return;
    const action = popUndo();
    if (!action) return;

    switch (action.type) {
      case "create": {
        removeElement(action.elementId);
        try {
          const url = buildUrl(api.canvasElements.delete.path, { id: action.elementId });
          await fetch(url, { method: "DELETE", credentials: "include" });
        } catch {}
        break;
      }
      case "delete": {
        try {
          const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              type: action.element.type,
              x: action.element.x,
              y: action.element.y,
              width: action.element.width,
              height: action.element.height,
              zIndex: action.element.zIndex,
              content: action.element.content,
              parentColumnId: action.element.parentColumnId,
            }),
          });
          const restored = await res.json();
          addElement(restored);
          sendElementAdd(restored);
        } catch {}
        break;
      }
      case "move": {
        moveElement(action.elementId, action.prevX, action.prevY);
        debouncedSavePositions(selectedBoardId);
        break;
      }
      case "update": {
        const el = elements[action.elementId];
        if (el) {
          updateElement(action.elementId, action.prevUpdates);
          try {
            const url = buildUrl(api.canvasElements.update.path, { id: action.elementId });
            await fetch(url, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(action.prevUpdates),
            });
          } catch {}
        }
        break;
      }
    }
    toast({ title: "Undone", description: "Last action reversed." });
  }, [selectedBoardId, elements]);

  // Unified action dispatcher used by the Add palette, mobile bar, and shortcuts.
  // "image" / "connect" arm a placement cursor or open a dialog; everything else
  // inserts at viewport center.
  const runTool = useCallback((type: string) => {
    if (type === "image") {
      setShowImagePopup((v) => !v);
    } else if (type === "draw") {
      setDrawingMode(true);
      setDrawTool("pen");
      setDrawingPaths([]);
      drawPathsRef.current = [];
      setDrawUndoStack([]);
      setEditingId(null);
    } else if (type === "hardware") {
      pendingHardwareDropRef.current = null;
      setShowHardwareDialog(true);
    } else if (type === "connect") {
      if (connectMode) {
        exitConnectMode();
      } else {
        setConnectMode(true);
        setConnectSourceId(null);
        setSelectedConnectorId(null);
        setEditingId(null);
      }
    } else if (type === "palette") {
      palettePresetSourceRef.current = null;
      setPalettePresetUrl(null);
      setShowPaletteDialog(true);
    } else {
      createElement(type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectMode, exitConnectMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === "Escape") {
        if (connectMode) exitConnectMode();
        if (selectedConnectorId !== null) setSelectedConnectorId(null);
      }
      // Add-palette shortcuts — only fire when no input/textarea/contenteditable
      // is focused and there are no modifiers other than shift.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName?.toLowerCase();
        const isEditable = tag === "input" || tag === "textarea" || (t && t.isContentEditable);
        if (!isEditable) {
          const map: Record<string, string> = {
            n: "note",
            t: "plain_text",
            i: "image",
            c: "color_swatch",
            h: "hardware",
            d: "draw",
            a: "connect",
          };
          const key = e.key.toLowerCase();
          const type = map[key];
          if (type) {
            // Skip role-restricted tools.
            if ((type === "hardware" || type === "connect") && effectiveRole === "client") return;
            e.preventDefault();
            runTool(type);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, connectMode, exitConnectMode, selectedConnectorId, runTool, effectiveRole]);

  // Connector endpoint re-targeting drag.
  useEffect(() => {
    if (!connectorEdgeDrag) return;
    const onMove = (e: PointerEvent) => {
      setConnectorEdgeDrag((d) => d ? { ...d, clientX: e.clientX, clientY: e.clientY } : d);
    };
    const hitTestForConnector = (clientX: number, clientY: number): CanvasElement | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const wx = (clientX - rect.left - pan.x) / zoom;
      const wy = (clientY - rect.top - pan.y) / zoom;
      let best: CanvasElement | null = null;
      let bestZ = -Infinity;
      Object.values(elements).forEach((el) => {
        if (el.type === "section_header" || el.type === "draw" || el.type === "room_zone" || el.type === "connector") return;
        const w = el.width || 200;
        const h = el.height || 60;
        if (wx >= el.x && wx <= el.x + w && wy >= el.y && wy <= el.y + h) {
          const z = el.zIndex || 0;
          if (z > bestZ) { bestZ = z; best = el; }
        }
      });
      return best;
    };
    const onUp = (e: PointerEvent) => {
      const drag = connectorEdgeDrag;
      if (!drag) return;
      const hit = hitTestForConnector(e.clientX, e.clientY);
      if (hit && hit.id !== drag.connectorId) {
        const conn = elements[drag.connectorId];
        if (conn && conn.type === "connector") {
          const c = (conn.content || {}) as ConnectorContent;
          const otherId = drag.endpoint === "from" ? c.toId : c.fromId;
          if (hit.id !== otherId) {
            const patch: Partial<ConnectorContent> = drag.endpoint === "from"
              ? { fromId: hit.id, fromAnchor: "auto" }
              : { toId: hit.id, toAnchor: "auto" };
            handleUpdateConnector(drag.connectorId, patch);
          }
        }
      }
      setConnectorEdgeDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [connectorEdgeDrag, elements, pan, zoom]);

  // Zombie-connector sweep: any connector whose endpoints have been gone for a couple of
  // render passes gets quietly deleted. Avoids leaving dangling rows when peers delete elements.
  useEffect(() => {
    if (!selectedBoardId) return;
    const elList = Object.values(elements);
    const misses = zombieConnectorMissesRef.current;
    const stillExists = new Set(elList.map((e) => e.id));
    const toCull: number[] = [];
    elList.forEach((el) => {
      if (el.type !== "connector") return;
      const c = (el.content || {}) as ConnectorContent;
      const danglingFrom = !stillExists.has(c.fromId);
      const danglingTo = !stillExists.has(c.toId);
      if (danglingFrom || danglingTo) {
        const n = (misses.get(el.id) || 0) + 1;
        misses.set(el.id, n);
        if (n >= 2) toCull.push(el.id);
      } else {
        misses.delete(el.id);
      }
    });
    toCull.forEach(async (id) => {
      misses.delete(id);
      removeElement(id);
      try {
        const url = buildUrl(api.canvasElements.delete.path, { id });
        await fetch(url, { method: "DELETE", credentials: "include" });
      } catch {}
    });
  }, [elements, selectedBoardId, removeElement]);

  const handleFileUpload = async (file: File, targetElementId?: number) => {
    if (!selectedBoardId) return;
    setIsUploading(true);
    try {
      const result = await uploadImage(file);
      if (targetElementId) {
        const el = elements[targetElementId];
        if (el) {
          const c = (el.content || {}) as any;
          handleUpdateContent(targetElementId, { ...c, url: result.url });
        }
      } else {
        const newZ = maxZ;
        setMaxZ((z: number) => z + 1);
        const centerX = Math.round((-pan.x + (containerRef.current?.clientWidth || 800) / 2) / zoom - 120);
        const centerY = Math.round((-pan.y + (containerRef.current?.clientHeight || 600) / 2) / zoom - 100);
        const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type: "image", x: centerX, y: centerY, width: 240, height: 200, zIndex: newZ, content: { url: result.url, caption: "" } }),
        });
        const el = await res.json();
        addElement(el);
        sendElementAdd(el);
      }
      toast({ title: "Image uploaded" });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadTargetId(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, uploadTargetId || undefined);
    e.target.value = "";
  };

  const triggerImageUpload = (targetId?: number) => {
    setUploadTargetId(targetId || null);
    fileInputRef.current?.click();
  };

  const handleDuplicateElement = async (id: number) => {
    if (!selectedBoardId) return;
    const el = elements[id];
    if (!el) return;
    const newZ = maxZ;
    setMaxZ((z: number) => z + 1);
    try {
      const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: el.type, x: el.x + 30, y: el.y + 30, width: el.width, height: el.height, zIndex: newZ, content: el.content }),
      });
      const newEl = await res.json();
      addElement(newEl);
      sendElementAdd(newEl);
      setEditingId(newEl.id);
      toast({ title: "Element duplicated" });
    } catch {
      toast({ title: "Error", description: "Failed to duplicate element", variant: "destructive" });
    }
  };

  const openContextMenu = (e: React.MouseEvent | React.TouchEvent, elementId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "clientX" in e ? e.clientX : e.touches?.[0]?.clientX || 0;
    const clientY = "clientY" in e ? e.clientY : e.touches?.[0]?.clientY || 0;
    setContextMenu({ x: clientX, y: clientY, elementId });
    setEditingId(elementId);
  };

  const handleElementTouchStart = (elementId: number) => (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const el = elements[elementId];
    if (!el) return;
    e.stopPropagation();

    // Layout locked: tap = select only, never arm drag
    setEditingId(elementId);
    if (lockLayout) {
      setMobileUnlockedId(null);
      pendingDragRef.current = null;
      cancelLongPress();
      return;
    }

    // Long-press to arm drag (no double-tap required)
    longPressArmRef.current?.timer && clearTimeout(longPressArmRef.current.timer);
    longPressArmRef.current = {
      pointerId: -1,
      elementId,
      startX: touch.clientX,
      startY: touch.clientY,
      elX: el.x,
      elY: el.y,
      timer: setTimeout(() => {
        setMobileUnlockedId(elementId);
        setLongPressActiveId(elementId);
        pendingDragRef.current = { id: elementId, x: touch.clientX, y: touch.clientY, elX: el.x, elY: el.y };
        const newZ = maxZ;
        setMaxZ((z) => z + 1);
        updateElement(elementId, { zIndex: newZ });
      }, LONG_PRESS_MS),
    };
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    cancelLongPress();
  };

  // Touch-based canvas handlers for drag, pan & pinch-to-zoom on mobile
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (drawingMode) return;
    // Tapping the canvas background deselects and re-locks any element
    setEditingId(null);
    setMobileUnlockedId(null);
    pendingDragRef.current = null;
    if (e.touches.length === 2) {
      // Begin pinch-to-zoom — cancel any active pan
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      pinchStartRef.current = { dist, zoom, pan: { x: pan.x, y: pan.y }, cx, cy };
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsPanning(true);
      panStartRef.current = { x: touch.clientX, y: touch.clientY, px: pan.x, py: pan.y };
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (drawingMode) return;
    // Pinch-to-zoom with two fingers
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = dist / pinchStartRef.current.dist;
      const newZoom = Math.max(0.15, Math.min(4, pinchStartRef.current.zoom * scale));
      // Keep the pinch midpoint fixed in canvas space
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const px = pinchStartRef.current.cx - rect.left;
        const py = pinchStartRef.current.cy - rect.top;
        const wx = (px - pinchStartRef.current.pan.x) / pinchStartRef.current.zoom;
        const wy = (py - pinchStartRef.current.pan.y) / pinchStartRef.current.zoom;
        setPan({ x: px - wx * newZoom, y: py - wy * newZoom });
      }
      setZoom(newZoom);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Cancel any pending long-press arm if finger moves beyond slop before timer fires
    if (longPressArmRef.current && longPressArmRef.current.timer) {
      const dx = touch.clientX - longPressArmRef.current.startX;
      const dy = touch.clientY - longPressArmRef.current.startY;
      if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) {
        cancelLongPress();
      }
    }
    // Threshold-based drag: activate once finger moves > 8px from pending-drag start
    if (pendingDragRef.current && draggingId === null && e.touches.length === 1) {
      const pdx = touch.clientX - pendingDragRef.current.x;
      const pdy = touch.clientY - pendingDragRef.current.y;
      if (Math.hypot(pdx, pdy) > 8) {
        const pd = pendingDragRef.current;
        dragStartRef.current = { x: pd.x, y: pd.y, elX: pd.elX, elY: pd.elY };
        setDraggingId(pd.id);
        pendingDragRef.current = null;
      }
      return;
    }
    if (draggingId !== null && dragStartRef.current) {
      e.preventDefault();
      const dx = (touch.clientX - dragStartRef.current.x) / zoom;
      const dy = (touch.clientY - dragStartRef.current.y) / zoom;
      const newX = dragStartRef.current.elX + dx;
      const newY = dragStartRef.current.elY + dy;
      const draggedEl = elements[draggingId];
      const prevX = draggedEl?.x ?? newX;
      const prevY = draggedEl?.y ?? newY;
      moveElement(draggingId, newX, newY);
      if (draggedEl?.type === "column") {
        const childDx = newX - prevX;
        const childDy = newY - prevY;
        Object.values(elements).forEach((child) => {
          if (child.parentColumnId === draggingId) {
            moveElement(child.id, child.x + childDx, child.y + childDy);
          }
        });
      }
      if (draggedEl?.type === "room_zone") {
        zoneChildrenRef.current.forEach((zc) => {
          moveElement(zc.id, newX + zc.offsetX, newY + zc.offsetY);
        });
      }
    } else if (isPanning && panStartRef.current && e.touches.length === 1) {
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
    }
  };

  const handleCanvasTouchEnd = () => {
    pinchStartRef.current = null;
    pendingDragRef.current = null;
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingId !== null && selectedBoardId) {
      const draggedId = draggingId;
      const el = elements[draggedId];
      const startPos = dragStartRef.current;
      if (el) {
        const snappedX = Math.round(el.x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(el.y / GRID_SIZE) * GRID_SIZE;
        if (startPos && (startPos.elX !== snappedX || startPos.elY !== snappedY)) {
          pushUndo({ type: "move", elementId: draggedId, prevX: startPos.elX, prevY: startPos.elY });
        }
        moveElement(draggedId, snappedX, snappedY);
        sendElementMove(draggedId, snappedX, snappedY);
        if (el.type === "room_zone") {
          zoneChildrenRef.current.forEach((zc) => {
            const cx = Math.round((snappedX + zc.offsetX) / GRID_SIZE) * GRID_SIZE;
            const cy = Math.round((snappedY + zc.offsetY) / GRID_SIZE) * GRID_SIZE;
            moveElement(zc.id, cx, cy);
            sendElementMove(zc.id, cx, cy);
          });
          zoneChildrenRef.current = [];
        }
      }
      debouncedSavePositions(selectedBoardId);
      setDraggingId(null);
      dragStartRef.current = null;
      if (el && el.type !== "column") {
        requestAnimationFrame(() => {
          assignToColumn(draggedId);
        });
      }
    }
    handleLongPressEnd();
  };

  const assignToColumn = (elementId: number) => {
    const el = elements[elementId];
    if (!el || el.type === "column" || el.type === "section_header" || el.type === "room_zone") return;
    const cx = el.x + (el.width / 2);
    const cy = el.y + ((el.height || 60) / 2);
    let foundColumn: number | null = null;
    Object.values(elements).forEach((col) => {
      if (col.type !== "column" || col.id === elementId) return;
      const colChildEls = Object.values(elements).filter((e) => e.parentColumnId === col.id && e.id !== elementId);
      const colChildrenBottom = colChildEls.reduce((acc, child) => {
        return Math.max(acc, (child.y - col.y) + (child.height || 60) + 12);
      }, 0);
      const colHeight = Math.max(col.height || 300, colChildrenBottom, 300);
      if (
        cx >= col.x &&
        cx <= col.x + col.width &&
        cy >= col.y &&
        cy <= col.y + colHeight
      ) {
        foundColumn = col.id;
      }
    });
    if (foundColumn !== el.parentColumnId) {
      setDroppingIds((prev) => new Set(prev).add(elementId));
      const existingTimer = droppingTimersRef.current.get(elementId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        droppingTimersRef.current.delete(elementId);
        setDroppingIds((prev) => {
          const next = new Set(prev);
          next.delete(elementId);
          return next;
        });
      }, 350);
      droppingTimersRef.current.set(elementId, timer);

      if (foundColumn !== null) {
        const col = elements[foundColumn];
        const padding = 12;
        const headerHeight = 50;
        const fitWidth = col.width - padding * 2;
        const siblings = Object.values(elements).filter(
          (e) => e.parentColumnId === foundColumn && e.id !== elementId
        );
        const stackY = siblings.reduce((acc, sib) => {
          const sibBottom = sib.y + (sib.height || 60);
          return Math.max(acc, sibBottom);
        }, col.y + headerHeight);

        const updates: Partial<CanvasElement> = {
          parentColumnId: foundColumn,
          width: fitWidth,
          x: col.x + padding,
          y: stackY + 8,
        };

        if (el.type === "image" && el.width > 0 && el.height && el.height > 0) {
          const aspectRatio = el.height / el.width;
          updates.height = Math.round(fitWidth * aspectRatio);
        } else if (el.type === "color_swatch") {
          updates.height = el.height;
        } else if (el.type === "link") {
          updates.height = Math.max(el.height || 100, 120);
        }

        updateElement(elementId, updates);
      } else {
        updateElement(elementId, { parentColumnId: foundColumn });
      }
    }
  };

  const formatText = (text: string, start: number, end: number, format: string): { newText: string; cursor: number } => {
    const selected = text.substring(start, end);
    let newText = text;
    let cursor = end;
    if (format === "bold") {
      newText = text.substring(0, start) + `**${selected || "text"}**` + text.substring(end);
      cursor = start + (selected ? selected.length + 4 : 6);
    } else if (format === "italic") {
      newText = text.substring(0, start) + `*${selected || "text"}*` + text.substring(end);
      cursor = start + (selected ? selected.length + 2 : 5);
    } else if (format === "strikethrough") {
      newText = text.substring(0, start) + `~~${selected || "text"}~~` + text.substring(end);
      cursor = start + (selected ? selected.length + 4 : 6);
    } else if (format === "underline") {
      newText = text.substring(0, start) + `__${selected || "text"}__` + text.substring(end);
      cursor = start + (selected ? selected.length + 4 : 6);
    } else if (format === "bullet") {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      newText = text.substring(0, lineStart) + "\u2022 " + text.substring(lineStart);
      cursor = end + 2;
    } else if (format === "numbered") {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      newText = text.substring(0, lineStart) + "1. " + text.substring(lineStart);
      cursor = end + 3;
    } else if (format === "code") {
      newText = text.substring(0, start) + "`" + (selected || "code") + "`" + text.substring(end);
      cursor = start + (selected ? selected.length + 2 : 5);
    } else if (format === "link") {
      newText = text.substring(0, start) + `[${selected || "text"}](url)` + text.substring(end);
      cursor = start + (selected ? selected.length + 7 : 11);
    }
    return { newText, cursor };
  };

  const applyFormat = (elementId: number, format: string) => {
    const el = elements[elementId];
    if (!el) return;
    const cont = (el.content || {}) as any;

    if (el.type === "todo" && focusedTodoItem && focusedTodoItem.elementId === elementId) {
      const refKey = `${elementId}-todo-${focusedTodoItem.itemIdx}`;
      const input = noteTextareaRefs.current[refKey];
      if (!input) return;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const { newText, cursor } = formatText(input.value, start, end, format);
      input.value = newText;
      input.setSelectionRange(cursor, cursor);
      input.focus();
      const newItems = [...(cont.items || [])];
      newItems[focusedTodoItem.itemIdx] = { ...newItems[focusedTodoItem.itemIdx], text: newText };
      handleUpdateContent(elementId, { ...cont, items: newItems });
    } else {
      const refKey = `${elementId}-note`;
      const ta = noteTextareaRefs.current[refKey];
      if (!ta) return;
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const { newText, cursor } = formatText(ta.value, start, end, format);
      ta.value = newText;
      ta.setSelectionRange(cursor, cursor);
      ta.focus();
      handleUpdateContent(elementId, { ...cont, text: newText });
    }
  };

  // Inline formatting chip — a single contextual button on the card's action row.
  // Tapping opens a popover with bold/italic/list/link/etc. so we don't ship a third
  // floating toolbar competing with the top toolbar and Add palette.
  const renderFormattingChip = (elementId: number) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Format text"
          data-testid={`format-chip-${elementId}`}
        >
          <Bold className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-auto p-1 flex items-center gap-0.5"
        onMouseDown={(e) => e.stopPropagation()}
        data-testid={`format-popover-${elementId}`}
      >
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "bold")} data-testid={`format-bold-${elementId}`} aria-label="Bold"><Bold className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "italic")} data-testid={`format-italic-${elementId}`} aria-label="Italic"><Italic className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "strikethrough")} data-testid={`format-strikethrough-${elementId}`} aria-label="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "underline")} data-testid={`format-underline-${elementId}`} aria-label="Underline"><Underline className="h-3.5 w-3.5" /></button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "bullet")} data-testid={`format-bullet-${elementId}`} aria-label="Bulleted list"><List className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "numbered")} data-testid={`format-numbered-${elementId}`} aria-label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "code")} data-testid={`format-code-${elementId}`} aria-label="Code"><Code className="h-3.5 w-3.5" /></button>
        <button className="p-1.5 rounded hover:bg-muted transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center" onClick={() => applyFormat(elementId, "link")} data-testid={`format-link-${elementId}`} aria-label="Link"><LinkIcon className="h-3.5 w-3.5" /></button>
      </PopoverContent>
    </Popover>
  );

  const handleAddImageByUrl = async (url: string) => {
    if (!selectedBoardId || !url.trim()) return;
    const newZ = maxZ;
    setMaxZ((z: number) => z + 1);
    const centerX = Math.round((-pan.x + (containerRef.current?.clientWidth || 800) / 2) / zoom - 120);
    const centerY = Math.round((-pan.y + (containerRef.current?.clientHeight || 600) / 2) / zoom - 100);
    try {
      const apiUrl = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "image", x: centerX, y: centerY, width: 240, height: 200, zIndex: newZ, content: { url: url.trim(), caption: "" } }),
      });
      const el = await res.json();
      addElement(el);
      sendElementAdd(el);
      setShowImagePopup(false);
      setImageUrlInput("");
    } catch {
      toast({ title: "Error", description: "Failed to add image", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!showImagePopup) return;
    const timer = setTimeout(() => imageUrlInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [showImagePopup]);

  const drawPathsRef = useRef<any[]>([]);
  const isDrawingRef = useRef(false);
  const holdSnapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMoveTimeRef = useRef(0);
  const handwritingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [autoTextConverting, setAutoTextConverting] = useState(false);

  const redrawOverlayCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    const paths = drawPathsRef.current;
    for (let p = 0; p < paths.length; p++) {
      const path = paths[p];
      if (!path.points || path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.color || "#1e3a2f";
      ctx.lineWidth = path.strokeWidth || 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [pan, zoom]);

  // Panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (drawingMode) return;
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  };

  const lastCursorSentRef = useRef(0);

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (connectMode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setConnectCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (drawingMode) return;

    if (containerRef.current) {
      const now = Date.now();
      if (now - lastCursorSentRef.current > 50) {
        lastCursorSentRef.current = now;
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / zoom;
        const canvasY = (e.clientY - rect.top - pan.y) / zoom;
        sendCursorMove(canvasX, canvasY);
      }
    }

    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
    }
    if (draggingId !== null && dragStartRef.current) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      const newX = dragStartRef.current.elX + dx;
      const newY = dragStartRef.current.elY + dy;
      const draggedEl = elements[draggingId];
      const prevX = draggedEl?.x ?? newX;
      const prevY = draggedEl?.y ?? newY;
      moveElement(draggingId, newX, newY);
      if (draggedEl?.type === "column") {
        const childDx = newX - prevX;
        const childDy = newY - prevY;
        Object.values(elements).forEach((child) => {
          if (child.parentColumnId === draggingId) {
            moveElement(child.id, child.x + childDx, child.y + childDy);
          }
        });
      }
      if (draggedEl?.type === "room_zone") {
        zoneChildrenRef.current.forEach((zc) => {
          moveElement(zc.id, newX + zc.offsetX, newY + zc.offsetY);
        });
      }
    }
    if (resizingId !== null && resizeStartRef.current) {
      const r = resizeStartRef.current;
      const dx = (e.clientX - r.x) / zoom;
      const dy = (e.clientY - r.y) / zoom;
      let newW = r.elW;
      let newH = r.elH;
      let newX = r.elX;
      let newY = r.elY;
      if (r.handle.includes("r")) newW = Math.max(80, r.elW + dx);
      if (r.handle.includes("b")) newH = Math.max(60, r.elH + dy);
      if (r.handle.includes("l")) { newW = Math.max(80, r.elW - dx); newX = r.elX + (r.elW - newW); }
      if (r.handle.includes("t")) { newH = Math.max(60, r.elH - dy); newY = r.elY + (r.elH - newH); }
      updateElement(resizingId, { width: newW, height: newH });
      moveElement(resizingId, newX, newY);
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingId !== null && selectedBoardId) {
      const draggedId = draggingId;
      const el = elements[draggedId];
      const startPos = dragStartRef.current;
      if (el) {
        const snappedX = Math.round(el.x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(el.y / GRID_SIZE) * GRID_SIZE;
        if (startPos && (startPos.elX !== snappedX || startPos.elY !== snappedY)) {
          pushUndo({ type: "move", elementId: draggedId, prevX: startPos.elX, prevY: startPos.elY });
        }
        moveElement(draggedId, snappedX, snappedY);
        sendElementMove(draggedId, snappedX, snappedY);
        if (el.type === "room_zone") {
          zoneChildrenRef.current.forEach((zc) => {
            const cx = Math.round((snappedX + zc.offsetX) / GRID_SIZE) * GRID_SIZE;
            const cy = Math.round((snappedY + zc.offsetY) / GRID_SIZE) * GRID_SIZE;
            moveElement(zc.id, cx, cy);
            sendElementMove(zc.id, cx, cy);
          });
          zoneChildrenRef.current = [];
        }
      }
      debouncedSavePositions(selectedBoardId);
      setDraggingId(null);
      dragStartRef.current = null;
      if (el && el.type !== "column") {
        requestAnimationFrame(() => {
          assignToColumn(draggedId);
        });
      }
    }
    if (resizingId !== null && selectedBoardId) {
      const el = elements[resizingId];
      if (el) {
        const snappedW = Math.round((el.width || 200) / GRID_SIZE) * GRID_SIZE;
        const snappedH = Math.round((el.height || 200) / GRID_SIZE) * GRID_SIZE;
        const snappedX = Math.round(el.x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(el.y / GRID_SIZE) * GRID_SIZE;
        updateElement(resizingId, { width: snappedW, height: snappedH });
        moveElement(resizingId, snappedX, snappedY);
        sendElementMove(resizingId, snappedX, snappedY);
      }
      debouncedSavePositions(selectedBoardId);
      setResizingId(null);
      resizeStartRef.current = null;
    }
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY / 300;
        const newZoom = Math.max(0.15, Math.min(4, zoom + delta));
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const wx = (mx - pan.x) / zoom;
          const wy = (my - pan.y) / zoom;
          setPan({ x: mx - wx * newZoom, y: my - wy * newZoom });
        }
        setZoom(newZoom);
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    },
    [zoom, pan],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceRef.current = true;
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        if (isPanning) {
          setIsPanning(false);
          panStartRef.current = null;
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingId && !lockLayout && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          handleDeleteElement(editingId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [isPanning, editingId]);

  const fitToScreen = () => {
    const els = Object.values(elements);
    if (els.length === 0) { setPan({ x: 0, y: 0 }); setZoom(1); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    els.forEach((e) => {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width);
      maxY = Math.max(maxY, e.y + e.height);
    });
    const cw = containerRef.current?.clientWidth || 800;
    const ch = containerRef.current?.clientHeight || 600;
    const PAD = 80;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const newZoom = Math.min((cw - PAD * 2) / contentW, (ch - PAD * 2) / contentH, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setPan({ x: cw / 2 - cx * newZoom, y: ch / 2 - cy * newZoom });
    setZoom(Math.max(0.15, newZoom));
  };

  const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(1); };

  // Auto fit-to-screen when a board is first opened on a touch device
  useEffect(() => {
    if (!selectedBoardId || !("ontouchstart" in window)) return;
    const timer = setTimeout(() => fitToScreen(), 150);
    return () => clearTimeout(timer);
  }, [selectedBoardId]);

  const startResize = (id: number, handle: string, e: React.MouseEvent) => {
    if (lockLayout) return;
    e.stopPropagation();
    e.preventDefault();
    const el = elements[id];
    if (!el) return;
    setResizingId(id);
    setEditingId(id);
    resizeStartRef.current = {
      x: e.clientX, y: e.clientY,
      elW: el.width || 200, elH: el.height || 200,
      elX: el.x, elY: el.y,
      handle,
    };
  };

  const startDrag = (id: number, e: React.MouseEvent) => {
    if (lockLayout) {
      // Locked layout: select but never start a drag.
      e.stopPropagation();
      setEditingId(id);
      return;
    }
    e.stopPropagation();
    const el = elements[id];
    if (!el) return;
    const newZ = maxZ;
    setMaxZ((z) => z + 1);
    updateElement(id, { zIndex: newZ });
    setDraggingId(id);
    setEditingId(id);
    dragStartRef.current = { x: e.clientX, y: e.clientY, elX: el.x, elY: el.y };
    if (el.type === "room_zone") {
      const zoneRight = el.x + (el.width || 500);
      const zoneBottom = el.y + (el.height || 400);
      zoneChildrenRef.current = Object.values(elements)
        .filter((child) => child.id !== id && child.type !== "room_zone" && child.x >= el.x && child.y >= el.y && child.x < zoneRight && child.y < zoneBottom)
        .map((child) => ({ id: child.id, offsetX: child.x - el.x, offsetY: child.y - el.y }));
    } else {
      zoneChildrenRef.current = [];
    }
  };

  useEffect(() => {
    if (drawingMode) redrawOverlayCanvas();
  }, [drawingMode, redrawOverlayCanvas]);

  useEffect(() => {
    if (!drawingMode) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const syncSize = () => {
      if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        drawPathsRef.current = drawingPaths;
        redrawOverlayCanvas();
      }
    };
    syncSize();
    const ro = new ResizeObserver(() => syncSize());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [drawingMode, drawingPaths, redrawOverlayCanvas]);

  const tryAutoTextConvert = useCallback(async () => {
    const paths = drawPathsRef.current;
    if (paths.length === 0 || !looksLikeHandwriting(paths)) return;
    const hasUnrecognized = paths.some((p: any) => !recognizeShape(p));
    if (!hasUnrecognized) return;

    if (autoConvertInFlightRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    autoConvertInFlightRef.current = true;
    setAutoTextConverting(true);
    try {
      const tempCanvas = document.createElement("canvas");
      const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const path of paths) {
        for (const pt of path.points) {
          if (pt.x < bb.minX) bb.minX = pt.x;
          if (pt.y < bb.minY) bb.minY = pt.y;
          if (pt.x > bb.maxX) bb.maxX = pt.x;
          if (pt.y > bb.maxY) bb.maxY = pt.y;
        }
      }
      const padding = 20;
      const w = bb.maxX - bb.minX + padding * 2;
      const h = bb.maxY - bb.minY + padding * 2;
      const renderScale = 2;
      tempCanvas.width = Math.max(200, Math.min(w * renderScale, 800));
      tempCanvas.height = Math.max(100, Math.min(h * renderScale, 500));
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      const scale = Math.min(tempCanvas.width / w, tempCanvas.height / h);
      ctx.translate(padding * scale, padding * scale);
      ctx.scale(scale, scale);
      ctx.translate(-bb.minX, -bb.minY);
      for (const path of paths) {
        if (!path.points || path.points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = Math.max(3, (path.strokeWidth || 3) * 1.5);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      }
      const imageData = tempCanvas.toDataURL("image/png");
      const resp = await fetch("/api/ai/recognize-handwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageData }),
      });
      if (resp.ok) {
        const { text } = await resp.json();
        if (text && text.trim().length > 0 && selectedBoardId) {
          const topMaxZ = Math.max(0, ...Object.values(elements).map((el) => el.zIndex || 0));
          const noteWidth = Math.max(220, Math.min(text.trim().length * 10, 360));
          const noteHeight = Math.max(80, Math.ceil(text.trim().length / 30) * 28 + 60);
          const apiUrl = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              type: "note",
              x: bb.minX,
              y: bb.minY - 10,
              width: noteWidth,
              height: noteHeight,
              zIndex: topMaxZ + 1,
              content: { title: "", text: text.trim(), plain: true },
            }),
          });
          const el = await res.json();
          addElement(el);
          sendElementAdd(el);
          drawPathsRef.current = [];
          setDrawingPaths([]);
          redrawOverlayCanvas();
          toast({ title: "Text Recognized", description: `"${text.trim()}"` });
        }
      }
    } catch (err) {
      console.error("Auto text conversion error:", err);
    } finally {
      setAutoTextConverting(false);
      autoConvertInFlightRef.current = false;
    }
  }, [selectedBoardId, elements, addElement, redrawOverlayCanvas, toast]);

  // Try to snap the last drawn path to a recognized shape
  const trySnapLastPath = useCallback(() => {
    const paths = drawPathsRef.current;
    if (paths.length === 0) return;
    const lastPath = paths[paths.length - 1];
    if (!lastPath || !lastPath.points || lastPath.points.length < 3) return;
    const recognized = recognizeShape(lastPath, paths.length);
    if (recognized) {
      const snapped = { ...recognized, color: lastPath.color, strokeWidth: lastPath.strokeWidth };
      const newPaths = [...paths.slice(0, -1), snapped];
      drawPathsRef.current = newPaths;
      setDrawingPaths(newPaths);
      redrawOverlayCanvas();
    }
  }, [redrawOverlayCanvas]);

  const pendingFreestandingDrawRef = useRef<{
    points: Array<{ x: number; y: number; pressure: number }>;
    color: string;
    strokeWidth: number;
  } | null>(null);
  const [liveFreestandingDraw, setLiveFreestandingDraw] = useState<{
    points: StrokePoint[];
    color: string;
    width: number;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Pointer-based drawing (Pencil + finger-draw + mouse) — produces perfect-freehand strokes.
  // Routes ink either to a per-element annotation layer (when pointerdown started over a card)
  // or to a freestanding board-level draw element (legacy flow).
  // Palm rejection: when a Pen pointer is active, all concurrent touch pointers are ignored.
  // ---------------------------------------------------------------------------
  const elementHitAt = useCallback((clientX: number, clientY: number): CanvasElement | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const wx = (clientX - rect.left - pan.x) / zoom;
    const wy = (clientY - rect.top - pan.y) / zoom;
    let best: CanvasElement | null = null;
    let bestZ = -Infinity;
    Object.values(elements).forEach((el) => {
      if (el.type === "section_header" || el.type === "draw" || el.type === "room_zone" || el.type === "connector") return;
      const w = el.width || 200;
      const h = el.height || 60;
      if (wx >= el.x && wx <= el.x + w && wy >= el.y && wy <= el.y + h) {
        const z = el.zIndex || 0;
        if (z > bestZ) {
          bestZ = z;
          best = el;
        }
      }
    });
    return best;
  }, [pan, zoom, elements]);

  // Should this pointer draw?
  // pen → always draws.
  // touch → only if fingerDrawing toggle is on.
  // mouse → only if drawingMode is on.
  const shouldPointerDraw = useCallback((pointerType: string): boolean => {
    if (connectMode) return false;
    if (pointerType === "pen") return true;
    if (pointerType === "touch") return fingerDrawing && drawingMode;
    return drawingMode;
  }, [fingerDrawing, drawingMode, connectMode]);

  // Attach native DOM event listeners for drawing - works reliably on mouse, touch, and stylus
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !drawingMode) return;

    const getBoard = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    };

    const clearHoldTimer = () => {
      if (holdSnapTimerRef.current) {
        clearTimeout(holdSnapTimerRef.current);
        holdSnapTimerRef.current = null;
      }
    };

    const startHoldTimer = () => {
      clearHoldTimer();
      holdSnapTimerRef.current = setTimeout(() => {
        if (isDrawingRef.current) {
          trySnapLastPath();
        }
      }, 500);
    };

    const handleDown = (clientX: number, clientY: number) => {
      if (!canvas || canvas.width === 0 || canvas.height === 0) return;
      clearHoldTimer();
      if (handwritingTimerRef.current) {
        clearTimeout(handwritingTimerRef.current);
        handwritingTimerRef.current = null;
      }
      const { x, y } = getBoard(clientX, clientY);
      if (drawTool === "eraser") {
        const newPaths = drawPathsRef.current.filter((p: any) =>
          !p.points.some((pt: any) => Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2) < 15 / zoom)
        );
        drawPathsRef.current = newPaths;
        setDrawingPaths(newPaths);
        redrawOverlayCanvas();
      } else {
        isDrawingRef.current = true;
        setIsDrawing(true);
        lastMoveTimeRef.current = Date.now();
        const newPath = { points: [{ x, y }], color: drawColor, strokeWidth: drawStrokeWidth };
        drawPathsRef.current = [...drawPathsRef.current, newPath];
        setDrawingPaths([...drawPathsRef.current]);
      }
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDrawingRef.current || drawTool !== "pen") return;
      const { x, y } = getBoard(clientX, clientY);
      const paths = drawPathsRef.current;
      const last = paths[paths.length - 1];
      if (last) {
        last.points.push({ x, y });
        lastMoveTimeRef.current = Date.now();
        redrawOverlayCanvas();
        startHoldTimer();
      }
    };

    const handleUp = () => {
      clearHoldTimer();
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        trySnapLastPath();
        setDrawingPaths([...drawPathsRef.current]);
        if (handwritingTimerRef.current) {
          clearTimeout(handwritingTimerRef.current);
        }
        handwritingTimerRef.current = setTimeout(() => {
          if (!isDrawingRef.current) {
            tryAutoTextConvert();
          }
        }, 800);
      }
    };

    // Mouse events
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleDown(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      e.stopPropagation();
      handleUp();
    };

    // Touch events
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        handleDown(t.clientX, t.clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        handleMove(t.clientX, t.clientY);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
      handleUp();
    };

    canvas.addEventListener("mousedown", onMouseDown, { passive: false });
    canvas.addEventListener("mousemove", onMouseMove, { passive: false });
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    return () => {
      clearHoldTimer();
      if (handwritingTimerRef.current) {
        clearTimeout(handwritingTimerRef.current);
      }
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [drawingMode, drawTool, drawColor, drawStrokeWidth, pan, zoom, redrawOverlayCanvas, trySnapLastPath, tryAutoTextConvert]);

  // Save an annotation stroke to the element's content.annotations array.
  const saveAnnotationStroke = useCallback(async (elementId: number, stroke: Stroke) => {
    const el = elements[elementId];
    if (!el) return;
    const c = (el.content || {}) as any;
    const prev: Stroke[] = Array.isArray(c.annotations) ? c.annotations : [];
    const nextAnnotations = [...prev, stroke];
    const nextContent = { ...c, annotations: nextAnnotations };
    pushUndo({ type: "update", elementId, prevUpdates: { content: { ...c } } });
    updateElement(elementId, { content: nextContent });
    sendElementUpdate(elementId, { content: nextContent });
    try {
      const url = buildUrl(api.canvasElements.update.path, { id: elementId });
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: nextContent }),
      });
    } catch {
      toast({ title: "Error", description: "Failed to save annotation", variant: "destructive" });
    }
  }, [elements, pushUndo, updateElement, sendElementUpdate, toast]);

  // Pointer-event pipeline. Attached to the canvas viewport. Branches by pointerType:
  //   pen → always ink (annotates element if pointerdown is over one, else freestanding draw)
  //   touch → ink only when fingerDrawing toggle is on
  //   mouse → existing handlers continue to drive selection/drag; this pipeline only inks if drawingMode is on
  // Palm rejection: any touch pointer that arrives while a pen pointer is active is ignored.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const getBoardCoord = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      // Palm rejection.
      if (penActiveRef.current && e.pointerType === "touch") {
        e.preventDefault();
        return;
      }
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (e.pointerType === "pen") {
        penActiveRef.current = true;
      }
      if (!shouldPointerDraw(e.pointerType)) return;
      // Don't start an ink stroke if the user is interacting with an input or button.
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input,textarea,button,[data-no-ink]"))) return;

      // Capture the pointer so subsequent move/up events fire even if we leave the element.
      try { (e.currentTarget as Element)?.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();

      const hit = elementHitAt(e.clientX, e.clientY);
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : (e.pointerType === "pen" ? 0.5 : 0.5);

      if (hit && (e.pointerType === "pen" || (e.pointerType !== "pen" && (drawingMode || fingerDrawing)))) {
        // Annotate ON the element. Coordinates are stored relative to the element's top-left.
        const board = getBoardCoord(e.clientX, e.clientY);
        elementInkRef.current = {
          pointerId: e.pointerId,
          elementId: hit.id,
          points: [[board.x - hit.x, board.y - hit.y, pressure]],
          color: drawColor,
          width: drawStrokeWidth * 2.4,
        };
        setLiveElementStroke({
          elementId: hit.id,
          stroke: {
            id: `live-${e.pointerId}`,
            points: elementInkRef.current.points,
            color: drawColor,
            width: drawStrokeWidth * 2.4,
            createdAt: Date.now(),
            createdBy: user?.id,
          },
        });
      } else {
        // Freestanding draw: only when drawingMode is on (preserves legacy save UX).
        if (!drawingMode && e.pointerType !== "pen") return;
        if (!drawingMode && e.pointerType === "pen") {
          // Pencil on empty canvas → enter drawingMode automatically so the existing save UI shows up
          setDrawingMode(true);
          setDrawTool("pen");
        }
        const board = getBoardCoord(e.clientX, e.clientY);
        pendingFreestandingDrawRef.current = {
          points: [{ x: board.x, y: board.y, pressure }],
          color: drawColor,
          strokeWidth: drawStrokeWidth,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (penActiveRef.current && e.pointerType === "touch") return; // palm rejection
      const tracker = activePointersRef.current.get(e.pointerId);
      if (tracker) {
        tracker.x = e.clientX;
        tracker.y = e.clientY;
      }
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

      const ink = elementInkRef.current;
      if (ink && ink.pointerId === e.pointerId) {
        const el = elements[ink.elementId];
        if (!el) return;
        const board = getBoardCoord(e.clientX, e.clientY);
        ink.points.push([board.x - el.x, board.y - el.y, pressure]);
        setLiveElementStroke({
          elementId: ink.elementId,
          stroke: {
            id: `live-${e.pointerId}`,
            points: [...ink.points],
            color: ink.color,
            width: ink.width,
            createdAt: Date.now(),
            createdBy: user?.id,
          },
        });
        e.preventDefault();
        return;
      }

      const fs = pendingFreestandingDrawRef.current;
      if (fs) {
        const board = getBoardCoord(e.clientX, e.clientY);
        fs.points.push({ x: board.x, y: board.y, pressure });
        setLiveFreestandingDraw({
          points: fs.points.map((p) => [p.x, p.y, p.pressure] as StrokePoint),
          color: fs.color,
          width: fs.strokeWidth * 2.4,
        });
        e.preventDefault();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      if (e.pointerType === "pen") {
        // No more pen pointers? Clear palm-rejection flag.
        let stillPen = false;
        activePointersRef.current.forEach((v) => { if (v.type === "pen") stillPen = true; });
        if (!stillPen) penActiveRef.current = false;
      }

      const ink = elementInkRef.current;
      if (ink && ink.pointerId === e.pointerId) {
        const stroke: Stroke = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          points: ink.points,
          color: ink.color,
          width: ink.width,
          createdAt: Date.now(),
          createdBy: user?.id,
        };
        if (stroke.points.length >= 2) saveAnnotationStroke(ink.elementId, stroke);
        elementInkRef.current = null;
        setLiveElementStroke(null);
        return;
      }

      const fs = pendingFreestandingDrawRef.current;
      if (fs) {
        // Push into the existing drawing pipeline so legacy save / shape recognition keeps working.
        if (fs.points.length >= 2) {
          const newPath = {
            points: fs.points.map((p) => ({ x: p.x, y: p.y })),
            color: fs.color,
            strokeWidth: fs.strokeWidth,
            pressurePoints: fs.points.map((p) => [p.x, p.y, p.pressure] as StrokePoint),
          };
          drawPathsRef.current = [...drawPathsRef.current, newPath];
          setDrawingPaths([...drawPathsRef.current]);
          if (drawingMode) {
            redrawOverlayCanvas();
            // Trigger handwriting auto-convert on idle, matching the legacy timer.
            if (handwritingTimerRef.current) clearTimeout(handwritingTimerRef.current);
            handwritingTimerRef.current = setTimeout(() => {
              tryAutoTextConvert();
            }, 800);
          }
        }
        pendingFreestandingDrawRef.current = null;
        setLiveFreestandingDraw(null);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      if (elementInkRef.current?.pointerId === e.pointerId) {
        elementInkRef.current = null;
        setLiveElementStroke(null);
      }
      if (pendingFreestandingDrawRef.current) {
        pendingFreestandingDrawRef.current = null;
        setLiveFreestandingDraw(null);
      }
      let stillPen = false;
      activePointersRef.current.forEach((v) => { if (v.type === "pen") stillPen = true; });
      if (!stillPen) penActiveRef.current = false;
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerCancel);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [pan, zoom, elements, elementHitAt, shouldPointerDraw, drawColor, drawStrokeWidth, drawingMode, fingerDrawing, redrawOverlayCanvas, saveAnnotationStroke, tryAutoTextConvert, user]);

  const selectedBoard = boards.find((b: PlanningBoardType) => b.id === selectedBoardId);
  const clientProject = allProjects.find((p: any) => p.id === projectId);
  const clientUser = allUsers.find((u: any) => u.id === clientProject?.clientId);
  const clientIsLinked = clientUser ? (selectedBoard?.linkedUserIds || []).includes(clientUser.id) : false;
  const toggleClientAccess = () => {
    if (!clientUser) return;
    toggleLinkedUser(clientUser.id);
  };
  const elementsList = Object.values(elements);

  // Card renderers
  const renderElement = (el: CanvasElement) => {
    const isSelected = editingId === el.id;
    const isDragging = draggingId === el.id;
    const isUnlocked = mobileUnlockedId === el.id;
    const c = (el.content || {}) as any;
    const activeEdit = activeEdits[el.id];

    // Connectors are rendered by the SVG overlay, not as cards.
    if (el.type === "connector") return null;

    const parentCol = el.parentColumnId ? elements[el.parentColumnId] : null;
    const effectiveZ = parentCol ? Math.max(el.zIndex, (parentCol.zIndex || 0) + 1) : el.zIndex;
    const isDropping = droppingIds.has(el.id);
    const cardBase = `board-card absolute rounded select-none ${isUnlocked ? "ring-2 ring-amber-400/70" : ""} ${isSelected && !activeEdit ? "is-selected" : ""} ${isDragging ? "is-dragging opacity-80 cursor-grabbing" : ""} ${isDropping && !isDragging ? "transition-[left,top,width,height] duration-300 ease-out" : ""}`;

    // Gesture rule: single tap = select. Double-tap = activate. Long-press = move (touch).
    // Activation is the type-specific "open / edit / interact" action — must never fire on a single tap.
    const handleActivate = () => {
      if (el.type === "board_link" && c.targetBoardId) {
        setSelectedBoardId(c.targetBoardId);
        return;
      }
      if (el.type === "image" && !c.url) {
        triggerImageUpload(el.id);
        return;
      }
      if (el.type === "link" && c.url) {
        window.open(c.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (el.type === "hardware" && c.vendorUrl) {
        window.open(c.vendorUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (el.type === "product" && c.url) {
        window.open(c.url, "_blank", "noopener,noreferrer");
        return;
      }
      // Other types: activation just selects (which already enters edit mode for editable cards).
      setEditingId(el.id);
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (connectMode) {
        if (connectSourceId === null) {
          setConnectSourceId(el.id);
        } else if (connectSourceId === el.id) {
          // Tap same element — no-op.
        } else {
          createConnector(connectSourceId, el.id);
          exitConnectMode();
        }
        return;
      }
      // Single tap = select only. Never opens / uploads / navigates.
      setEditingId(el.id);
      setSelectedConnectorId(null);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (connectMode) return;
      handleActivate();
    };

    // Whether this element has a meaningful "activate" action that differs from select.
    const hasActivateAction =
      (el.type === "board_link" && !!c.targetBoardId) ||
      (el.type === "image" && !c.url) ||
      (el.type === "link" && !!c.url) ||
      (el.type === "hardware" && !!c.vendorUrl) ||
      (el.type === "product" && !!c.url);

    // Open-icon button shown on selected element as an explicit alternative to double-tap.
    const renderOpenButton = () => (
      hasActivateAction ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 md:h-6 md:w-6 hover:bg-primary/10 hover:text-primary"
              onClick={(e) => { e.stopPropagation(); handleActivate(); }}
              data-testid={`button-activate-${el.id}`}
              aria-label="Open"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Open (or double-tap)</TooltipContent>
        </Tooltip>
      ) : null
    );

    const resizeHandles = (elId: number) => {
      if (lockLayout) return null;
      const handleStyle = "absolute opacity-0 hover:opacity-100 transition-opacity z-20";
      const dotStyle = "w-2.5 h-2.5 rounded-full bg-primary/60 border border-primary/80";
      return (
        <>
          <div className={`${handleStyle} -right-1 top-1/2 -translate-y-1/2 cursor-e-resize p-1`} onMouseDown={(e) => startResize(elId, "r", e)} data-testid={`resize-r-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -bottom-1 left-1/2 -translate-x-1/2 cursor-s-resize p-1`} onMouseDown={(e) => startResize(elId, "b", e)} data-testid={`resize-b-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -right-1 -bottom-1 cursor-se-resize p-1`} onMouseDown={(e) => startResize(elId, "br", e)} data-testid={`resize-br-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -left-1 top-1/2 -translate-y-1/2 cursor-w-resize p-1`} onMouseDown={(e) => startResize(elId, "l", e)} data-testid={`resize-l-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} left-1/2 -top-1 -translate-x-1/2 cursor-n-resize p-1`} onMouseDown={(e) => startResize(elId, "t", e)} data-testid={`resize-t-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -left-1 -top-1 cursor-nw-resize p-1`} onMouseDown={(e) => startResize(elId, "tl", e)} data-testid={`resize-tl-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -right-1 -top-1 cursor-ne-resize p-1`} onMouseDown={(e) => startResize(elId, "tr", e)} data-testid={`resize-tr-${elId}`}><div className={dotStyle} /></div>
          <div className={`${handleStyle} -left-1 -bottom-1 cursor-sw-resize p-1`} onMouseDown={(e) => startResize(elId, "bl", e)} data-testid={`resize-bl-${elId}`}><div className={dotStyle} /></div>
        </>
      );
    };

    if (el.type === "room_zone") {
      const childEls = elementsList.filter(
        (child) =>
          child.id !== el.id &&
          child.type !== "room_zone" &&
          child.x >= el.x &&
          child.y >= el.y &&
          child.x < el.x + (el.width || 500) &&
          child.y < el.y + (el.height || 400)
      );
      const draggedType = draggingId !== null ? elements[draggingId]?.type : null;
      const isDroppableType = draggedType !== null && draggedType !== "room_zone" && draggedType !== "section_header";
      const isRoomDropTarget = draggingId !== null && draggingId !== el.id && isDroppableType;
      const dragPreviewEl = isRoomDropTarget && draggingId !== null ? elements[draggingId] : null;
      const maxChildRight = childEls.reduce((max, child) => Math.max(max, child.x + (child.width || 200)), el.x + 260);
      const maxChildBottom = childEls.reduce((max, child) => Math.max(max, child.y + (child.height || 60)), el.y + 120);
      const computedWidth = Math.max(el.width || 500, maxChildRight - el.x + 24);
      const computedHeight = Math.max(el.height || 400, maxChildBottom - el.y + 24);
      const roomDropPreviewTop = childEls.reduce((acc, sib) => {
        const sibBottom = (sib.y - el.y) + (sib.height || 60);
        return Math.max(acc, sibBottom);
      }, 12);
      const roomDropPreviewWidth = computedWidth - 24;
      const roomDropPreviewHeight = dragPreviewEl
        ? dragPreviewEl.type === "image" && dragPreviewEl.width > 0 && dragPreviewEl.height && dragPreviewEl.height > 0
          ? Math.round(roomDropPreviewWidth * (dragPreviewEl.height / dragPreviewEl.width))
          : Math.max(dragPreviewEl.height || 60, 60)
        : 60;
      return (
        <div
          key={el.id}
          className={`${isRoomDropTarget ? "scale-[1.01]" : ""} absolute select-none cursor-grab transition-[width,height,transform,border-color,background-color] duration-200 ease-out`}
          style={{
            left: el.x, top: el.y, width: computedWidth, height: computedHeight,
            zIndex: Math.max(0, effectiveZ - 1000),
            backgroundColor: c.color || "#f0ede8",
            opacity: c.opacity ?? 0.5,
            borderRadius: "12px",
            border: isSelected || isRoomDropTarget ? "2px dashed hsl(var(--primary))" : "1px dashed hsl(var(--border))",
          }}
          data-testid={`room-zone-${el.id}`}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
        >
          <div className="p-3">
            {isSelected ? (
              <div className="space-y-2">
                <input
                  className="w-full bg-transparent border-none text-sm font-serif font-semibold outline-none"
                  style={{ color: getContrastColor(c.color || "#f0ede8") }}
                  defaultValue={c.title}
                  placeholder="Room name..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                  autoFocus
                  data-testid={`input-zone-title-${el.id}`}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={c.color || "#f0ede8"}
                    onChange={(e) => handleUpdateContent(el.id, { ...c, color: e.target.value })}
                    className="h-6 w-8 border rounded cursor-pointer"
                    data-testid={`input-zone-color-${el.id}`}
                  />
                  <span className="text-[10px]" style={{ color: getContrastColor(c.color || "#f0ede8") }}>Zone color</span>
                </div>
              </div>
            ) : (
              <span className="text-sm font-serif font-semibold" style={{ color: getContrastColor(c.color || "#f0ede8") }} data-testid={`text-zone-title-${el.id}`}>
                {c.title || "Room"}
              </span>
            )}
          </div>
          {isRoomDropTarget && dragPreviewEl && (
            <div
              className="absolute border-2 border-dashed border-primary/50 rounded bg-primary/5 animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
              style={{
                left: 12,
                top: roomDropPreviewTop,
                width: roomDropPreviewWidth,
                height: roomDropPreviewHeight,
                transition: "top 180ms ease-out, height 180ms ease-out",
              }}
              data-testid={`room-drop-preview-${el.id}`}
            />
          )}
          {isSelected && (
            <>
              <div className="absolute -top-8 right-0 flex gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {resizeHandles(el.id)}
            </>
          )}
        </div>
      );
    }

    if (el.type === "section_header") {
      return (
        <div
          key={el.id}
          className="absolute select-none"
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          onMouseDown={(e) => startDrag(el.id, e)}
          data-testid={`element-section-header-${el.id}`}
        >
          {(() => {
            const tracking = (c.tracking as "tight" | "normal" | "wide" | undefined) || "normal";
            const align = (c.align as "left" | "center" | undefined) || "left";
            const size = (c.size as "sm" | "md" | "lg" | undefined) || "lg";
            const sizeClass = size === "sm" ? "text-xl" : size === "md" ? "text-2xl" : "text-2xl md:text-3xl";
            const alignClass = align === "center" ? "text-center" : "text-left";
            const headerClass = `board-section-header tracking-${tracking} ${sizeClass} ${alignClass} text-foreground/85`;
            return (
              <>
                {isSelected && (
                  <div className="absolute -top-9 right-0 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-md shadow-sm px-1 py-0.5">
                    <div className="flex items-center gap-0.5 px-1 text-[10px] font-mono text-muted-foreground">
                      {(["sm","md","lg"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${size === s ? "bg-primary/15 text-primary" : ""}`}
                          onClick={() => handleUpdateContent(el.id, { ...c, size: s })}
                          data-testid={`section-size-${s}-${el.id}`}
                        >{s.toUpperCase()}</button>
                      ))}
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-0.5 px-1 text-[10px] font-mono text-muted-foreground">
                      {(["tight","normal","wide"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${tracking === t ? "bg-primary/15 text-primary" : ""}`}
                          onClick={() => handleUpdateContent(el.id, { ...c, tracking: t })}
                          data-testid={`section-tracking-${t}-${el.id}`}
                        >{t}</button>
                      ))}
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-0.5 px-1">
                      {(["left","center"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={`px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors text-[10px] font-mono ${align === a ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                          onClick={() => handleUpdateContent(el.id, { ...c, align: a })}
                          data-testid={`section-align-${a}-${el.id}`}
                        >{a === "left" ? "L" : "C"}</button>
                      ))}
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {isSelected ? (
                  <input
                    className={`w-full bg-transparent border-none ${headerClass} outline-none pb-1`}
                    style={{ borderBottom: "1px solid hsl(var(--border))" }}
                    defaultValue={c.title}
                    onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                    autoFocus
                    data-testid={`input-section-title-${el.id}`}
                  />
                ) : (
                  <div className={`${headerClass} border-b border-border/60 pb-1 cursor-grab`} data-testid={`text-section-title-${el.id}`}>
                    {c.title || "Section Title"}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      );
    }

    if (el.type === "note") {
      return (
        <div
          key={el.id}
          className={`${cardBase} ${c.plain ? "bg-transparent border-0 shadow-none" : "bg-card border border-border"} cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-note-${el.id}`}
        >
          <div className={c.plain ? "p-0" : "p-3.5"}>
            {isSelected ? (
              <div className="space-y-2">
                <input
                  className="w-full bg-transparent border-none text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
                  defaultValue={c.title}
                  placeholder="Title (optional)"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                  data-testid={`input-note-title-${el.id}`}
                />
                <textarea
                  ref={(ref) => { noteTextareaRefs.current[`${el.id}-note`] = ref; }}
                  className="w-full bg-transparent border-none text-sm resize-none outline-none min-h-[60px] placeholder:text-muted-foreground/50"
                  defaultValue={c.text}
                  placeholder="Type your note..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, text: e.target.value })}
                  data-testid={`input-note-text-${el.id}`}
                />
              </div>
            ) : (
              <>
                {c.title && <div className="text-sm font-semibold mb-1">{c.title}</div>}
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{c.text || "Type your note here..."}</div>
              </>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderFormattingChip(el.id)}
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "todo") {
      const items = c.items || [];
      const checked = items.filter((i: any) => i.checked).length;
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: 80, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-todo-${el.id}`}
        >
          <div className="p-3.5">
            <div className="flex items-center justify-between mb-2 gap-1">
              {isSelected ? (
                <input
                  className="flex-1 bg-transparent border-none text-sm font-semibold outline-none"
                  defaultValue={c.title}
                  placeholder="To-do title"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                  data-testid={`input-todo-title-${el.id}`}
                />
              ) : (
                <span className="text-sm font-semibold">{c.title || "To-do"}</span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0">{checked}/{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map((item: any, idx: number) => (
                <label key={idx} className="flex items-start gap-2 cursor-pointer group" data-testid={`todo-item-${el.id}-${idx}`}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      const newItems = [...items];
                      newItems[idx] = { ...newItems[idx], checked: !newItems[idx].checked };
                      handleUpdateContent(el.id, { ...c, items: newItems });
                    }}
                    className="mt-0.5 rounded border-border"
                    data-testid={`checkbox-${el.id}-${idx}`}
                  />
                  {isSelected ? (
                    <input
                      ref={(ref) => { if (ref) noteTextareaRefs.current[`${el.id}-todo-${idx}`] = ref; }}
                      className="flex-1 bg-transparent border-none text-xs outline-none"
                      defaultValue={item.text}
                      onFocus={() => setFocusedTodoItem({ elementId: el.id, itemIdx: idx })}
                      onBlur={(e) => {
                        const newItems = [...items];
                        newItems[idx] = { ...newItems[idx], text: e.target.value };
                        handleUpdateContent(el.id, { ...c, items: newItems });
                      }}
                      data-testid={`input-todo-${el.id}-${idx}`}
                    />
                  ) : (
                    <span className={`text-xs ${item.checked ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
                  )}
                </label>
              ))}
            </div>
            {isSelected && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdateContent(el.id, { ...c, items: [...items, { text: "Add a task...", checked: false }] });
                }}
                data-testid={`button-add-todo-item-${el.id}`}
              >
                <Plus className="h-3 w-3 mr-1" /> Add task
              </Button>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderFormattingChip(el.id)}
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "column") {
      const childEls = elementsList.filter((e) => e.parentColumnId === el.id);
      const draggedType = draggingId !== null ? elements[draggingId]?.type : null;
      const isDroppableType = draggedType !== null && draggedType !== "column" && draggedType !== "section_header" && draggedType !== "room_zone";
      const isDropTarget = draggingId !== null && draggingId !== el.id && isDroppableType;
      const childrenBottom = childEls.reduce((acc, child) => {
        return Math.max(acc, (child.y - el.y) + (child.height || 60) + 12);
      }, 0);
      const draggedElForHeight = isDropTarget && draggingId !== null ? elements[draggingId] : null;
      const pendingDropBottom = draggedElForHeight ? (() => {
        const headerHeight = 50;
        const stackY = childEls.reduce((acc, sib) => {
          const sibBottom = (sib.y - el.y) + (sib.height || 60);
          return Math.max(acc, sibBottom);
        }, headerHeight) + 8;
        let previewH = draggedElForHeight.height || 60;
        if (draggedElForHeight.type === "image" && draggedElForHeight.width > 0 && draggedElForHeight.height && draggedElForHeight.height > 0) {
          const fitW = el.width - 24;
          previewH = Math.round(fitW * (draggedElForHeight.height / draggedElForHeight.width));
        }
        return stackY + previewH + 12;
      })() : 0;
      const hasCustomBg = !!c.backgroundColor;
      const draggedEl = isDropTarget && draggingId !== null ? elements[draggingId] : null;
      const presetColors = ["#ffffff", "#d4d4d4", "#fecdd3", "#e9d5ff", "#bfdbfe", "#bbf7d0", "#fef08a", "#fed7aa"];

      const dropPreviewY = (() => {
        if (!isDropTarget || !draggedEl) return 0;
        const headerHeight = 50;
        const siblings = childEls;
        return siblings.reduce((acc, sib) => {
          const sibBottom = (sib.y - el.y) + (sib.height || 60);
          return Math.max(acc, sibBottom);
        }, headerHeight) + 8;
      })();

      const dropPreviewHeight = (() => {
        if (!isDropTarget || !draggedEl) return 60;
        const fitWidth = el.width - 24;
        if (draggedEl.type === "image" && draggedEl.width > 0 && draggedEl.height && draggedEl.height > 0) {
          return Math.round(fitWidth * (draggedEl.height / draggedEl.width));
        }
        return draggedEl.height || 60;
      })();
      const childPreviewHeight = isDropTarget && draggedEl ? dropPreviewHeight + dropPreviewY + 12 : 0;
      const computedHeight = Math.max(el.height || 300, childrenBottom, pendingDropBottom, childPreviewHeight);

      return (
        <div
          key={el.id}
          className={`${cardBase} border border-dashed ${isDropTarget ? "border-primary/40 scale-[1.01]" : "border-border/60"} ${!hasCustomBg && !isDropTarget ? "bg-muted/40" : ""} ${isDropTarget && !hasCustomBg ? "bg-primary/10" : ""} transition-[transform,min-height,background-color,border-color] duration-200 ease-out`}
          style={{
            left: el.x, top: el.y, width: el.width, minHeight: computedHeight, zIndex: effectiveZ,
            transform: isDropTarget ? "translateY(-1px)" : undefined,
            ...(hasCustomBg ? { backgroundColor: c.backgroundColor } : {}),
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-column-${el.id}`}
        >
          <div className="p-3 cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
            {isSelected ? (
              <input
                className="w-full bg-transparent border-none text-sm font-semibold text-center outline-none"
                defaultValue={c.title}
                onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                data-testid={`input-column-title-${el.id}`}
              />
            ) : (
              <div className="text-sm font-semibold text-center">{c.title || "Column"}</div>
            )}
            <div className="text-[10px] text-muted-foreground text-center">{childEls.length} card{childEls.length !== 1 ? "s" : ""}</div>
          </div>
          {isDropTarget && draggedEl && (
            <div
              className="absolute border-2 border-dashed border-primary/50 rounded bg-primary/5 animate-in fade-in zoom-in-95 duration-200"
              style={{
                left: 12,
                top: dropPreviewY,
                width: el.width - 24,
                height: dropPreviewHeight,
                pointerEvents: "none",
                transition: "top 180ms ease-out, height 180ms ease-out",
              }}
              data-testid={`drop-preview-${el.id}`}
            />
          )}
          {isSelected && (
            <>
              <div className="absolute -top-8 right-0 flex gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="absolute -bottom-10 left-0 right-0 flex items-center justify-center gap-1 bg-card border border-border rounded-md shadow-md px-2 py-1 z-20" onMouseDown={(e) => e.stopPropagation()} data-testid={`color-picker-${el.id}`}>
                {presetColors.map((color) => (
                  <button
                    key={color}
                    className={`w-5 h-5 rounded-full border ${c.backgroundColor === color ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
                    style={{ backgroundColor: color }}
                    onClick={(e) => { e.stopPropagation(); handleUpdateContent(el.id, { ...c, backgroundColor: color }); }}
                    data-testid={`color-preset-${el.id}-${color.replace("#", "")}`}
                  />
                ))}
                <input
                  type="color"
                  className="w-5 h-5 rounded cursor-pointer border border-border"
                  value={c.backgroundColor || "#ffffff"}
                  onChange={(e) => handleUpdateContent(el.id, { ...c, backgroundColor: e.target.value })}
                  data-testid={`color-custom-${el.id}`}
                />
                {c.backgroundColor && (
                  <button
                    className="text-[9px] text-muted-foreground hover:text-foreground ml-1"
                    onClick={(e) => { e.stopPropagation(); const { backgroundColor: _backgroundColor, ...rest } = c; handleUpdateContent(el.id, rest); }}
                    data-testid={`color-reset-${el.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    if (el.type === "color_swatch") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-color-swatch-${el.id}`}
        >
          <div className="h-[140px] relative pointer-events-none select-none" style={{ backgroundColor: c.color || "#1e3a2f" }}>
            <span className="absolute bottom-2 left-3 text-xs text-white/80" style={{ fontFamily: "var(--font-mono)" }}>{(c.hex || c.color || "#1E3A2F").toUpperCase()}</span>
            {typeof c.lrv === "number" && (
              <span
                className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-black/35 text-white"
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid={`chip-swatch-lrv-${el.id}`}
              >
                LRV {c.lrv}
              </span>
            )}
          </div>
          <div className="p-3">
            {isSelected ? (
              <div className="space-y-2">
                <input
                  className="w-full bg-transparent border-none text-sm font-medium outline-none"
                  defaultValue={c.name}
                  placeholder="Color name"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, name: e.target.value })}
                  data-testid={`input-swatch-name-${el.id}`}
                />
                <div className="flex gap-2 items-center">
                  <input type="color" defaultValue={c.color} onChange={(e) => handleUpdateContent(el.id, { ...c, color: e.target.value, hex: e.target.value })} className="h-7 w-10 border rounded cursor-pointer" data-testid={`input-swatch-color-${el.id}`} />
                  <input
                    className="flex-1 bg-transparent border-none text-xs font-mono outline-none"
                    defaultValue={c.hex || c.color}
                    placeholder="#000000"
                    onBlur={(e) => handleUpdateContent(el.id, { ...c, hex: e.target.value, color: e.target.value })}
                    data-testid={`input-swatch-hex-${el.id}`}
                  />
                </div>
                <BmColorPicker
                  initialRoom={c.room}
                  initialSheen={c.sheen}
                  onSelect={(pc, extras) => handleUpdateContent(el.id, {
                    ...c,
                    color: pc.hex,
                    hex: pc.hex,
                    name: pc.name,
                    brand: pc.brand,
                    code: pc.code,
                    lrv: pc.lrv ?? c.lrv,
                    room: extras.room ?? c.room,
                    sheen: extras.sheen ?? c.sheen,
                  })}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    className="bg-transparent border border-border/50 rounded text-xs outline-none px-1.5 py-0.5"
                    defaultValue={c.room || ""}
                    placeholder="Room"
                    onBlur={(e) => handleUpdateContent(el.id, { ...c, room: e.target.value || undefined })}
                    data-testid={`input-swatch-room-${el.id}`}
                  />
                  <select
                    className="bg-transparent border border-border/50 rounded text-xs outline-none px-1.5 py-0.5"
                    defaultValue={c.sheen || ""}
                    onChange={(e) => handleUpdateContent(el.id, { ...c, sheen: e.target.value || undefined })}
                    data-testid={`select-swatch-sheen-${el.id}`}
                  >
                    <option value="">Sheen</option>
                    {SHEENS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium">{c.name || "Color"}</div>
                {c.code && <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>{c.code}</div>}
                {(c.room || c.sheen) && (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {c.room && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-mono)" }}
                        data-testid={`chip-swatch-room-${el.id}`}
                      >
                        {c.room}
                      </span>
                    )}
                    {c.sheen && (
                      <span
                        className="text-[10px] text-muted-foreground"
                        style={{ fontFamily: "var(--font-mono)" }}
                        data-testid={`chip-swatch-sheen-${el.id}`}
                      >
                        {c.sheen}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "material") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-material-${el.id}`}
        >
          {c.imageUrl && (
            <div className="h-[80px] bg-muted overflow-hidden">
              <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover pointer-events-none" />
            </div>
          )}
          <div className="p-3">
            {isSelected ? (
              <div className="space-y-1.5">
                <input
                  className="w-full bg-transparent border-none text-sm font-medium outline-none"
                  defaultValue={c.name}
                  placeholder="Material name"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, name: e.target.value })}
                  data-testid={`input-material-name-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-muted-foreground outline-none"
                  defaultValue={c.supplier}
                  placeholder="Supplier / Brand"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, supplier: e.target.value })}
                  data-testid={`input-material-supplier-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs font-mono text-muted-foreground outline-none"
                  defaultValue={c.code}
                  placeholder="Product code"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, code: e.target.value })}
                  data-testid={`input-material-code-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-primary outline-none"
                  defaultValue={c.imageUrl}
                  placeholder="Image URL"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, imageUrl: e.target.value })}
                  data-testid={`input-material-image-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs outline-none"
                  defaultValue={c.category || ""}
                  placeholder="Category (Stone, Wood, Tile…)"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, category: e.target.value || undefined })}
                  data-testid={`input-material-category-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-primary outline-none"
                  defaultValue={c.vendorUrl || ""}
                  placeholder="Vendor URL"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, vendorUrl: e.target.value || undefined })}
                  data-testid={`input-material-vendor-url-${el.id}`}
                />
                <textarea
                  className="w-full bg-transparent border border-border/50 rounded text-xs outline-none p-1.5 resize-none"
                  rows={2}
                  defaultValue={c.notes}
                  placeholder="Notes..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, notes: e.target.value })}
                  data-testid={`input-material-notes-${el.id}`}
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5">
                  <Shapes className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{c.name || "Material"}</span>
                </div>
                {c.category && (
                  <span
                    className="inline-block mt-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground"
                    style={{ fontFamily: "var(--font-mono)" }}
                    data-testid={`chip-material-category-${el.id}`}
                  >
                    {c.category}
                  </span>
                )}
                {c.supplier && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.supplier}</div>}
                {c.code && <div className="text-[10px] text-muted-foreground/70 truncate" style={{ fontFamily: "var(--font-mono)" }}>{c.code}</div>}
                {c.notes && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{c.notes}</div>}
              </div>
            )}
          </div>
          {c.vendorUrl && (
            <a
              href={c.vendorUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-1.5 right-1.5 p-1 rounded text-muted-foreground/70 hover:text-primary hover:bg-foreground/[0.06]"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-material-vendor-${el.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "hardware") {
      const status = (c.status as keyof typeof STATUS_CHIP) || "idea";
      const chip = STATUS_CHIP[status] || STATUS_CHIP.idea;
      const priceLabel = typeof c.price === "number" && Number.isFinite(c.price)
        ? `${(c.currency || "CAD")} ${c.price.toFixed(2)}`
        : null;
      const labelTop = [String(c.category || "hardware"), c.room].filter(Boolean).join(" · ");

      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-hardware-${el.id}`}
        >
          <div className="p-3 flex flex-col gap-2 pointer-events-none select-none">
            <div className="flex items-start gap-3">
              {c.imageUrl && (
                <div
                  className="w-[72px] h-[72px] rounded-sm bg-muted overflow-hidden shrink-0"
                  style={{ filter: "saturate(0.85) contrast(0.96)" }}
                >
                  <img src={c.imageUrl} alt={c.name || "Hardware"} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground truncate"
                  style={{ fontFamily: "var(--font-mono)" }}
                  data-testid={`text-hardware-meta-${el.id}`}
                >
                  {labelTop || "hardware"}
                </div>
                <div className="text-sm font-semibold leading-snug mt-0.5 line-clamp-2" data-testid={`text-hardware-name-${el.id}`}>
                  {c.name || "New hardware"}
                </div>
                {(c.brand || c.finish) && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {[c.brand, c.finish].filter(Boolean).join(" · ")}
                  </div>
                )}
                {c.sku && (
                  <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate" style={{ fontFamily: "var(--font-mono)" }}>
                    {c.sku}
                  </div>
                )}
                {c.dimensions && (
                  <div className="text-[10px] text-muted-foreground/80 truncate" style={{ fontFamily: "var(--font-mono)" }}>
                    {c.dimensions}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="text-xs" style={{ fontFamily: "var(--font-mono)" }} data-testid={`text-hardware-price-${el.id}`}>
                {priceLabel || <span className="text-muted-foreground/60">—</span>}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1 ${chip.className}`}
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid={`chip-hardware-status-${el.id}`}
              >
                {chip.withCheck && <Check className="h-2.5 w-2.5" strokeWidth={2.5} />}
                {chip.label}
              </span>
            </div>
            {c.notes && (
              <div className="text-[11px] text-muted-foreground line-clamp-2">{c.notes}</div>
            )}
          </div>
          {c.vendorUrl && (
            <a
              href={c.vendorUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-1.5 right-1.5 p-1 rounded text-muted-foreground/70 hover:text-primary hover:bg-foreground/[0.06]"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-hardware-vendor-${el.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "callout") {
      const calloutColor = c.color || "#fef9c3";
      return (
        <div
          key={el.id}
          className={`${cardBase} cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-callout-${el.id}`}
        >
          <div className="rounded-lg shadow-sm border border-black/5 relative" style={{ backgroundColor: calloutColor }}>
            <div className="absolute -bottom-2 left-5 w-4 h-4 rotate-45" style={{ backgroundColor: calloutColor }} />
            <div className="p-3 relative">
              {isSelected ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full bg-transparent border-none text-xs outline-none resize-none"
                    rows={2}
                    defaultValue={c.text}
                    placeholder="Add note..."
                    onBlur={(e) => handleUpdateContent(el.id, { ...c, text: e.target.value })}
                    autoFocus
                    data-testid={`input-callout-text-${el.id}`}
                  />
                  <div className="flex gap-1">
                    {["#fef9c3", "#fce7f3", "#dbeafe", "#dcfce7", "#f3e8ff", "#fff7ed"].map((clr) => (
                      <button
                        key={clr}
                        className={`h-4 w-4 rounded-full border ${calloutColor === clr ? "ring-2 ring-primary ring-offset-1" : "border-black/10"}`}
                        style={{ backgroundColor: clr }}
                        onClick={() => handleUpdateContent(el.id, { ...c, color: clr })}
                        data-testid={`button-callout-color-${clr.replace("#", "")}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs leading-relaxed" data-testid={`text-callout-${el.id}`}>
                  {c.text || "Add note..."}
                </p>
              )}
            </div>
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "product") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-product-${el.id}`}
        >
          <div className="p-3">
            {isSelected ? (
              <div className="space-y-1.5">
                <input
                  className="w-full bg-transparent border-none text-sm font-medium outline-none"
                  defaultValue={c.name}
                  placeholder="Product name"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, name: e.target.value })}
                  data-testid={`input-product-name-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-muted-foreground outline-none"
                  defaultValue={c.price}
                  placeholder="Price (e.g. $249)"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, price: e.target.value })}
                  data-testid={`input-product-price-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-muted-foreground outline-none"
                  defaultValue={c.supplier}
                  placeholder="Supplier"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, supplier: e.target.value })}
                  data-testid={`input-product-supplier-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-primary outline-none"
                  defaultValue={c.url}
                  placeholder="https://product-link..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, url: e.target.value })}
                  data-testid={`input-product-url-${el.id}`}
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.name || "Product"}</span>
                  {c.price && <span className="text-xs font-medium text-primary shrink-0">{c.price}</span>}
                </div>
                {c.supplier && <div className="text-[10px] text-muted-foreground mt-0.5">{c.supplier}</div>}
                {c.url && (
                  <div className="flex items-center gap-1 mt-1">
                    <ExternalLink className="h-2.5 w-2.5 text-primary shrink-0" />
                    <span className="text-[10px] text-primary truncate">{c.url}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {c.url && (
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => window.open(c.url, "_blank")} data-testid={`button-open-product-${el.id}`}>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "link") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-link-${el.id}`}
        >
          <div className="p-3.5">
            {isSelected ? (
              <div className="space-y-2">
                <input
                  className="w-full bg-transparent border-none text-sm font-medium outline-none"
                  defaultValue={c.title}
                  placeholder="Link title"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                  data-testid={`input-link-title-${el.id}`}
                />
                <input
                  className="w-full bg-transparent border-none text-xs text-primary outline-none"
                  defaultValue={c.url}
                  placeholder="https://..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, url: e.target.value })}
                  data-testid={`input-link-url-${el.id}`}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{c.title || c.url || "Link"}</span>
                </div>
                {c.url && <div className="text-[10px] text-primary truncate mt-1">{c.url}</div>}
              </>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {c.url && (
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => window.open(c.url, "_blank")} data-testid={`button-open-link-${el.id}`}>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "image") {
      // Edge-bleed when at default (or larger) size with no caption — the image fills the card to the bezel.
      const isDefaultIsh = (el.width >= 320) && !c.caption;
      const isEdgeBleed = !!c.url && isDefaultIsh && !isSelected;
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card overflow-hidden cursor-grab ${isSelected || activeEdit ? "border border-border" : ""}`}
          style={{ left: el.x, top: el.y, width: el.width, ...(el.height ? { height: el.height } : {}), zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-image-${el.id}`}
        >
          {c.url ? (
            <>
              <img src={c.url} alt={c.caption || ""} className="w-full object-cover pointer-events-none select-none" style={{ height: el.height ? Math.max(el.height - ((c.caption && !isEdgeBleed) ? 32 : 0), 40) : "auto", maxHeight: el.height ? undefined : 300 }} draggable={false} />
              {isEdgeBleed && (isSelected || isUnlocked) && c.caption && (
                <div className="absolute bottom-2 left-2 max-w-[80%] bg-card/85 backdrop-blur px-2 py-0.5 rounded text-[10px] text-foreground/80 truncate pointer-events-none">{c.caption}</div>
              )}
            </>
          ) : (
            <div
              className="bg-muted flex flex-col items-center justify-center gap-2"
              style={{ height: el.height ? Math.max(el.height, 60) : 120 }}
              data-testid={`image-upload-area-${el.id}`}
            >
              {isUploading && uploadTargetId === el.id ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/60">Double-tap to upload</span>
                </>
              )}
            </div>
          )}
          {!isEdgeBleed && (
            <div className="p-3">
              {isSelected ? (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 bg-transparent border-none text-xs outline-none"
                      defaultValue={c.url}
                      placeholder="Image URL..."
                      onBlur={(e) => handleUpdateContent(el.id, { ...c, url: e.target.value })}
                      data-testid={`input-image-url-${el.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs shrink-0"
                      onClick={(e) => { e.stopPropagation(); triggerImageUpload(el.id); }}
                      disabled={isUploading}
                      data-testid={`button-upload-image-${el.id}`}
                    >
                      {isUploading && uploadTargetId === el.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    </Button>
                  </div>
                  <input
                    className="w-full bg-transparent border-none text-xs text-muted-foreground outline-none"
                    defaultValue={c.caption}
                    placeholder="Caption (optional)"
                    onBlur={(e) => handleUpdateContent(el.id, { ...c, caption: e.target.value })}
                    data-testid={`input-image-caption-${el.id}`}
                  />
                </div>
              ) : (
                c.caption && <div className="text-xs text-muted-foreground">{c.caption}</div>
              )}
            </div>
          )}
          {isSelected && (
            <>
              <div className="absolute -top-8 right-0 flex gap-1">
                {renderOpenButton()}
                {effectiveRole !== "client" && c.url && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          palettePresetSourceRef.current = { x: el.x, y: el.y, w: el.width, h: el.height };
                          setPalettePresetUrl(c.url);
                          setShowPaletteDialog(true);
                        }}
                        data-testid={`button-extract-palette-${el.id}`}
                      >
                        <Droplet className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Extract palette</TooltipContent>
                  </Tooltip>
                )}
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); triggerImageUpload(el.id); }} disabled={isUploading} data-testid={`button-replace-image-${el.id}`}>
                  <Upload className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {resizeHandles(el.id)}
            </>
          )}
        </div>
      );
    }

    if (el.type === "board_link") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: effectiveZ }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-board-link-${el.id}`}
        >
          <div className="p-3 flex flex-col items-center justify-center h-full gap-1.5">
            <LayoutGrid className="h-6 w-6 text-primary/75" />
            {isSelected ? (
              <div className="w-full space-y-1">
                <input
                  className="w-full bg-transparent border-none text-sm font-medium text-center outline-none"
                  defaultValue={c.title}
                  placeholder="Board name"
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                  data-testid={`input-board-link-title-${el.id}`}
                />
                <button
                  type="button"
                  className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowLinkDialog(true)}
                  data-testid={`button-link-board-${el.id}`}
                >
                  Link this card in Board settings
                </button>
              </div>
            ) : (
              <span className="text-sm font-medium text-foreground">{c.title || "Board"}</span>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              {renderOpenButton()}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Legacy structure used by the mobile floating bottom toolbar.
  const sidebarToolGroups = [
    {
      label: "Content",
      tools: [
        { type: "note", icon: StickyNote, label: "Note" },
        { type: "plain_text", icon: FileText, label: "Plain Text" },
        { type: "link", icon: Link2, label: "Link" },
        { type: "todo", icon: CheckSquare, label: "To-do" },
        { type: "image", icon: ImagePlus, label: "Image" },
      ],
    },
    {
      label: "Layout",
      tools: [
        { type: "column", icon: Columns3, label: "Column" },
        { type: "section_header", icon: Type, label: "Header" },
        { type: "room_zone", icon: Square, label: "Zone" },
      ],
    },
    {
      label: "Design",
      tools: [
        { type: "color_swatch", icon: Palette, label: "Color" },
        { type: "material", icon: Shapes, label: "Material" },
        ...(effectiveRole === "client" ? [] : [{ type: "hardware", icon: Wrench, label: "Hardware" }]),
        { type: "callout", icon: Sparkles, label: "Callout" },
        { type: "product", icon: ExternalLink, label: "Product" },
      ],
    },
    {
      label: "Tools",
      tools: [
        { type: "draw", icon: Pencil, label: "Draw" },
        ...(effectiveRole === "client" ? [] : [{ type: "connect", icon: Spline, label: "Connect" }]),
        ...(effectiveRole === "client" ? [] : [{ type: "palette", icon: Droplet, label: "Extract palette" }]),
      ],
    },
  ];

  // Tactile Add palette — categories color-keyed against the spruce + warm-paper system.
  // `arms` items open a placement cursor or dialog; everything else inserts at viewport
  // center. `key` is a one-letter shortcut surfaced in the popover and bound globally
  // when no input is focused.
  type AddPaletteItem = {
    type: string;
    icon: typeof StickyNote;
    label: string;
    hint: string;
    key?: string;
  };
  type AddPaletteGroup = {
    label: string;
    tint: string; // tailwind bg color tone (warm paper palette)
    accent: string; // border / text accent
    items: AddPaletteItem[];
  };
  const addPaletteGroups: AddPaletteGroup[] = [
    {
      label: "Words",
      tint: "bg-[#f7f1e7]/70",
      accent: "text-[#2f4a3a]",
      items: [
        { type: "note", icon: StickyNote, label: "Note", hint: "Sticky thought with title", key: "N" },
        { type: "plain_text", icon: FileText, label: "Text", hint: "Plain text, no card", key: "T" },
        { type: "callout", icon: Sparkles, label: "Callout", hint: "Highlight with arrow" },
      ],
    },
    {
      label: "Visual",
      tint: "bg-[#eef0e8]/70",
      accent: "text-[#2f4a3a]",
      items: [
        { type: "image", icon: ImagePlus, label: "Image", hint: "Upload or paste URL", key: "I" },
        { type: "color_swatch", icon: Palette, label: "Color", hint: "Paint swatch + LRV", key: "C" },
        { type: "material", icon: Shapes, label: "Material", hint: "Photo + supplier code" },
        ...(effectiveRole === "client"
          ? []
          : [{ type: "palette", icon: Droplet, label: "Extract palette", hint: "Pull colors from a photo" }]),
      ],
    },
    {
      label: "Selections",
      tint: "bg-[#e8ece4]/70",
      accent: "text-[#2f4a3a]",
      items: [
        ...(effectiveRole === "client"
          ? []
          : [{ type: "hardware", icon: Wrench, label: "Hardware", hint: "Pull, knob, faucet — typed", key: "H" }]),
        { type: "product", icon: ExternalLink, label: "Product", hint: "Linked product card" },
      ],
    },
    {
      label: "Layout",
      tint: "bg-[#f1ece1]/70",
      accent: "text-[#2f4a3a]",
      items: [
        { type: "room_zone", icon: Square, label: "Room zone", hint: "Lane background" },
        { type: "section_header", icon: Type, label: "Section header", hint: "Heading band" },
        { type: "todo", icon: CheckSquare, label: "To-do", hint: "Task list" },
        { type: "column", icon: Columns3, label: "Column", hint: "Stacked container" },
        { type: "link", icon: Link2, label: "Board link", hint: "Jump to another board" },
      ],
    },
    {
      label: "Draw",
      tint: "bg-[#ece8de]/70",
      accent: "text-[#2f4a3a]",
      items: [
        { type: "draw", icon: Pencil, label: "Pencil mode", hint: "Toggle freehand drawing", key: "D" },
        ...(effectiveRole === "client"
          ? []
          : [{ type: "connect", icon: Spline, label: "Arrow connector", hint: "Tap source → tap target", key: "A" }]),
      ],
    },
  ];

  // Mode indicator label shown in the bottom-left of the canvas.
  const modeIndicatorLabel = connectMode
    ? (connectSourceId === null ? "Connect: tap source → tap target" : "Connect: tap target...")
    : lockLayout
      ? "Layout locked"
      : fingerDrawing
        ? "Fingers draw · 2-finger pan"
        : "Pencil draws · Fingers pan";

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="spatial-canvas-root">
      {/* Top toolbar — split into two clusters: board management (left) and canvas controls (right) */}
      <div className="flex items-center gap-1.5 mb-1 flex-wrap mobile-landscape:flex-nowrap mobile-landscape:overflow-x-auto mobile-landscape:mb-0 shrink-0 px-2 py-1.5 bg-card/80 backdrop-blur border-b border-border" data-testid="canvas-top-toolbar">
        {/* Left cluster — board management */}
        <div className="flex items-center gap-1.5">
        {!isLoadingBoards && boards.length > 0 && (
          <Select value={String(selectedBoardId || "")} onValueChange={(v) => setSelectedBoardId(Number(v))}>
            <SelectTrigger className="w-[200px] mobile-landscape:w-[140px] h-8 bg-transparent" data-testid="select-board-trigger">
              <SelectValue placeholder="Select board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b: PlanningBoardType) => (
                <SelectItem key={b.id} value={String(b.id)} data-testid={`select-board-${b.id}`}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" className="h-8 hover:bg-primary/10 hover:text-primary" onClick={() => { setNewBoardName(""); setShowNewBoardDialog(true); }} data-testid="button-new-board">
          <Plus className="h-3.5 w-3.5 mobile-landscape:mr-0 mr-1" /> <span className="mobile-landscape:hidden">New Board</span>
        </Button>
        {selectedBoardId && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" data-testid="button-board-menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setRenameName(selectedBoard?.name || ""); setShowRenameDialog(true); }} data-testid="menu-rename-board">
                  <Edit3 className="h-4 w-4 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setLinkCreateMode({ milestone: false, checklist: false, calendar: false }); setShowLinkDialog(true); }} data-testid="menu-link-board">
                  <Link2 className="h-4 w-4 mr-2" /> Link to...
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCalendarSheet(true)} data-testid="menu-view-calendar">
                  <CalendarDays className="h-4 w-4 mr-2" /> View Calendar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setNewSnapshotName(""); setShowSnapshotDialog(true); }} data-testid="menu-snapshots">
                  <Save className="h-4 w-4 mr-2" /> Versions
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteConfirm(true)} data-testid="menu-delete-board">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Board
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setBoardsToDelete(new Set()); setShowManageBoards(true); }} data-testid="menu-manage-boards">
                  <ListChecks className="h-4 w-4 mr-2" /> Manage Boards
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        </div>
        <Separator orientation="vertical" className="h-5 mx-1.5 hidden md:block" />
        {(selectedBoard?.linkedUserIds?.length ?? 0) > 0 && (
          <div className="hidden md:flex items-center gap-1" data-testid="badges-linked-people">
            <div className="flex -space-x-1.5">
              {selectedBoard!.linkedUserIds!.slice(0, 4).map((uid: string) => {
                const user = allUsers.find((u: any) => u.id === uid);
                return (
                  <Avatar key={uid} className="h-5 w-5 border border-background">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {(user?.firstName?.[0] || "").toUpperCase()}{(user?.lastName?.[0] || "").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
            </div>
            {selectedBoard!.linkedUserIds!.length > 4 && (
              <span className="text-xs text-muted-foreground">+{selectedBoard!.linkedUserIds!.length - 4}</span>
            )}
          </div>
        )}
        {(selectedBoard?.linkedProjectIds?.length ?? 0) > 0 && (
          <div className="hidden md:flex items-center gap-1 flex-wrap" data-testid="badges-linked-projects">
            {selectedBoard!.linkedProjectIds!.map((pid: number) => {
              const proj = allProjects.find((p: any) => p.id === pid);
              return proj ? (
                <Badge key={pid} variant="outline" className="text-[10px]" data-testid={`badge-project-${pid}`}>
                  {proj.name}
                </Badge>
              ) : null;
            })}
          </div>
        )}
        <div className="hidden md:flex items-center gap-1.5">
        {selectedBoard?.linkedCalendarEventId && (() => {
          const ev = calendarEvents.find((e: any) => e.id === selectedBoard.linkedCalendarEventId);
          return ev ? (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer gap-1"
              onClick={() => setLinkDetailSheet({ type: "calendar", id: ev.id })}
              data-testid="badge-linked-calendar"
            >
              <CalendarDays className="h-3 w-3" />
              {ev.title}
            </Badge>
          ) : null;
        })()}
        {selectedBoard?.linkedMilestoneId && (() => {
          const ms = milestones.find((m: any) => m.id === selectedBoard.linkedMilestoneId);
          return ms ? (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer gap-1"
              onClick={() => setLinkDetailSheet({ type: "milestone", id: ms.id })}
              data-testid="badge-linked-milestone"
            >
              <Milestone className="h-3 w-3" />
              {ms.title}
            </Badge>
          ) : null;
        })()}
        {selectedBoard?.linkedChecklistItemId && (() => {
          const cl = checklistItems.find((c: any) => c.id === selectedBoard.linkedChecklistItemId);
          return cl ? (
            <Badge
              variant="outline"
              className="text-[10px] cursor-pointer gap-1"
              onClick={() => setLinkDetailSheet({ type: "checklist", id: cl.id })}
              data-testid="badge-linked-checklist"
            >
              <ListChecks className="h-3 w-3" />
              {cl.title}
            </Badge>
          ) : null;
        })()}
        </div>
        <div className="flex-1" />
        {/* Right cluster — canvas controls */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={handleUndo} disabled={undoStack.length === 0} data-testid="button-undo">
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleLockLayout}
                aria-pressed={lockLayout}
                aria-label="Lock layout"
                data-testid="button-lock-layout"
                className={`h-8 w-8 ${lockLayout ? "bg-primary/15 text-primary" : "hover:bg-primary/10 hover:text-primary"}`}
              >
                {lockLayout ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {lockLayout ? "Layout locked — tap to unlock" : "Lock layout"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleFingerDrawing}
                aria-pressed={fingerDrawing}
                aria-label="Finger drawing"
                data-testid="button-finger-drawing"
                className={`h-8 w-8 ${fingerDrawing ? "bg-primary/15 text-primary" : "hover:bg-primary/10 hover:text-primary"}`}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {fingerDrawing ? "Finger drawing on (Pencil always draws)" : "Finger drawing off — fingers pan"}
            </TooltipContent>
          </Tooltip>
          <div className="hidden md:flex items-center gap-0.5">
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} data-testid="button-zoom-out">
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Zoom Out</TooltipContent>
          </Tooltip>
          <button className="text-[11px] font-mono text-muted-foreground min-w-[3rem] text-center cursor-pointer hover:text-foreground transition-colors" onClick={resetView} data-testid="button-reset-zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => setZoom((z) => Math.min(4, z + 0.1))} data-testid="button-zoom-in">
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Zoom In</TooltipContent>
          </Tooltip>
          {(actualRole === "admin" || actualRole === "crew") && (
            <>
              <Separator orientation="vertical" className="h-4 mx-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowPresentation(true)}
                      disabled={Object.keys(elements).length < 3}
                      data-testid="button-presentation"
                      aria-label="Present"
                      className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {Object.keys(elements).length < 3 ? "Add a few items first" : "Present"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowCritique(true)}
                    data-testid="button-design-critique"
                    aria-label="AI critique"
                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">AI critique</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={fitToScreen} data-testid="button-fit-screen">
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Fit to Screen</TooltipContent>
          </Tooltip>

          {collaborators.length > 0 && (
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l" data-testid="board-collaborators">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <div className="flex -space-x-2">
                {collaborators.map((c) => {
                  const avatarColor = getCollaboratorColor(c.userId);
                  return (
                    <Tooltip key={c.userId}>
                      <TooltipTrigger asChild>
                        <Avatar className="h-6 w-6 border-2" style={{ borderColor: avatarColor }} data-testid={`collaborator-avatar-${c.userId}`}>
                          <AvatarImage src={c.profileImageUrl || undefined} />
                          <AvatarFallback className="text-[9px]" style={{ backgroundColor: avatarColor, color: "white" }}>
                            {(c.firstName?.[0] || "").toUpperCase()}{(c.lastName?.[0] || "").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: avatarColor }} />
                        {c.firstName} {c.lastName} is editing
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <span className="text-xs text-muted-foreground">{collaborators.length} live</span>
            </div>
          )}
          </div>
        </div>
      </div>

      {boards.length === 0 && !isLoadingBoards && (
        <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-boards">
          <p className="text-muted-foreground">No planning boards yet.</p>
          <Button onClick={() => { setNewBoardName("Main Board"); setShowNewBoardDialog(true); }} data-testid="button-create-first-board">
            <Plus className="h-4 w-4 mr-2" /> Create Your First Board
          </Button>
        </div>
      )}

      {boards.length > 0 && selectedBoardId && (
        <div className="flex flex-1 gap-0 min-h-0">
          {/* Left rail — desktop only — strictly "what to add". A single Add button
              opens a tactile, color-keyed palette of categories. View/canvas controls
              live in the top toolbar's right cluster — not duplicated here. */}
          <div className="hidden md:flex w-[64px] shrink-0 border-r border-border/25 flex-col items-center py-3 gap-2 bg-card/40" data-testid="canvas-sidebar">
            <Popover open={addPaletteOpen} onOpenChange={setAddPaletteOpen}>
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`w-12 h-12 flex flex-col items-center justify-center rounded-xl shrink-0 transition-all border ${addPaletteOpen ? "bg-[#2f4a3a] text-white border-[#2f4a3a]" : "bg-card text-foreground/80 border-border hover:border-[#2f4a3a]/40 hover:text-[#2f4a3a]"}`}
                      aria-label="Add to board"
                      aria-expanded={addPaletteOpen}
                      data-testid="add-palette-trigger"
                    >
                      <Plus className="h-5 w-5" strokeWidth={1.75} />
                      <span
                        className="text-[8px] font-semibold uppercase tracking-[0.14em] mt-0.5"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Add
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={6} className="text-xs font-medium tracking-wide">
                    Add to board
                  </TooltipContent>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-[320px] p-0 border-border/60 shadow-xl bg-[#fbf8f1]"
                onMouseDown={(e) => e.stopPropagation()}
                data-testid="add-palette-popover"
              >
                <div
                  className="px-4 pt-3 pb-2 border-b border-border/40 flex items-center justify-between"
                  style={{ fontFamily: "Inter Tight, Inter, sans-serif" }}
                >
                  <span className="text-sm font-semibold text-[#2f4a3a]">Add to board</span>
                  <span
                    className="text-[10px] uppercase text-muted-foreground tracking-[0.2em]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Tap once
                  </span>
                </div>
                <div className="max-h-[70vh] overflow-y-auto py-1">
                  {addPaletteGroups.map((group) => (
                    <div key={group.label} className={`${group.tint} px-2 py-2 my-0.5`}>
                      <div
                        className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${group.accent}`}
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {group.label}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {group.items.map((it) => {
                          const isActive = it.type === "connect" && connectMode;
                          return (
                            <button
                              key={it.type}
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("tool-type", it.type);
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                              onClick={() => {
                                runTool(it.type);
                                if (it.type !== "connect") setAddPaletteOpen(false);
                              }}
                              className={`w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors min-h-[44px] ${isActive ? "bg-[#2f4a3a]/10 text-[#2f4a3a]" : "hover:bg-white/70 text-foreground"}`}
                              data-testid={`add-palette-${it.type}`}
                            >
                              <span className={`flex h-9 w-9 items-center justify-center rounded-md bg-white/80 border border-border/40 shrink-0 ${isActive ? "text-[#2f4a3a]" : "text-foreground/70"}`}>
                                <it.icon className="h-4 w-4" strokeWidth={1.75} />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium leading-tight" style={{ fontFamily: "Inter Tight, Inter, sans-serif" }}>{it.label}</span>
                                <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">{it.hint}</span>
                              </span>
                              {it.key && (
                                <kbd
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 border border-border/40 text-muted-foreground shrink-0"
                                  style={{ fontFamily: "var(--font-mono)" }}
                                >
                                  {it.key}
                                </kbd>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {editingId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="w-10 h-10 flex items-center justify-center rounded-md text-foreground/40 hover:text-destructive hover:bg-destructive/[0.06] transition-all duration-200 shrink-0"
                    onClick={() => { if (editingId) handleDeleteElement(editingId); }}
                    data-testid="sidebar-tool-delete"
                    aria-label="Delete selected"
                  >
                    <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={6} className="text-xs font-medium tracking-wide">Delete Selected</TooltipContent>
              </Tooltip>
            )}
          </div>

          {showImagePopup && (
            <div className="absolute left-[56px] top-1/3 z-50 bg-card border border-border rounded-md shadow-lg w-64" data-testid="image-popup-panel">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <span className="text-sm font-semibold">Add Image</span>
                <button className="p-0.5 rounded hover:bg-muted transition-colors" onClick={() => setShowImagePopup(false)} data-testid="image-popup-close"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-3 space-y-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Upload</div>
                  <div
                    className="border-2 border-dashed border-border rounded-md p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => { triggerImageUpload(); setShowImagePopup(false); }}
                    data-testid="image-popup-upload-area"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground">Click to upload from device</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">URL</div>
                  <div className="flex gap-1.5">
                    <input
                      ref={imageUrlInputRef}
                      className="flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Paste image URL..."
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddImageByUrl(imageUrlInput); }}
                      data-testid="image-popup-url-input"
                    />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddImageByUrl(imageUrlInput)} data-testid="image-popup-url-add">Add</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Canvas area */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden canvas-paper"
            style={{
              cursor: isPanning ? "grabbing" : spaceRef.current ? "grab" : "default",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            onTouchEnd={handleCanvasTouchEnd}
            onWheel={handleWheel}
            onClick={() => { if (!draggingId) { setEditingId(null); setContextMenu(null); setSelectedConnectorId(null); if (connectMode) setConnectSourceId(null); } }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              const toolType = e.dataTransfer.getData("tool-type");
              if (!toolType || !containerRef.current) return;
              const rect = containerRef.current.getBoundingClientRect();
              const canvasX = Math.round(((e.clientX - rect.left - pan.x) / zoom) / GRID_SIZE) * GRID_SIZE;
              const canvasY = Math.round(((e.clientY - rect.top - pan.y) / zoom) / GRID_SIZE) * GRID_SIZE;
              if (toolType === "image") {
                triggerImageUpload();
              } else if (toolType === "draw") {
                setDrawingMode(true); setDrawTool("pen"); setDrawingPaths([]); drawPathsRef.current = []; setDrawUndoStack([]); setEditingId(null);
              } else if (toolType === "hardware") {
                pendingHardwareDropRef.current = { x: canvasX, y: canvasY };
                setShowHardwareDialog(true);
              } else {
                createElement(toolType, canvasX, canvasY);
              }
            }}
            data-testid="spatial-canvas-viewport"
          >
            {/* Dot grid background */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.4 }}>
              <defs>
                <pattern id="dot-grid" x={pan.x % (GRID_SIZE * zoom)} y={pan.y % (GRID_SIZE * zoom)} width={GRID_SIZE * zoom} height={GRID_SIZE * zoom} patternUnits="userSpaceOnUse">
                  <circle cx={1} cy={1} r={0.8} fill="currentColor" className="text-border" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dot-grid)" />
            </svg>

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-50">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Transformed canvas layer */}
            <div
              className="absolute"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: "1px",
                height: "1px",
              }}
              data-testid="spatial-canvas-transform"
            >
              {elementsList.map(renderElement)}

              {/* Per-element annotations layer (Pencil ink-on-card, etc.) */}
              {elementsList.map((el) => {
                if (el.type === "connector") return null;
                const c = (el.content || {}) as any;
                const annotations: Stroke[] = Array.isArray(c.annotations) ? c.annotations : [];
                const liveOverlay = liveElementStroke && liveElementStroke.elementId === el.id ? liveElementStroke.stroke : null;
                if (annotations.length === 0 && !liveOverlay) return null;
                const w = el.width || 200;
                const h = el.height || 60;
                return (
                  <div
                    key={`annot-${el.id}`}
                    className="absolute pointer-events-none"
                    style={{ left: el.x, top: el.y, width: w, height: h, overflow: "hidden", zIndex: (el.zIndex || 0) + 0.5 }}
                    data-testid={`annot-layer-${el.id}`}
                  >
                    <svg width="100%" height="100%" style={{ overflow: "visible" }}>
                      {annotations.map((s) => {
                        const d = strokeToSvgPath(s);
                        if (!d) return null;
                        return <path key={s.id} d={d} fill={s.color} stroke="none" />;
                      })}
                      {liveOverlay && (() => {
                        const d = strokeToSvgPath(liveOverlay);
                        if (!d) return null;
                        return <path d={d} fill={liveOverlay.color} stroke="none" opacity={0.85} />;
                      })()}
                    </svg>
                  </div>
                );
              })}

              {/* Live freestanding stroke preview (board-level draw, before pointerup commits it) */}
              {liveFreestandingDraw && (() => {
                const d = strokeToSvgPath({
                  id: "live-fs",
                  points: liveFreestandingDraw.points,
                  color: liveFreestandingDraw.color,
                  width: liveFreestandingDraw.width,
                  createdAt: 0,
                });
                if (!d) return null;
                return (
                  <svg
                    key="live-freestanding"
                    className="absolute pointer-events-none"
                    style={{ left: 0, top: 0, width: 99999, height: 99999, overflow: "visible", zIndex: 99996 }}
                    data-testid="live-freestanding-stroke"
                  >
                    <path d={d} fill={liveFreestandingDraw.color} stroke="none" opacity={0.85} />
                  </svg>
                );
              })()}

              {/* Arrow connectors overlay — single SVG above element DOM, below toolbar. */}
              <CanvasConnectors
                elements={elements}
                selectedConnectorId={selectedConnectorId}
                zoom={zoom}
                defaultColorHex="hsl(var(--primary))"
                onConnectorClick={(id) => {
                  if (connectMode) return;
                  setSelectedConnectorId(id);
                  setEditingId(null);
                }}
                onEndpointPointerDown={(id, endpoint, e) => {
                  if (lockLayout) return;
                  setConnectorEdgeDrag({ connectorId: id, endpoint, clientX: e.clientX, clientY: e.clientY });
                }}
              />

              {/* Connect-mode source highlight + anchor dots */}
              {connectMode && connectSourceId !== null && (() => {
                const src = elements[connectSourceId];
                if (!src) return null;
                const w = src.width || 200;
                const h = src.height || 60;
                const dots = anchorDots(src);
                return (
                  <div
                    key="connect-source-overlay"
                    className="absolute pointer-events-none"
                    style={{ left: src.x - 4, top: src.y - 4, width: w + 8, height: h + 8, zIndex: 99996 }}
                    data-testid="connect-source-overlay"
                  >
                    <div className="absolute inset-0 rounded ring-2 ring-primary/70" />
                    {dots.map((d) => (
                      <div
                        key={`anchor-${d.side}`}
                        className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-primary border border-background shadow"
                        style={{ left: d.x - src.x + 4, top: d.y - src.y + 4 }}
                        data-testid={`connect-anchor-${d.side}`}
                      />
                    ))}
                  </div>
                );
              })()}

              {/* Mobile unlock badge — shown above the double-tapped element */}
              {mobileUnlockedId !== null && (() => {
                const unlockedEl = elements[mobileUnlockedId];
                if (!unlockedEl) return null;
                return (
                  <div
                    key="mobile-unlock-badge"
                    className="md:hidden absolute pointer-events-none flex items-center gap-1"
                    style={{ left: unlockedEl.x, top: unlockedEl.y - 28, zIndex: 9999 }}
                    data-testid="mobile-unlock-badge"
                  >
                    <div className="flex items-center gap-1 bg-amber-400 text-white rounded-full px-2 py-0.5 shadow-md" style={{ fontSize: 10, fontWeight: 500, whiteSpace: "nowrap" }}>
                      <Move style={{ width: 11, height: 11 }} />
                      <span>drag to move</span>
                    </div>
                  </div>
                );
              })()}

              {/* Active edit indicators — colored rings showing who is editing each element */}
              {Object.values(activeEdits).map((edit) => {
                const el = elements[edit.elementId];
                if (!el) return null;
                return (
                  <div
                    key={`edit-indicator-${edit.elementId}`}
                    className="absolute pointer-events-none rounded"
                    style={{
                      left: el.x - 3,
                      top: el.y - 3,
                      width: (el.width || 240) + 6,
                      height: (el.height || 140) + 6,
                      border: `2px solid ${edit.color}`,
                      zIndex: 99998,
                      transition: "opacity 0.3s ease",
                    }}
                    data-testid={`edit-indicator-${edit.elementId}`}
                  >
                    <div
                      className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded-t text-[10px] font-medium text-white whitespace-nowrap"
                      style={{ backgroundColor: edit.color }}
                    >
                      {edit.firstName} {edit.lastName?.[0]}.
                    </div>
                  </div>
                );
              })}

              {/* Live cursors from collaborators */}
              {Object.values(cursors).map((c) => (
                <div
                  key={`cursor-${c.userId}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: c.x,
                    top: c.y,
                    zIndex: 99999,
                    transition: "left 0.1s linear, top 0.1s linear",
                  }}
                  data-testid={`live-cursor-${c.userId}`}
                >
                  <svg width="16" height="20" viewBox="0 0 16 20" fill="none" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
                    <path d="M0 0L16 12L8 12L4 20L0 0Z" fill={c.color} />
                  </svg>
                  <div
                    className="absolute left-4 top-3 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.firstName}
                  </div>
                </div>
              ))}

              {/* Saved draw element paths rendered as SVG. Paths with pressurePoints render via perfect-freehand. */}
              {elementsList.filter((el) => el.type === "draw").map((el) => {
                const paths = ((el.content || {}) as any).paths || [];
                if (paths.length === 0) return null;
                return (
                  <svg key={`draw-svg-${el.id}`} className="absolute pointer-events-none" style={{ left: 0, top: 0, width: 99999, height: 99999, overflow: "visible" }}>
                    {paths.map((path: any, pi: number) => {
                      if (path.pressurePoints && Array.isArray(path.pressurePoints) && path.pressurePoints.length >= 2) {
                        const d = strokeToSvgPath({
                          id: `${el.id}-${pi}`,
                          points: path.pressurePoints,
                          color: path.color || "#1e3a2f",
                          width: (path.strokeWidth || 3) * 2.4,
                          createdAt: 0,
                        });
                        if (!d) return null;
                        return <path key={pi} d={d} fill={path.color || "#1e3a2f"} stroke="none" />;
                      }
                      if (!path.points || path.points.length < 2) return null;
                      const d = path.points.map((pt: any, i: number) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ");
                      return <path key={pi} d={d} stroke={path.color || "#1e3a2f"} strokeWidth={path.strokeWidth || 3} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
                    })}
                  </svg>
                );
              })}
            </div>

            {/* Connect-mode floating label near cursor */}
            {connectMode && connectSourceId !== null && connectCursor && (
              <div
                className="absolute pointer-events-none px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] uppercase tracking-[0.12em] shadow-md"
                style={{ left: connectCursor.x + 14, top: connectCursor.y + 14, zIndex: 99997, fontFamily: "var(--font-mono)" }}
                data-testid="connect-floating-label"
              >
                Tap target…
              </div>
            )}

            {/* Connector edit toolbar */}
            {selectedConnectorId !== null && (() => {
              const conn = elements[selectedConnectorId];
              if (!conn || conn.type !== "connector") return null;
              const c = (conn.content || {}) as ConnectorContent;
              const fromEl = elements[c.fromId];
              const toEl = elements[c.toId];
              if (!fromEl || !toEl) return null;
              // Place the toolbar near the midpoint, in screen coords.
              const midBoardX = ((fromEl.x + (fromEl.width || 200) / 2) + (toEl.x + (toEl.width || 200) / 2)) / 2;
              const midBoardY = ((fromEl.y + (fromEl.height || 60) / 2) + (toEl.y + (toEl.height || 60) / 2)) / 2;
              const screenX = midBoardX * zoom + pan.x;
              const screenY = midBoardY * zoom + pan.y;
              const styleOpt: ConnectorStyle = c.style || "arrow";
              const curveOpt: ConnectorCurve = c.curve || "curved";
              return (
                <div
                  key="connector-edit-toolbar"
                  className="absolute z-40 flex items-center gap-1 px-2 py-1 rounded-full bg-background/95 border border-border/60 shadow-lg backdrop-blur-sm"
                  style={{ left: Math.max(8, screenX - 140), top: Math.max(8, screenY - 56) }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  data-testid="connector-edit-toolbar"
                >
                  {/* Style toggle */}
                  {(["arrow", "line", "dotted"] as ConnectorStyle[]).map((s) => (
                    <button
                      key={s}
                      className={`h-7 w-7 flex items-center justify-center rounded ${styleOpt === s ? "bg-primary/15 text-primary" : "text-foreground/60 hover:text-foreground"} ${lockLayout ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !lockLayout && handleUpdateConnector(conn.id, { style: s })}
                      data-testid={`connector-style-${s}`}
                      title={s}
                    >
                      {s === "arrow" ? <MoveRight className="h-3.5 w-3.5" strokeWidth={1.75} /> : s === "line" ? <Slash className="h-3.5 w-3.5" strokeWidth={1.75} /> : <span className="text-[10px] font-mono tracking-tighter">···</span>}
                    </button>
                  ))}
                  <div className="h-4 w-px bg-border/50 mx-0.5" />
                  {/* Curve toggle */}
                  {(["curved", "orthogonal", "straight"] as ConnectorCurve[]).map((cv) => (
                    <button
                      key={cv}
                      className={`h-7 px-1.5 text-[9px] uppercase tracking-wider rounded ${curveOpt === cv ? "bg-primary/15 text-primary" : "text-foreground/60 hover:text-foreground"} ${lockLayout ? "opacity-50 cursor-not-allowed" : ""}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                      onClick={() => !lockLayout && handleUpdateConnector(conn.id, { curve: cv })}
                      data-testid={`connector-curve-${cv}`}
                    >
                      {cv === "curved" ? "curve" : cv === "orthogonal" ? "elbow" : "line"}
                    </button>
                  ))}
                  <div className="h-4 w-px bg-border/50 mx-0.5" />
                  {/* Color picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={`h-7 w-7 flex items-center justify-center rounded ${lockLayout ? "opacity-50 cursor-not-allowed" : "hover:bg-foreground/[0.06]"}`}
                        data-testid="connector-color-trigger"
                        disabled={lockLayout}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-border/60"
                          style={{ backgroundColor: !c.color || c.color === CONNECTOR_DEFAULT_COLOR ? "hsl(var(--primary))" : c.color }}
                        />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="center">
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { v: CONNECTOR_DEFAULT_COLOR, hex: "hsl(var(--primary))", label: "spruce" },
                          { v: "#9ca3af", hex: "#9ca3af", label: "muted" },
                          { v: "#1f2937", hex: "#1f2937", label: "ink" },
                          { v: "#b45309", hex: "#b45309", label: "amber" },
                          { v: "#be123c", hex: "#be123c", label: "rose" },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            className="h-7 w-7 rounded-full border border-border/60 hover:scale-110 transition-transform"
                            style={{ backgroundColor: opt.hex }}
                            onClick={() => handleUpdateConnector(conn.id, { color: opt.v === CONNECTOR_DEFAULT_COLOR ? null : opt.v })}
                            data-testid={`connector-color-${opt.label}`}
                            aria-label={opt.label}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <input
                          type="text"
                          placeholder="#hex"
                          className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                          style={{ fontFamily: "var(--font-mono)" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = (e.target as HTMLInputElement).value.trim();
                              if (/^#[0-9a-fA-F]{6}$/.test(v)) handleUpdateConnector(conn.id, { color: v });
                            }
                          }}
                          data-testid="connector-color-hex"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="h-4 w-px bg-border/50 mx-0.5" />
                  {/* Label */}
                  <input
                    type="text"
                    value={c.label || ""}
                    placeholder="label"
                    className="bg-transparent border border-border rounded px-2 py-1 text-[10px] uppercase tracking-[0.1em] w-20 outline-none focus:ring-1 focus:ring-primary"
                    style={{ fontFamily: "var(--font-mono)" }}
                    onChange={(e) => handleUpdateConnector(conn.id, { label: e.target.value })}
                    disabled={lockLayout}
                    data-testid="connector-label-input"
                  />
                  <div className="h-4 w-px bg-border/50 mx-0.5" />
                  {/* Delete */}
                  <button
                    className={`h-7 w-7 flex items-center justify-center rounded ${lockLayout ? "opacity-50 cursor-not-allowed" : "text-destructive/70 hover:bg-destructive/[0.08] hover:text-destructive"}`}
                    onClick={() => !lockLayout && handleDeleteConnector(conn.id)}
                    data-testid="connector-delete"
                    title="Delete connector"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              );
            })()}

            {/* Mode indicator (bottom-left) */}
            <div
              className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/85 border border-border/50 shadow-sm text-[11px] text-muted-foreground backdrop-blur-sm pointer-events-none"
              style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
              data-testid="canvas-mode-indicator"
            >
              {connectMode ? <Spline className="h-3 w-3" /> : lockLayout ? <Lock className="h-3 w-3" /> : fingerDrawing ? <Hand className="h-3 w-3" /> : <PenTool className="h-3 w-3" />}
              <span className="leading-none">{modeIndicatorLabel}</span>
            </div>

            {/* Mobile floating bottom toolbar */}
            {!drawingMode && (
              <div
                className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full bg-background/95 border border-border/60 shadow-lg backdrop-blur-sm overflow-x-auto max-w-[92vw]"
                onTouchStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                data-testid="mobile-canvas-toolbar"
              >
                {sidebarToolGroups.flatMap((g) => g.tools).map((t) => (
                  <button
                    key={t.type}
                    className={`h-11 w-11 flex items-center justify-center rounded-full shrink-0 ${t.type === "connect" && connectMode ? "bg-primary/15 text-primary" : "text-foreground/60 active:bg-foreground/10"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (t.type === "image") {
                        setShowImagePopup(true);
                      } else if (t.type === "draw") {
                        setDrawingMode(true);
                        setDrawTool("pen");
                        setDrawingPaths([]);
                        drawPathsRef.current = [];
                        setDrawUndoStack([]);
                        setEditingId(null);
                      } else if (t.type === "hardware") {
                        pendingHardwareDropRef.current = null;
                        setShowHardwareDialog(true);
                      } else if (t.type === "connect") {
                        if (connectMode) { exitConnectMode(); }
                        else { setConnectMode(true); setConnectSourceId(null); setSelectedConnectorId(null); setEditingId(null); }
                      } else {
                        createElement(t.type);
                      }
                    }}
                    data-testid={`mobile-tool-${t.type}`}
                  >
                    <t.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                  </button>
                ))}
                <div className="h-5 w-px bg-border/40 mx-1 shrink-0" />
                <button
                  className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.15, z - 0.15)); }}
                  data-testid="mobile-zoom-out"
                >
                  <ZoomOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
                <button
                  className="text-xs text-muted-foreground px-1.5 shrink-0 min-w-[2.5rem] text-center"
                  onClick={(e) => { e.stopPropagation(); fitToScreen(); }}
                  data-testid="mobile-zoom-level"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4, z + 0.15)); }}
                  data-testid="mobile-zoom-in"
                >
                  <ZoomIn className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
                <button
                  className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
                  onClick={(e) => { e.stopPropagation(); fitToScreen(); }}
                  data-testid="mobile-fit-screen"
                >
                  <Maximize className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
                <div className="h-5 w-px bg-border/40 mx-1 shrink-0" />
                <button
                  className={`h-11 w-11 flex items-center justify-center rounded-full shrink-0 ${lockLayout ? "bg-primary/15 text-primary" : "text-foreground/60 active:bg-foreground/10"}`}
                  onClick={(e) => { e.stopPropagation(); toggleLockLayout(); }}
                  aria-pressed={lockLayout}
                  data-testid="mobile-lock-layout"
                  aria-label="Lock layout"
                >
                  {lockLayout ? <Lock className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <LockOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                </button>
                <button
                  className={`h-11 w-11 flex items-center justify-center rounded-full shrink-0 ${fingerDrawing ? "bg-primary/15 text-primary" : "text-foreground/60 active:bg-foreground/10"}`}
                  onClick={(e) => { e.stopPropagation(); toggleFingerDrawing(); }}
                  aria-pressed={fingerDrawing}
                  data-testid="mobile-finger-drawing"
                  aria-label="Finger drawing"
                >
                  <Hand className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
                {editingId && (
                  <>
                    <div className="h-5 w-px bg-border/40 mx-1 shrink-0" />
                    <button
                      className="h-11 w-11 flex items-center justify-center rounded-full text-destructive/70 active:bg-destructive/10 shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDeleteElement(editingId); }}
                      data-testid="mobile-delete-element"
                    >
                      <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Full-board drawing overlay */}
            {drawingMode && (
              <>
                <canvas
                  ref={(ref) => {
                    drawCanvasRef.current = ref;
                    if (ref) {
                      const parent = ref.parentElement;
                      if (parent && (ref.width !== parent.clientWidth || ref.height !== parent.clientHeight)) {
                        ref.width = parent.clientWidth;
                        ref.height = parent.clientHeight;
                        drawPathsRef.current = drawingPaths;
                        redrawOverlayCanvas();
                      }
                    }
                  }}
                  className="absolute inset-0 z-[100]"
                  style={{ cursor: "crosshair", touchAction: "none" }}
                  data-testid="draw-overlay-canvas"
                />
                {autoTextConverting && (
                  <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[102] bg-card border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Recognizing text...</span>
                  </div>
                )}
                <div
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[101] flex flex-wrap items-center justify-center gap-1.5 bg-card border border-border rounded-lg shadow-lg px-2 py-1.5 max-w-[calc(100vw-2rem)] max-h-[40vh] overflow-y-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  data-testid="draw-overlay-toolbar"
                >
                  <button className={`p-1.5 rounded transition-colors ${drawTool === "pen" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setDrawTool("pen")} data-testid="draw-tool-pen"><PenTool className="h-4 w-4" /></button>
                  <button className={`p-1.5 rounded transition-colors ${drawTool === "eraser" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setDrawTool("eraser")} data-testid="draw-tool-eraser"><Eraser className="h-4 w-4" /></button>
                  <div className="w-px h-5 bg-border" />
                  <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border border-border" data-testid="draw-tool-color" />
                  <button className="px-1.5 py-1 rounded text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => setDrawStrokeWidth((w) => w >= 10 ? 1 : w + 1)} data-testid="draw-tool-stroke">{drawStrokeWidth}px</button>
                  <div className="w-px h-5 bg-border" />
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30" disabled={drawingPaths.length === 0} onClick={() => { if (drawingPaths.length > 0) { setDrawUndoStack((s) => [...s, drawingPaths[drawingPaths.length - 1]]); const next = drawingPaths.slice(0, -1); setDrawingPaths(next); drawPathsRef.current = next; redrawOverlayCanvas(); } }} data-testid="draw-tool-undo"><Undo2 className="h-4 w-4" /></button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30" disabled={drawUndoStack.length === 0} onClick={() => { if (drawUndoStack.length > 0) { const restored = drawUndoStack[drawUndoStack.length - 1]; setDrawUndoStack((s) => s.slice(0, -1)); const next = [...drawingPaths, restored]; setDrawingPaths(next); drawPathsRef.current = next; redrawOverlayCanvas(); } }} data-testid="draw-tool-redo"><Redo2 className="h-4 w-4" /></button>
                  <div className="w-px h-5 bg-border" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                        disabled={drawingPaths.length === 0 || aiProcessing}
                        onClick={() => {
                          setDrawUndoStack((s) => [...s, ...drawingPaths]);
                          const result = recognizeAllShapes(drawingPaths);
                          setDrawingPaths(result);
                          drawPathsRef.current = result;
                          redrawOverlayCanvas();
                          toast({ title: "Shape Recognition", description: "Shapes have been cleaned up" });
                        }}
                        data-testid="draw-tool-shapes"
                      >
                        <Shapes className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Snap to shapes</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                        disabled={drawingPaths.length === 0 || aiProcessing}
                        onClick={async () => {
                          const canvas = drawCanvasRef.current;
                          if (!canvas) return;
                          setAiProcessing(true);
                          try {
                            const tempCanvas = document.createElement("canvas");
                            tempCanvas.width = canvas.width;
                            tempCanvas.height = canvas.height;
                            const tempCtx = tempCanvas.getContext("2d");
                            if (!tempCtx) return;
                            tempCtx.fillStyle = "#ffffff";
                            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                            tempCtx.translate(pan.x, pan.y);
                            tempCtx.scale(zoom, zoom);
                            drawingPaths.forEach((path: any) => {
                              if (!path.points || path.points.length < 2) return;
                              tempCtx.beginPath();
                              tempCtx.strokeStyle = path.color || "#000000";
                              tempCtx.lineWidth = (path.strokeWidth || 3) / zoom;
                              tempCtx.lineCap = "round";
                              tempCtx.lineJoin = "round";
                              tempCtx.moveTo(path.points[0].x, path.points[0].y);
                              for (let i = 1; i < path.points.length; i++) {
                                tempCtx.lineTo(path.points[i].x, path.points[i].y);
                              }
                              tempCtx.stroke();
                            });
                            const imageData = tempCanvas.toDataURL("image/png");
                            const resp = await fetch("/api/ai/recognize-handwriting", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ imageData }),
                            });
                            if (!resp.ok) throw new Error("Server error");
                            const data = await resp.json();
                            if (data.text && data.text.trim() && selectedBoardId) {
                              const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
                              drawingPaths.forEach((path: any) => {
                                path.points?.forEach((pt: any) => {
                                  if (pt.x < bb.minX) bb.minX = pt.x;
                                  if (pt.y < bb.minY) bb.minY = pt.y;
                                  if (pt.x > bb.maxX) bb.maxX = pt.x;
                                  if (pt.y > bb.maxY) bb.maxY = pt.y;
                                });
                              });
                              const noteX = isFinite(bb.minX) ? bb.minX : 100;
                              const noteY = isFinite(bb.minY) ? bb.minY - 20 : 100;
                              const newZ = maxZ;
                              setMaxZ(newZ + 1);
                              const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
                              const created = await fetch(url, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({
                                  type: "note",
                                  x: noteX,
                                  y: noteY,
                                  width: Math.max(240, bb.maxX - bb.minX + 40),
                                  height: Math.max(100, bb.maxY - bb.minY + 40),
                                  zIndex: newZ,
                                  content: { title: "", text: data.text.trim() },
                                }),
                              }).then((r) => r.json());
                              addElement(created);
                              sendElementAdd(created);
                              setDrawingPaths([]);
                              drawPathsRef.current = [];
                              setDrawUndoStack([]);
                              redrawOverlayCanvas();
                              toast({ title: "Text Recognized", description: `Created note: "${data.text.trim().substring(0, 50)}"` });
                            } else {
                              toast({ title: "No Text Found", description: "Could not identify any handwriting in the drawing", variant: "destructive" });
                            }
                          } catch (err) {
                            console.error("Handwriting recognition failed:", err);
                            toast({ title: "Error", description: "Failed to recognize handwriting", variant: "destructive" });
                          } finally {
                            setAiProcessing(false);
                          }
                        }}
                        data-testid="draw-tool-handwriting"
                      >
                        {aiProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TypeIcon className="h-4 w-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p>Convert handwriting to text</p></TooltipContent>
                  </Tooltip>
                  <div className="w-px h-5 bg-border" />
                  <Button size="sm" variant="ghost" className="text-destructive text-xs px-1.5 sm:px-2" onClick={() => { setDrawingPaths([]); drawPathsRef.current = []; setDrawUndoStack([]); setDrawingMode(false); }} data-testid="draw-tool-discard"><X className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Discard</span></Button>
                  <Button size="sm" variant="default" className="text-xs px-1.5 sm:px-2" onClick={() => {
                    if (drawingPaths.length > 0 && selectedBoardId) {
                      const newZ = maxZ;
                      setMaxZ(newZ + 1);
                      const url = buildUrl(api.canvasElements.create.path, { boardId: selectedBoardId });
                      fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ type: "draw", x: 0, y: 0, width: 1, height: 1, zIndex: newZ, content: { paths: drawingPaths } }),
                      })
                        .then((r) => r.json())
                        .then((created: CanvasElement) => { addElement(created); sendElementAdd(created); toast({ title: "Drawing saved" }); })
                        .catch(() => toast({ title: "Error", description: "Failed to save drawing", variant: "destructive" }));
                    }
                    setDrawingPaths([]);
                    drawPathsRef.current = [];
                    setDrawUndoStack([]);
                    setDrawingMode(false);
                  }} data-testid="draw-tool-save"><Save className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Save</span></Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tip bar */}
      {boards.length > 0 && selectedBoardId && (
        <div className="flex items-center justify-between mt-1.5 px-1">
          <p className="text-[10px] text-muted-foreground">
            Pencil draws · fingers pan · two-finger pinch zooms · long-press to move (when unlocked).
          </p>
          <p className="text-[10px] text-muted-foreground">{elementsList.length} element{elementsList.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
        data-testid="hidden-file-input"
      />

      {/* Context menu overlay */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[9999] bg-card border border-border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            data-testid="context-menu"
          >
            <button
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
              onClick={() => { handleDuplicateElement(contextMenu.elementId); setContextMenu(null); }}
              data-testid="context-menu-duplicate"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            {elements[contextMenu.elementId]?.type === "image" && (
              <button
                className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
                onClick={() => { triggerImageUpload(contextMenu.elementId); setContextMenu(null); }}
                data-testid="context-menu-upload-image"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Image
              </button>
            )}
            <button
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
              onClick={() => { setEditingId(contextMenu.elementId); setContextMenu(null); }}
              data-testid="context-menu-edit"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </button>
            <div className="border-t border-border my-1" />
            <button
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 text-destructive hover:bg-muted transition-colors"
              onClick={() => { handleDeleteElement(contextMenu.elementId); setContextMenu(null); }}
              data-testid="context-menu-delete"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}

      {/* Dialogs */}
      <Dialog open={showNewBoardDialog} onOpenChange={(open) => { if (!open) { closeNewBoardDialog(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
            <DialogDescription>Create a new board or start from a template.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Board name" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }} data-testid="input-new-board-name" autoFocus />
          {isAdmin && templateCatalogue.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start from Template</Label>
              <div className="grid grid-cols-2 gap-3" data-testid="template-picker-grid">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(null)}
                  className={`group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${selectedTemplateId === null ? "border-primary ring-1 ring-primary" : "border-border/70"}`}
                  data-testid="template-blank"
                >
                  <div className="flex h-20 items-center justify-center bg-gradient-to-br from-muted/80 to-muted/40">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/90 shadow-sm">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">Blank Board</span>
                      {selectedTemplateId === null && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Selected</Badge>}
                    </div>
                    <span className="block text-[11px] leading-snug text-muted-foreground">Start with an empty canvas</span>
                  </div>
                </button>
                {templateCatalogue.map((tmpl) => {
                  const IconComp = tmpl.icon === "ChefHat" ? ChefHat : tmpl.icon === "Bath" ? Bath : tmpl.icon === "Home" ? Home : tmpl.icon === "Palette" ? Palette : LayoutPanelLeft;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      onDoubleClick={() => {
                        setSelectedTemplateId(tmpl.id);
                        void handleCreateBoard();
                      }}
                      className={`group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${selectedTemplateId === tmpl.id ? "border-primary ring-1 ring-primary" : "border-border/70"}`}
                      data-testid={`template-${tmpl.id}`}
                    >
                      <div className="relative h-20 overflow-hidden">
                        <img
                          src={templatePreviewById[tmpl.id] ?? ""}
                          alt={tmpl.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          data-testid={`img-template-${tmpl.id}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />
                        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 shadow-sm">
                          <IconComp className="h-4 w-4 text-foreground/70" />
                        </div>
                        {selectedTemplateId === tmpl.id && (
                          <Badge className="absolute right-2 top-2 h-5 px-1.5 text-[10px]">Selected</Badge>
                        )}
                      </div>
                      <div className="space-y-1.5 p-3">
                        <span className="block text-xs font-semibold uppercase tracking-wide">{tmpl.name}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{tmpl.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeNewBoardDialog}>Cancel</Button>
            <Button onClick={handleCreateBoard} data-testid="button-confirm-new-board">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Board</DialogTitle>
            <DialogDescription>Enter a new name for this board.</DialogDescription>
          </DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }} data-testid="input-rename-board" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancel</Button>
            <Button onClick={handleRename} data-testid="button-confirm-rename">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
            <DialogDescription>This permanently deletes the selected board.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete &quot;{selectedBoard?.name}&quot; and all its elements. This cannot be undone.</p>
          {selectedBoard?.linkedCalendarEventId && (() => {
            const hasOtherLinks = !!(selectedBoard.linkedMilestoneId || selectedBoard.linkedChecklistItemId);
            const ev = calendarEvents.find((e: any) => e.id === selectedBoard.linkedCalendarEventId);
            if (!ev) return null;
            return hasOtherLinks ? (
              <p className="text-sm text-muted-foreground" data-testid="text-delete-unlink-warning">
                The linked calendar event &quot;{ev.title}&quot; will be unlinked but kept on the calendar (other items are also linked to this board).
              </p>
            ) : (
              <p className="text-sm text-destructive font-medium" data-testid="text-delete-calendar-warning">
                The linked calendar event &quot;{ev.title}&quot; will also be removed from the calendar.
              </p>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBoard} data-testid="button-confirm-delete-board">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageBoards} onOpenChange={setShowManageBoards}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Boards</DialogTitle>
            <DialogDescription>Select boards to delete.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {boards.map((b: any) => {
              const checked = boardsToDelete.has(b.id);
              return (
                <label
                  key={b.id}
                  className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${checked ? "bg-destructive/10" : "hover:bg-muted"}`}
                  data-testid={`manage-board-row-${b.id}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(boardsToDelete);
                      v ? next.add(b.id) : next.delete(b.id);
                      setBoardsToDelete(next);
                    }}
                    data-testid={`manage-board-checkbox-${b.id}`}
                  />
                  <span className="text-sm flex-1 truncate">{b.name}</span>
                  {b.id === selectedBoardId && (
                    <span className="text-xs text-muted-foreground">Current</span>
                  )}
                </label>
              );
            })}
          </div>
          {boardsToDelete.size > 0 && (
            <p className="text-sm text-destructive">
              {boardsToDelete.size} board{boardsToDelete.size > 1 ? "s" : ""} will be permanently deleted with all elements.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageBoards(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={boardsToDelete.size === 0}
              onClick={handleDeleteSelectedBoards}
              data-testid="button-delete-selected-boards"
            >
              Delete {boardsToDelete.size > 0 ? `(${boardsToDelete.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Board Versions</DialogTitle>
            <DialogDescription>Save or restore a snapshot of your board layout.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                placeholder="Version name (e.g. Initial concept)"
                className="flex-1 text-sm"
                data-testid="input-snapshot-name"
              />
              <Button
                size="sm"
                disabled={!newSnapshotName.trim() || isCreatingSnapshot}
                onClick={async () => {
                  if (!selectedBoardId || !newSnapshotName.trim()) return;
                  try {
                    await createSnapshot({ boardId: selectedBoardId, name: newSnapshotName.trim() });
                    setNewSnapshotName("");
                    toast({ title: "Version saved" });
                  } catch {
                    toast({ title: "Error", description: "Failed to save version", variant: "destructive" });
                  }
                }}
                data-testid="button-save-snapshot"
              >
                {isCreatingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
            {snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No saved versions yet.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {snapshots.map((snap: any) => (
                  <div key={snap.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 group" data-testid={`snapshot-${snap.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{snap.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {snap.createdAt ? new Date(snap.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isRestoringSnapshot}
                        onClick={async () => {
                          if (!selectedBoardId) return;
                          try {
                            await restoreSnapshot({ id: snap.id, boardId: selectedBoardId });
                            setElements([]);
                            const url = buildUrl(api.canvasElements.list.path, { boardId: selectedBoardId });
                            const res = await fetch(url, { credentials: "include" });
                            const els = await res.json();
                            setElements(els);
                            toast({ title: "Version restored" });
                            setShowSnapshotDialog(false);
                          } catch {
                            toast({ title: "Error", description: "Failed to restore version", variant: "destructive" });
                          }
                        }}
                        data-testid={`button-restore-snapshot-${snap.id}`}
                      >
                        {isRestoringSnapshot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />}
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={async () => {
                          if (!selectedBoardId) return;
                          try {
                            await deleteSnapshot({ id: snap.id, boardId: selectedBoardId });
                            toast({ title: "Version deleted" });
                          } catch {
                            toast({ title: "Error", description: "Failed to delete version", variant: "destructive" });
                          }
                        }}
                        data-testid={`button-delete-snapshot-${snap.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-base">Link Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="rounded border p-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide">Client Access</p>
                  <p className="text-[11px] text-muted-foreground">Let the client view this board</p>
                </div>
                <Button
                  type="button"
                  variant={clientIsLinked ? "default" : "outline"}
                  size="sm"
                  onClick={toggleClientAccess}
                  disabled={!clientUser}
                  data-testid="button-toggle-client-access"
                >
                  {clientIsLinked ? "Shared with client" : "Share with client"}
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collaborators</label>
                <label className="flex items-center gap-1 cursor-pointer" data-testid="toggle-notify-on-link">
                  <Checkbox
                    checked={notifyOnLink}
                    onCheckedChange={(v) => setNotifyOnLink(!!v)}
                    className="h-3.5 w-3.5"
                  />
                  {notifyOnLink ? <Bell className="h-3 w-3 text-muted-foreground" /> : <BellOff className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-[11px] text-muted-foreground">SMS alert</span>
                </label>
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto rounded border p-1.5" data-testid="link-people-list">
                {allUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1 px-1">No team members found</p>
                )}
                {allUsers.map((u: any) => {
                  const isLinked = (selectedBoard?.linkedUserIds || []).includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                      data-testid={`link-person-${u.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => toggleLinkedUser(u.id)}
                        className="h-3.5 w-3.5"
                        data-testid={`checkbox-person-${u.id}`}
                      />
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={u.profileImageUrl || undefined} />
                        <AvatarFallback className="text-[9px]">
                          {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs truncate">
                        {u.firstName} {u.lastName}
                      </span>
                      <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1">{u.role}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Projects</label>
              <div className="space-y-0.5 max-h-32 overflow-y-auto rounded border p-1.5" data-testid="link-projects-list">
                {allProjects.filter((p: any) => p.id !== projectId).length === 0 && (
                  <p className="text-xs text-muted-foreground py-1 px-1">No other projects available</p>
                )}
                {allProjects.filter((p: any) => p.id !== projectId).map((p: any) => {
                  const isLinked = (selectedBoard?.linkedProjectIds || []).includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                      data-testid={`link-project-${p.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => toggleLinkedProject(p.id)}
                        className="h-3.5 w-3.5"
                        data-testid={`checkbox-project-${p.id}`}
                      />
                      <span className="text-xs truncate">{p.name}</span>
                      <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1">{p.status}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid grid-cols-1 gap-2">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs font-medium">Milestone</label>
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    onClick={() => setLinkCreateMode(m => ({ ...m, milestone: !m.milestone }))}
                    data-testid="button-toggle-create-milestone"
                  >
                    {linkCreateMode.milestone ? "Select" : <><Plus className="h-3 w-3" /> New</>}
                  </button>
                </div>
                {linkCreateMode.milestone ? (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Title..."
                      className="h-8 text-xs"
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateAndLinkMilestone()}
                      data-testid="input-new-milestone-title"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleCreateAndLinkMilestone}
                      disabled={!newMilestoneTitle.trim()}
                      data-testid="button-create-link-milestone"
                    >
                      Add
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={selectedBoard?.linkedMilestoneId?.toString() || "none"}
                    onValueChange={(v) => handleLinkUpdate("linkedMilestoneId", v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-link-milestone">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {milestones.map((m: any) => (
                        <SelectItem key={m.id} value={m.id.toString()}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs font-medium">Checklist Item</label>
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    onClick={() => setLinkCreateMode(m => ({ ...m, checklist: !m.checklist }))}
                    data-testid="button-toggle-create-checklist"
                  >
                    {linkCreateMode.checklist ? "Select" : <><Plus className="h-3 w-3" /> New</>}
                  </button>
                </div>
                {linkCreateMode.checklist ? (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Title..."
                      className="h-8 text-xs"
                      value={newChecklistTitle}
                      onChange={(e) => setNewChecklistTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateAndLinkChecklist()}
                      data-testid="input-new-checklist-title"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleCreateAndLinkChecklist}
                      disabled={!newChecklistTitle.trim()}
                      data-testid="button-create-link-checklist"
                    >
                      Add
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={selectedBoard?.linkedChecklistItemId?.toString() || "none"}
                    onValueChange={(v) => handleLinkUpdate("linkedChecklistItemId", v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-link-checklist">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {checklistItems.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs font-medium">Calendar Event</label>
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    onClick={() => setLinkCreateMode(m => ({ ...m, calendar: !m.calendar }))}
                    data-testid="button-toggle-create-calendar"
                  >
                    {linkCreateMode.calendar ? "Select" : <><Plus className="h-3 w-3" /> New</>}
                  </button>
                </div>
                {linkCreateMode.calendar ? (
                  <div className="space-y-1.5">
                    <Input
                      placeholder="Event title..."
                      className="h-8 text-xs"
                      value={newCalendarTitle}
                      onChange={(e) => setNewCalendarTitle(e.target.value)}
                      data-testid="input-new-calendar-title"
                    />
                    <div className="flex gap-1.5">
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={newCalendarDate}
                        onChange={(e) => setNewCalendarDate(e.target.value)}
                        data-testid="input-new-calendar-date"
                      />
                      <Button
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={handleCreateAndLinkCalendar}
                        disabled={!newCalendarTitle.trim() || !newCalendarDate}
                        data-testid="button-create-link-calendar"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={selectedBoard?.linkedCalendarEventId?.toString() || "none"}
                    onValueChange={(v) => handleLinkUpdate("linkedCalendarEventId", v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-link-event">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {calendarEvents.map((e: any) => (
                        <SelectItem key={e.id} value={e.id.toString()}>{e.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setShowLinkDialog(false)} data-testid="button-close-link-dialog">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HardwarePickerDialog
        open={showHardwareDialog}
        onOpenChange={(v) => { setShowHardwareDialog(v); if (!v) pendingHardwareDropRef.current = null; }}
        onSubmit={createHardware}
      />

      <PaletteExtractionDialog
        open={showPaletteDialog}
        onOpenChange={(v) => {
          setShowPaletteDialog(v);
          if (!v) {
            setPalettePresetUrl(null);
            palettePresetSourceRef.current = null;
          }
        }}
        boardImages={elementsList
          .filter((e) => e.type === "image" && (e.content as any)?.url)
          .map((e) => ({ id: e.id, url: (e.content as any).url, caption: (e.content as any).caption }))}
        roomSuggestions={Array.from(new Set(
          elementsList
            .filter((e) => e.type === "room_zone" && (e.content as any)?.title)
            .map((e) => String((e.content as any).title).trim())
            .filter(Boolean)
        ))}
        uploadImage={async (file) => uploadImage(file)}
        onAdd={createPaletteSwatches}
        presetImageUrl={palettePresetUrl}
      />

      <Sheet open={!!linkDetailSheet} onOpenChange={(open) => { if (!open) setLinkDetailSheet(null); }}>
        <SheetContent className="sm:max-w-md" data-testid="sheet-link-detail">
          <SheetHeader>
            <SheetTitle className="font-serif flex items-center gap-2">
              {linkDetailSheet?.type === "calendar" && <CalendarDays className="h-5 w-5 text-muted-foreground" />}
              {linkDetailSheet?.type === "milestone" && <Milestone className="h-5 w-5 text-muted-foreground" />}
              {linkDetailSheet?.type === "checklist" && <ListChecks className="h-5 w-5 text-muted-foreground" />}
              {linkDetailSheet?.type === "calendar" ? "Calendar Event" : linkDetailSheet?.type === "milestone" ? "Milestone" : "Checklist Item"}
            </SheetTitle>
            <SheetDescription>Linked item details</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {linkDetailSheet?.type === "calendar" && (() => {
              const ev = calendarEvents.find((e: any) => e.id === linkDetailSheet.id);
              if (!ev) return <p className="text-sm text-muted-foreground">Event not found</p>;
              return (
                <div className="space-y-4" data-testid="detail-calendar-event">
                  <div>
                    <label className="text-xs text-muted-foreground">Title</label>
                    <div className="flex items-center gap-2 mt-1">
                      {editingEventTitle !== null ? (
                        <form
                          className="flex items-center gap-2 flex-1"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const trimmed = editingEventTitle.trim();
                            if (trimmed && trimmed !== ev.title) {
                              try {
                                await updateCalendarEvent({ id: ev.id, title: trimmed });
                                toast({ title: "Updated", description: "Event title saved." });
                              } catch {
                                toast({ title: "Error", description: "Failed to update title.", variant: "destructive" });
                              }
                            }
                            setEditingEventTitle(null);
                          }}
                        >
                          <Input
                            autoFocus
                            value={editingEventTitle}
                            onChange={(e) => setEditingEventTitle(e.target.value)}
                            onBlur={async () => {
                              const trimmed = editingEventTitle.trim();
                              if (trimmed && trimmed !== ev.title) {
                                try {
                                  await updateCalendarEvent({ id: ev.id, title: trimmed });
                                  toast({ title: "Updated", description: "Event title saved." });
                                } catch {
                                  toast({ title: "Error", description: "Failed to update title.", variant: "destructive" });
                                }
                              }
                              setEditingEventTitle(null);
                            }}
                            className="text-sm"
                            data-testid="input-edit-event-title"
                          />
                        </form>
                      ) : (
                        <p
                          className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5"
                          onClick={() => setEditingEventTitle(ev.title)}
                          data-testid="detail-event-title"
                        >
                          {ev.title}
                          <Edit3 className="h-3 w-3 text-muted-foreground" />
                        </p>
                      )}
                    </div>
                  </div>
                  {ev.description && (
                    <div>
                      <label className="text-xs text-muted-foreground">Description</label>
                      <p className="text-sm" data-testid="detail-event-description">{ev.description}</p>
                    </div>
                  )}
                  <div className="flex gap-6">
                    <div>
                      <label className="text-xs text-muted-foreground">Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5 mt-1"
                            data-testid="detail-event-date"
                          >
                            {format(parseISO(ev.date), "MMM d, yyyy")}
                            <Edit3 className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={parseISO(ev.date)}
                            onSelect={async (day) => {
                              if (!day) return;
                              const newDate = format(day, "yyyy-MM-dd");
                              if (newDate !== ev.date) {
                                try {
                                  await updateCalendarEvent({ id: ev.id, date: newDate });
                                  toast({ title: "Updated", description: "Event date saved." });
                                } catch {
                                  toast({ title: "Error", description: "Failed to update date.", variant: "destructive" });
                                }
                              }
                            }}
                            data-testid="picker-event-date"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {ev.endDate && (
                      <div>
                        <label className="text-xs text-muted-foreground">End Date</label>
                        <p className="text-sm font-medium mt-1" data-testid="detail-event-end-date">{format(parseISO(ev.endDate), "MMM d, yyyy")}</p>
                      </div>
                    )}
                  </div>
                  {ev.type && (
                    <div>
                      <label className="text-xs text-muted-foreground">Type</label>
                      <Badge variant="outline" className="mt-1" data-testid="detail-event-type">{ev.type}</Badge>
                    </div>
                  )}
                </div>
              );
            })()}
            {linkDetailSheet?.type === "milestone" && (() => {
              const ms = milestones.find((m: any) => m.id === linkDetailSheet.id);
              if (!ms) return <p className="text-sm text-muted-foreground">Milestone not found</p>;
              return (
                <div className="space-y-4" data-testid="detail-milestone">
                  <div>
                    <label className="text-xs text-muted-foreground">Title</label>
                    <p className="text-sm font-medium" data-testid="detail-milestone-title">{ms.title}</p>
                  </div>
                  {ms.date && (
                    <div>
                      <label className="text-xs text-muted-foreground">Date</label>
                      <p className="text-sm font-medium" data-testid="detail-milestone-date">{ms.date}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Badge variant="outline" className="mt-1" data-testid="detail-milestone-status">{ms.completed ? "Completed" : "Pending"}</Badge>
                  </div>
                </div>
              );
            })()}
            {linkDetailSheet?.type === "checklist" && (() => {
              const cl = checklistItems.find((c: any) => c.id === linkDetailSheet.id);
              if (!cl) return <p className="text-sm text-muted-foreground">Checklist item not found</p>;
              return (
                <div className="space-y-4" data-testid="detail-checklist">
                  <div>
                    <label className="text-xs text-muted-foreground">Title</label>
                    <p className="text-sm font-medium" data-testid="detail-checklist-title">{cl.title}</p>
                  </div>
                  {cl.notes && (
                    <div>
                      <label className="text-xs text-muted-foreground">Notes</label>
                      <p className="text-sm" data-testid="detail-checklist-notes">{cl.notes}</p>
                    </div>
                  )}
                  <div className="flex gap-6">
                    <div>
                      <label className="text-xs text-muted-foreground">Status</label>
                      <Badge variant="outline" className="mt-1" data-testid="detail-checklist-status">{cl.completed ? "Completed" : "Pending"}</Badge>
                    </div>
                    {cl.priority && (
                      <div>
                        <label className="text-xs text-muted-foreground">Priority</label>
                        <Badge variant="outline" className="mt-1" data-testid="detail-checklist-priority">{cl.priority}</Badge>
                      </div>
                    )}
                  </div>
                  {cl.group && (
                    <div>
                      <label className="text-xs text-muted-foreground">Group</label>
                      <p className="text-sm" data-testid="detail-checklist-group">{cl.group}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showCalendarSheet} onOpenChange={setShowCalendarSheet}>
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px] overflow-y-auto" data-testid="calendar-sheet">
          <SheetHeader>
            <SheetTitle className="font-serif text-lg uppercase tracking-wide flex items-center gap-2" data-testid="text-calendar-sheet-title">
              <CalendarDays className="h-4 w-4" />
              Project Calendar
            </SheetTitle>
            <SheetDescription>
              {effectiveRole === "client"
                ? "View your project schedule and upcoming events."
                : "Manage events and view the project schedule."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <CalendarPanel
              projectId={projectId}
              compact
              readOnly={effectiveRole === "client"}
              effectiveRole={effectiveRole}
            />
          </div>
        </SheetContent>
      </Sheet>

      {showPresentation && selectedBoardId !== null && (
        <PresentationMode
          open={showPresentation}
          onClose={() => setShowPresentation(false)}
          projectId={projectId}
          boardId={selectedBoardId}
          boardName={selectedBoard?.name}
          elements={Object.values(elements)}
        />
      )}
      {showCritique && selectedBoardId !== null && (
        <DesignCritiquePanel
          open={showCritique}
          onClose={() => setShowCritique(false)}
          projectId={projectId}
          boardId={selectedBoardId}
          elements={Object.values(elements)}
          hasClient={Boolean(allProjects.find((p: any) => p.id === projectId)?.clientId)}
        />
      )}
    </div>
  );
}
