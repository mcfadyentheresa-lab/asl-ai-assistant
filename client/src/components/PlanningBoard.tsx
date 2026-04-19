import { useEffect, useRef, useState, useCallback } from "react";
import templateMoodboardPreview from "@assets/Screenshot_2026-04-08_at_12.41.42_PM_1775666504617.png";
import templateFurnitureRefinishingPreview from "@assets/Screenshot_2026-04-09_at_10.29.34_AM_1775744978712.png";
import templateCollageConceptPreview from "@assets/Screenshot_2026-04-09_at_10.54.53_AM_1775746499391.png";
import templateMaterialInspirationPreview from "@assets/Screenshot_2026-04-09_at_10.57.06_AM_1775746631248.png";
import templateKitchenPreview from "../assets/images/template-kitchen-faux.png";
import templateBathroomPreview from "../assets/images/template-bathroom-faux.png";
import templateCottagePreview from "../assets/images/template-cottage-faux.png";
import * as fabric from "fabric";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  MousePointer2,
  Pencil,
  Type,
  ImagePlus,
  Square,
  Circle,
  Trash2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Save,
  Loader2,
  Eraser,
  Copy,
  ChevronUp,
  ChevronDown,
  StickyNote,
  Plus,
  MoreVertical,
  Download,
  Edit3,
  Link2,
  LayoutPanelLeft,
  X,
  Palette,
  Maximize,
  Hand,
  Move,
  ChefHat,
  Bath,
  Home,
  FileText,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  usePlanningBoards,
  usePlanningBoard,
  useCreatePlanningBoard,
  useUpdatePlanningBoard,
  useDeletePlanningBoard,
  useSavePlanningBoardCanvas,
  useUploadImage,
  useMilestones,
  useChecklistItems,
  useCalendarEvents,
  useUsers,
  useProjects,
} from "@/hooks/use-projects";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PlanningBoard as PlanningBoardType } from "@shared/schema";

type ToolMode = "select" | "draw" | "eraser" | "text" | "rect" | "circle" | "sticky";

interface CardContentItem {
  type: "text" | "color" | "image";
  text?: string;
  color?: string;
  colorName?: string;
  imageUrl?: string;
  imageCaption?: string;
}

const DRAW_COLORS = [
  "#1a1a1a", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#1e3a2f",
];

const STICKY_COLORS = [
  "#fef9c3", "#fce7f3", "#dbeafe", "#dcfce7", "#f3e8ff",
  "#fed7aa", "#e2e8f0",
];

interface PlanningBoardProps {
  projectId: number;
}

export default function PlanningBoard({ projectId }: PlanningBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const isLoadingCanvas = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tool, setTool] = useState<ToolMode>("select");
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState("#1a1a1a");
  const [stickyColor, setStickyColor] = useState("#fef9c3");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [showImageUrlDialog, setShowImageUrlDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const spaceHeld = useRef(false);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 640);
  const [mobileEditMode, setMobileEditMode] = useState(false);
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [cardTitle, setCardTitle] = useState("New Column");
  const [cardItems, setCardItems] = useState<CardContentItem[]>([]);
  const [cardItemText, setCardItemText] = useState("");
  const [cardItemColor, setCardItemColor] = useState("#EE96E7");
  const [cardItemColorName, setCardItemColorName] = useState("");
  const [cardItemImageUrl, setCardItemImageUrl] = useState("");
  const [cardItemImageCaption, setCardItemImageCaption] = useState("");
  const [cardAddMode, setCardAddMode] = useState<"text" | "color" | "image" | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: templateCatalogue = [] } = useQuery<{ id: string; name: string; description: string; icon: string; image: string }[]>({
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

  const { data: boards = [], isLoading: isLoadingBoards } = usePlanningBoards(projectId);
  const { data: boardData, isLoading: isLoadingBoard } = usePlanningBoard(selectedBoardId);
  const { mutateAsync: createBoard } = useCreatePlanningBoard();
  const { mutateAsync: updateBoard } = useUpdatePlanningBoard();
  const { mutateAsync: deleteBoard } = useDeletePlanningBoard();
  const { mutateAsync: saveCanvas } = useSavePlanningBoardCanvas();
  const { mutateAsync: uploadImage, isPending: isUploadingImage } = useUploadImage();
  const { data: milestones = [] } = useMilestones(projectId);
  const { data: checklistItems = [] } = useChecklistItems(projectId);
  const { data: calendarEvents = [] } = useCalendarEvents(projectId);
  const { data: allUsers = [] } = useUsers();
  const { data: allProjects = [] } = useProjects();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoadingData = isLoadingBoards || isLoadingBoard;

  useEffect(() => {
    if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const saveStateRef = useRef<() => void>(() => {});
  const autoSaveRef = useRef<() => void>(() => {});

  saveStateRef.current = () => {
    const canvas = fabricRef.current;
    if (!canvas || isLoadingCanvas.current) return;
    const json = JSON.stringify(canvas.toJSON());
    undoStack.current.push(json);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
    setHasUnsaved(true);
  };

  autoSaveRef.current = () => {
    if (!selectedBoardId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const canvas = fabricRef.current;
      if (!canvas || !selectedBoardId) return;
      try {
        setIsSaving(true);
        const canvasData = canvas.toJSON();
        await saveCanvas({ id: selectedBoardId, canvasData });
        setHasUnsaved(false);
      } catch {
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const container = containerRef.current;
    let canvas: fabric.Canvas | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initCanvas = (width: number, height: number) => {
      if (fabricRef.current) return;
      if (width < 10 || height < 10) return;

      canvas = new fabric.Canvas(canvasRef.current!, {
        width,
        height: height - 2,
        backgroundColor: "#f8f6f3",
        selection: true,
        preserveObjectStacking: true,
      });

      fabricRef.current = canvas;
      setCanvasReady(true);

      canvas.on("object:modified", () => {
        saveStateRef.current();
        autoSaveRef.current();
      });
      canvas.on("object:added", () => {
        if (!isLoadingCanvas.current) {
          saveStateRef.current();
          autoSaveRef.current();
        }
      });
      canvas.on("object:removed", () => {
        if (!isLoadingCanvas.current) {
          saveStateRef.current();
          autoSaveRef.current();
        }
      });
      canvas.on("path:created", () => {
        saveStateRef.current();
        autoSaveRef.current();
      });
      canvas.on("text:editing:exited", () => {
        saveStateRef.current();
        autoSaveRef.current();
      });

      canvas.on("mouse:down", (opt) => {
        const evt = opt.e as MouseEvent;
        if ((evt.button === 1 || spaceHeld.current) && !canvas.isDrawingMode) {
          isPanningRef.current = true;
          setIsPanning(true);
          lastPanPoint.current = { x: evt.clientX, y: evt.clientY };
          canvas.selection = false;
          canvas.discardActiveObject();
          canvas.renderAll();
          evt.preventDefault();
          evt.stopPropagation();
        }
      });

      canvas.on("mouse:move", (opt) => {
        if (!isPanningRef.current || !lastPanPoint.current) return;
        const evt = opt.e as MouseEvent;
        const vpt = canvas.viewportTransform!;
        vpt[4] += evt.clientX - lastPanPoint.current.x;
        vpt[5] += evt.clientY - lastPanPoint.current.y;
        lastPanPoint.current = { x: evt.clientX, y: evt.clientY };
        canvas.setViewportTransform(vpt);
        canvas.renderAll();
      });

      canvas.on("mouse:up", () => {
        if (isPanningRef.current) {
          isPanningRef.current = false;
          setIsPanning(false);
          lastPanPoint.current = null;
          canvas.selection = true;
        }
      });

      const canvasEl = canvas.getSelectionElement();
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
          const delta = -e.deltaY / 300;
          let newZoom = canvas.getZoom() + delta;
          newZoom = Math.max(0.1, Math.min(5, newZoom));
          const point = canvas.getScenePoint(e);
          canvas.zoomToPoint(point, newZoom);
          setZoom(newZoom);
        } else {
          const vpt = canvas.viewportTransform!;
          vpt[4] -= e.deltaX;
          vpt[5] -= e.deltaY;
          canvas.setViewportTransform(vpt);
        }
        canvas.renderAll();
      };
      canvasEl.addEventListener("wheel", handleWheel, { passive: false });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          spaceHeld.current = true;
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          spaceHeld.current = false;
          if (isPanningRef.current) {
            isPanningRef.current = false;
            setIsPanning(false);
            lastPanPoint.current = null;
            canvas.selection = true;
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      // Touch handlers for pan/zoom (view-only mode: non-admins always; admins on mobile unless edit unlocked)
      let touchDist: number | null = null;
      const isViewOnly = () => {
        const c = canvas as any;
        return !c.__isAdmin || (window.innerWidth < 640 && !c.__mobileEditMode);
      };

      // Lock any newly added object immediately when view-only is active
      canvas.on("object:added", (e) => {
        if (isViewOnly()) {
          e.target?.set({ selectable: false, evented: false });
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      });

      const handleTouchStart = (e: TouchEvent) => {
        if (!isViewOnly()) return;
        e.preventDefault();
        if (e.touches.length === 2) {
          touchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        } else if (e.touches.length === 1) {
          lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!isViewOnly()) return;
        e.preventDefault();
        if (e.touches.length === 2 && touchDist !== null) {
          const newDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = (newDist - touchDist) / 200;
          let newZoom = canvas.getZoom() + delta;
          newZoom = Math.max(0.1, Math.min(5, newZoom));
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const rect = canvasEl.getBoundingClientRect();
          const point = new fabric.Point(midX - rect.left, midY - rect.top);
          canvas.zoomToPoint(point, newZoom);
          setZoom(newZoom);
          touchDist = newDist;
        } else if (e.touches.length === 1 && lastPanPoint.current) {
          const vpt = canvas.viewportTransform!;
          vpt[4] += e.touches[0].clientX - lastPanPoint.current.x;
          vpt[5] += e.touches[0].clientY - lastPanPoint.current.y;
          canvas.setViewportTransform(vpt);
          canvas.renderAll();
          lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      };

      const handleTouchEnd = () => {
        touchDist = null;
        lastPanPoint.current = null;
      };

      canvasEl.addEventListener("touchstart", handleTouchStart, { passive: false });
      canvasEl.addEventListener("touchmove", handleTouchMove, { passive: false });
      canvasEl.addEventListener("touchend", handleTouchEnd);

      (canvas as any).__wheelHandler = handleWheel;
      (canvas as any).__keyDownHandler = handleKeyDown;
      (canvas as any).__keyUpHandler = handleKeyUp;
      (canvas as any).__canvasEl = canvasEl;
      (canvas as any).__touchStartHandler = handleTouchStart;
      (canvas as any).__touchMoveHandler = handleTouchMove;
      (canvas as any).__touchEndHandler = handleTouchEnd;

      const initialState = JSON.stringify(canvas.toJSON());
      undoStack.current = [initialState];
    };

    const rect = container.getBoundingClientRect();
    initCanvas(rect.width, rect.height);

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (!fabricRef.current) {
          initCanvas(width, height);
        } else {
          fabricRef.current.setDimensions({ width, height: height - 2 });
          fabricRef.current.renderAll();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver?.disconnect();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (fabricRef.current) {
        const c = fabricRef.current as any;
        if (c.__canvasEl && c.__wheelHandler) {
          c.__canvasEl.removeEventListener("wheel", c.__wheelHandler);
        }
        if (c.__canvasEl && c.__touchStartHandler) {
          c.__canvasEl.removeEventListener("touchstart", c.__touchStartHandler);
          c.__canvasEl.removeEventListener("touchmove", c.__touchMoveHandler);
          c.__canvasEl.removeEventListener("touchend", c.__touchEndHandler);
        }
        if (c.__keyDownHandler) window.removeEventListener("keydown", c.__keyDownHandler);
        if (c.__keyUpHandler) window.removeEventListener("keyup", c.__keyUpHandler);
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      setCanvasReady(false);
    };
  }, []);

  const rehydrateGroups = (canvas: fabric.Canvas) => {
    canvas.getObjects().forEach((obj) => {
      if (obj instanceof fabric.Group) {
        obj.set({ subTargetCheck: true, interactive: true });
        (obj as fabric.Group).getObjects().forEach((child) => {
          if (child instanceof fabric.Rect) {
            child.set({ selectable: false, evented: false });
          }
          if (child instanceof fabric.Textbox) {
            child.set({ editable: true, selectable: true, evented: true });
          }
        });
      }
    });
  };

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !canvasReady) return;

    if (!selectedBoardId || isLoadingBoard) return;

    isLoadingCanvas.current = true;

    if (boardData?.canvasData) {
      canvas.loadFromJSON(boardData.canvasData).then(() => {
        rehydrateGroups(canvas);
        canvas.renderAll();
        const state = JSON.stringify(canvas.toJSON());
        undoStack.current = [state];
        redoStack.current = [];
        setCanUndo(false);
        setCanRedo(false);
        setHasUnsaved(false);
        isLoadingCanvas.current = false;
      }).catch(() => {
        isLoadingCanvas.current = false;
      });
    } else {
      canvas.clear();
      canvas.backgroundColor = "#f8f6f3";
      canvas.renderAll();
      const state = JSON.stringify(canvas.toJSON());
      undoStack.current = [state];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setHasUnsaved(false);
      isLoadingCanvas.current = false;
    }
  }, [boardData, isLoadingBoard, canvasReady, selectedBoardId]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !canvasReady) return;

    if (tool === "draw") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = brushColor;
      brush.width = brushSize;
      canvas.freeDrawingBrush = brush;
      canvas.selection = false;
    } else if (tool === "eraser") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = "#f8f6f3";
      brush.width = brushSize * 4;
      canvas.freeDrawingBrush = brush;
      canvas.selection = false;
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = tool === "select";
    }
  }, [tool, brushSize, brushColor, canvasReady]);

  // Lock/unlock canvas objects:
  // - Non-admins: always view-only (pan/zoom only, no editing)
  // - Admins on mobile: view-only unless they toggle edit mode on
  // - Admins on desktop: always editable
  const isViewOnly = !isAdmin || (isMobileView && !mobileEditMode);
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !canvasReady) return;
    // Keep flags in sync so touch handlers can read them without closure staleness
    (canvas as any).__mobileEditMode = mobileEditMode;
    (canvas as any).__isAdmin = isAdmin;
    if (isViewOnly) {
      canvas.selection = false;
      canvas.defaultCursor = "grab";
      canvas.isDrawingMode = false;
      canvas.getObjects().forEach((o) => o.set({ selectable: false, evented: false }));
    } else {
      canvas.defaultCursor = "default";
      canvas.getObjects().forEach((o) => o.set({ selectable: true, evented: true }));
      // Re-apply current tool state
      if (tool === "draw" || tool === "eraser") {
        canvas.isDrawingMode = true;
        canvas.selection = false;
      } else {
        canvas.isDrawingMode = false;
        canvas.selection = tool === "select";
      }
    }
    canvas.renderAll();
  }, [isMobileView, mobileEditMode, isAdmin, canvasReady, isViewOnly, tool]);

  const handleUndo = () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.current.length <= 1) return;
    const current = undoStack.current.pop()!;
    redoStack.current.push(current);
    const prev = undoStack.current[undoStack.current.length - 1];
    isLoadingCanvas.current = true;
    canvas.loadFromJSON(JSON.parse(prev)).then(() => {
      rehydrateGroups(canvas);
      canvas.renderAll();
      isLoadingCanvas.current = false;
      setCanUndo(undoStack.current.length > 1);
      setCanRedo(true);
      setHasUnsaved(true);
      autoSaveRef.current();
    });
  };

  const handleRedo = () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    isLoadingCanvas.current = true;
    canvas.loadFromJSON(JSON.parse(next)).then(() => {
      rehydrateGroups(canvas);
      canvas.renderAll();
      isLoadingCanvas.current = false;
      setCanUndo(true);
      setCanRedo(redoStack.current.length > 0);
      setHasUnsaved(true);
      autoSaveRef.current();
    });
  };

  const handleDelete = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length > 0) {
      active.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  };

  const handleDuplicate = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    active.clone().then((cloned: fabric.FabricObject) => {
      cloned.set({ left: (active.left || 0) + 20, top: (active.top || 0) + 20 });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
    });
  };

  const bringForward = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      canvas.bringObjectForward(active);
      canvas.renderAll();
      saveStateRef.current();
      autoSaveRef.current();
    }
  };

  const sendBackward = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      canvas.sendObjectBackwards(active);
      canvas.renderAll();
      saveStateRef.current();
      autoSaveRef.current();
    }
  };

  const handleZoom = (delta: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let newZoom = zoom + delta;
    newZoom = Math.max(0.1, Math.min(5, newZoom));
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    canvas.zoomToPoint(center, newZoom);
    setZoom(newZoom);
    canvas.renderAll();
  };

  const fitToScreen = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length === 0) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      setZoom(1);
      canvas.renderAll();
      return;
    }

    const bound = {
      left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity,
    };
    objects.forEach((obj) => {
      const br = obj.getBoundingRect();
      bound.left = Math.min(bound.left, br.left);
      bound.top = Math.min(bound.top, br.top);
      bound.right = Math.max(bound.right, br.left + br.width);
      bound.bottom = Math.max(bound.bottom, br.top + br.height);
    });

    const contentW = bound.right - bound.left;
    const contentH = bound.bottom - bound.top;
    if (contentW <= 0 || contentH <= 0) return;

    const PAD = 60;
    const canvasW = canvas.getWidth();
    const canvasH = canvas.getHeight();
    const scaleX = (canvasW - PAD * 2) / contentW;
    const scaleY = (canvasH - PAD * 2) / contentH;
    let newZoom = Math.min(scaleX, scaleY, 2);
    newZoom = Math.max(0.1, newZoom);

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.renderAll();

    const updatedBound = {
      left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity,
    };
    objects.forEach((obj) => {
      const br = obj.getBoundingRect();
      updatedBound.left = Math.min(updatedBound.left, br.left);
      updatedBound.top = Math.min(updatedBound.top, br.top);
      updatedBound.right = Math.max(updatedBound.right, br.left + br.width);
      updatedBound.bottom = Math.max(updatedBound.bottom, br.top + br.height);
    });

    const cx = (updatedBound.left + updatedBound.right) / 2;
    const cy = (updatedBound.top + updatedBound.bottom) / 2;

    const center = new fabric.Point(cx, cy);
    canvas.zoomToPoint(center, newZoom);

    const vpt = canvas.viewportTransform!;
    vpt[4] += canvasW / 2 - cx * newZoom;
    vpt[5] += canvasH / 2 - cy * newZoom;
    canvas.setViewportTransform(vpt);

    setZoom(newZoom);
    canvas.renderAll();
  };

  const resetView = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoom(1);
    canvas.renderAll();
  };

  const getViewportCenter = () => {
    const canvas = fabricRef.current;
    if (!canvas) return { x: 200, y: 200 };
    const vpt = canvas.viewportTransform!;
    const z = canvas.getZoom();
    return {
      x: (canvas.getWidth() / 2 - vpt[4]) / z,
      y: (canvas.getHeight() / 2 - vpt[5]) / z,
    };
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const c = getViewportCenter();
    const text = new fabric.IText("Type here", {
      left: c.x - 50,
      top: c.y - 15,
      fontFamily: "Inter, sans-serif",
      fontSize: 20,
      fill: "#1a1a1a",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    setTool("select");
  };

  const addRect = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const c = getViewportCenter();
    const rect = new fabric.Rect({
      left: c.x - 50,
      top: c.y - 50,
      width: 100,
      height: 100,
      fill: "transparent",
      stroke: brushColor,
      strokeWidth: 2,
      rx: 4,
      ry: 4,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    setTool("select");
  };

  const addCircle = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const c = getViewportCenter();
    const circle = new fabric.Circle({
      left: c.x - 40,
      top: c.y - 40,
      radius: 40,
      fill: "transparent",
      stroke: brushColor,
      strokeWidth: 2,
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    setTool("select");
  };

  const addSticky = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const c = getViewportCenter();
    const textbox = new fabric.Textbox("Type your note here...", {
      left: c.x - 90,
      top: c.y - 70,
      width: 180,
      fontFamily: "Inter, sans-serif",
      fontSize: 14,
      fill: "#1a1a1a",
      backgroundColor: stickyColor,
      padding: 14,
      editable: true,
      splitByGrapheme: false,
      shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.12)", blur: 8, offsetX: 2, offsetY: 2 }),
    });
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    setTool("select");
  };

  const buildCardGroup = (
    canvas: fabric.Canvas,
    title: string,
    items: CardContentItem[],
    left?: number,
    top?: number,
  ): Promise<fabric.Group> => {
    return new Promise(async (resolve) => {
      const CARD_WIDTH = 260;
      const CARD_PAD = 16;
      const INNER_W = CARD_WIDTH - CARD_PAD * 2;
      const ITEM_GAP = 12;

      const titleText = new fabric.Textbox(title, {
        fontFamily: "'Inter Tight', Inter, sans-serif",
        fontSize: 18,
        fontWeight: "bold",
        fill: "#1a1a1a",
        width: INNER_W,
        left: CARD_PAD,
        top: CARD_PAD,
        editable: true,
      });

      const countText = new fabric.Text(`${items.length} card${items.length !== 1 ? "s" : ""}`, {
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fill: "#9ca3af",
        left: CARD_PAD,
        top: CARD_PAD + titleText.calcTextHeight() + 4,
      });

      let yPos = CARD_PAD + titleText.calcTextHeight() + 4 + countText.calcTextHeight() + ITEM_GAP;
      const contentObjects: fabric.FabricObject[] = [];

      for (const item of items) {
        if (item.type === "text") {
          const itemBg = new fabric.Rect({
            left: CARD_PAD,
            top: yPos,
            width: INNER_W,
            height: 0,
            fill: "#ffffff",
            rx: 6,
            ry: 6,
            stroke: "#e5e7eb",
            strokeWidth: 1,
          });
          const itemText = new fabric.Textbox(item.text || "Note", {
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fill: "#374151",
            width: INNER_W - 20,
            left: CARD_PAD + 10,
            top: yPos + 12,
            editable: true,
          });
          const textH = itemText.calcTextHeight();
          itemBg.set({ height: textH + 24 });
          contentObjects.push(itemBg, itemText);
          yPos += textH + 24 + ITEM_GAP;
        } else if (item.type === "color") {
          const swatchBg = new fabric.Rect({
            left: CARD_PAD,
            top: yPos,
            width: INNER_W,
            height: 0,
            fill: "#ffffff",
            rx: 6,
            ry: 6,
            stroke: "#e5e7eb",
            strokeWidth: 1,
          });
          const swatch = new fabric.Rect({
            left: CARD_PAD + 10,
            top: yPos + 10,
            width: INNER_W - 20,
            height: 120,
            fill: item.color || "#EE96E7",
            rx: 4,
            ry: 4,
          });
          const hexLabel = new fabric.Text(item.color?.toUpperCase() || "#EE96E7", {
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            fill: "#ffffff",
            left: CARD_PAD + 18,
            top: yPos + 18,
          });
          const nameLabel = new fabric.Textbox(item.colorName || "Color", {
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fill: "#374151",
            width: INNER_W - 20,
            left: CARD_PAD + 10,
            top: yPos + 10 + 120 + 8,
            editable: true,
          });
          const nameH = nameLabel.calcTextHeight();
          swatchBg.set({ height: 120 + nameH + 28 });
          contentObjects.push(swatchBg, swatch, hexLabel, nameLabel);
          yPos += 120 + nameH + 28 + ITEM_GAP;
        } else if (item.type === "image" && item.imageUrl) {
          const imgCardBg = new fabric.Rect({
            left: CARD_PAD,
            top: yPos,
            width: INNER_W,
            height: 180,
            fill: "#ffffff",
            rx: 6,
            ry: 6,
            stroke: "#e5e7eb",
            strokeWidth: 1,
          });
          contentObjects.push(imgCardBg);

          try {
            const imgEl = await new Promise<HTMLImageElement>((res, rej) => {
              const el = new Image();
              el.crossOrigin = "anonymous";
              el.onload = () => res(el);
              el.onerror = () => rej(new Error("Failed to load image"));
              el.src = item.imageUrl!;
            });
            const maxImgW = INNER_W - 20;
            const maxImgH = 120;
            const scale = Math.min(maxImgW / imgEl.width, maxImgH / imgEl.height, 1);
            const fabricImg = new fabric.FabricImage(imgEl, {
              left: CARD_PAD + 10,
              top: yPos + 10,
              scaleX: scale,
              scaleY: scale,
            });
            const captionText = new fabric.Textbox(item.imageCaption || "", {
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fill: "#6b7280",
              width: INNER_W - 20,
              left: CARD_PAD + 10,
              top: yPos + 10 + imgEl.height * scale + 8,
              editable: true,
            });
            const captionH = item.imageCaption ? captionText.calcTextHeight() : 0;
            imgCardBg.set({ height: 10 + imgEl.height * scale + 8 + captionH + 10 });
            contentObjects.push(fabricImg);
            if (item.imageCaption) contentObjects.push(captionText);
            yPos += 10 + imgEl.height * scale + 8 + captionH + 10 + ITEM_GAP;
          } catch {
            const errText = new fabric.Text("(Image failed to load)", {
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fill: "#9ca3af",
              left: CARD_PAD + 10,
              top: yPos + 10,
            });
            imgCardBg.set({ height: 40 });
            contentObjects.push(errText);
            yPos += 40 + ITEM_GAP;
          }
        }
      }

      const totalHeight = yPos + CARD_PAD - ITEM_GAP;
      contentObjects.forEach((obj) => {
        if (obj instanceof fabric.Rect) {
          obj.set({ selectable: false, evented: false });
        }
      });

      const bg = new fabric.Rect({
        left: 0,
        top: 0,
        width: CARD_WIDTH,
        height: Math.max(totalHeight, 80),
        fill: "#f3f4f6",
        rx: 8,
        ry: 8,
        selectable: false,
        evented: false,
        shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.1)", blur: 12, offsetX: 2, offsetY: 4 }),
      });

      const titleBlockHeight = CARD_PAD + titleText.calcTextHeight() + 4 + countText.calcTextHeight() + 20;
      const allObjects = [bg, titleText, countText, ...contentObjects];

      const vpt = canvas.viewportTransform!;
      const z = canvas.getZoom();
      const vcx = (canvas.getWidth() / 2 - vpt[4]) / z;
      const vcy = (canvas.getHeight() / 2 - vpt[5]) / z;

      const group = new fabric.Group(allObjects, {
        left: left ?? vcx - CARD_WIDTH / 2,
        top: top ?? Math.max(20, vcy - totalHeight / 2 + 24),
        subTargetCheck: true,
        interactive: true,
      });

      resolve(group);
    });
  };

  const openCardDialog = () => {
    setCardTitle("New Column");
    setCardItems([]);
    setCardAddMode(null);
    setCardItemText("");
    setCardItemColor("#EE96E7");
    setCardItemColorName("");
    setCardItemImageUrl("");
    setCardItemImageCaption("");
    setShowCardDialog(true);
  };

  const addCardItem = () => {
    if (cardAddMode === "text" && cardItemText.trim()) {
      setCardItems([...cardItems, { type: "text", text: cardItemText.trim() }]);
      setCardItemText("");
    } else if (cardAddMode === "color") {
      setCardItems([...cardItems, { type: "color", color: cardItemColor, colorName: cardItemColorName || "Unnamed Color" }]);
      setCardItemColor("#EE96E7");
      setCardItemColorName("");
    } else if (cardAddMode === "image" && cardItemImageUrl.trim()) {
      setCardItems([...cardItems, { type: "image", imageUrl: cardItemImageUrl.trim(), imageCaption: cardItemImageCaption.trim() }]);
      setCardItemImageUrl("");
      setCardItemImageCaption("");
    }
    setCardAddMode(null);
  };

  const removeCardItem = (idx: number) => {
    setCardItems(cardItems.filter((_, i) => i !== idx));
  };

  const handleCreateCard = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const group = await buildCardGroup(canvas, cardTitle || "New Column", cardItems);
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      setShowCardDialog(false);
      setTool("select");
    } catch {
      toast({ title: "Error", description: "Failed to create card.", variant: "destructive" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const canvas = fabricRef.current;
    const file = e.target.files?.[0];
    if (!canvas || !file) return;

    try {
      const { url } = await uploadImage(file);
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        const fabricImg = new fabric.FabricImage(imgEl, {
          left: canvas.getWidth() / 2 - Math.min(imgEl.width, 300) / 2,
          top: canvas.getHeight() / 2 - Math.min(imgEl.height, 300) / 2,
        });
        const maxDim = 300;
        if (imgEl.width > maxDim || imgEl.height > maxDim) {
          const scale = maxDim / Math.max(imgEl.width, imgEl.height);
          fabricImg.scaleX = scale;
          fabricImg.scaleY = scale;
        }
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
      };
      imgEl.src = url;
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddImageFromUrl = () => {
    const canvas = fabricRef.current;
    if (!canvas || !imageUrl.trim()) return;
    const url = imageUrl.trim();
    setShowImageUrlDialog(false);
    setImageUrl("");
    const imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    imgEl.onload = () => {
      const fabricImg = new fabric.FabricImage(imgEl, {
        left: canvas.getWidth() / 2 - Math.min(imgEl.width, 300) / 2,
        top: canvas.getHeight() / 2 - Math.min(imgEl.height, 300) / 2,
      });
      const maxDim = 300;
      if (imgEl.width > maxDim || imgEl.height > maxDim) {
        const scale = maxDim / Math.max(imgEl.width, imgEl.height);
        fabricImg.scaleX = scale;
        fabricImg.scaleY = scale;
      }
      canvas.add(fabricImg);
      canvas.setActiveObject(fabricImg);
      canvas.renderAll();
    };
    imgEl.onerror = () => {
      toast({ title: "Image failed to load", description: "The URL could not be loaded. Make sure it's a direct link to an image.", variant: "destructive" });
    };
    imgEl.src = url;
  };

  const handleManualSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedBoardId) return;
    try {
      setIsSaving(true);
      const canvasData = canvas.toJSON();
      await saveCanvas({ id: selectedBoardId, canvasData });
      setHasUnsaved(false);
      toast({ title: "Saved", description: "Planning board saved successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save planning board.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadImage = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 } as any);
    const link = document.createElement("a");
    const boardName = boards.find((b: PlanningBoardType) => b.id === selectedBoardId)?.name || "planning-board";
    link.download = `${boardName.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleCreateBoard = async () => {
    try {
      const result = await createBoard({
        projectId,
        name: newBoardName || "Untitled Board",
        ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
      });
      setSelectedBoardId(result.id);
      setNewBoardName("");
      setSelectedTemplateId(null);
      setShowNewBoardDialog(false);
      toast({ title: "Created", description: selectedTemplateId ? "Board created from template." : "New planning board created." });
    } catch {
      toast({ title: "Error", description: "Failed to create board.", variant: "destructive" });
    }
  };

  const handleRenameBoard = async () => {
    if (!selectedBoardId || !renameName.trim()) return;
    try {
      await updateBoard({ id: selectedBoardId, name: renameName.trim() });
      setShowRenameDialog(false);
      toast({ title: "Renamed", description: "Board renamed successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to rename board.", variant: "destructive" });
    }
  };

  const handleDeleteBoard = async () => {
    if (!selectedBoardId) return;
    try {
      await deleteBoard({ id: selectedBoardId, projectId });
      setSelectedBoardId(null);
      setShowDeleteConfirm(false);
      toast({ title: "Deleted", description: "Board deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete board.", variant: "destructive" });
    }
  };

  const handleLinkUpdate = async (field: string, value: number | null | string[] | number[]) => {
    if (!selectedBoardId) return;
    try {
      await updateBoard({ id: selectedBoardId, [field]: value } as any);
      toast({ title: "Updated", description: "Board link updated." });
    } catch {
      toast({ title: "Error", description: "Failed to update link.", variant: "destructive" });
    }
  };

  const toggleLinkedUser = (userId: string) => {
    const current = currentBoard?.linkedUserIds || [];
    const next = current.includes(userId)
      ? current.filter((id: string) => id !== userId)
      : [...current, userId];
    handleLinkUpdate("linkedUserIds", next);
  };

  const toggleLinkedProject = (pid: number) => {
    const current = currentBoard?.linkedProjectIds || [];
    const next = current.includes(pid)
      ? current.filter((id: number) => id !== pid)
      : [...current, pid];
    handleLinkUpdate("linkedProjectIds", next);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const canvas = fabricRef.current;
      if (!canvas) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const active = canvas.getActiveObject();
        if (active && !(active instanceof fabric.IText && (active as fabric.IText).isEditing)) {
          e.preventDefault();
          handleDelete();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        handleDuplicate();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, selectedBoardId]);

  const handleBoardSwitch = useCallback(async (boardId: string) => {
    if (hasUnsaved && selectedBoardId) {
      const canvas = fabricRef.current;
      if (canvas) {
        try {
          setIsSaving(true);
          const canvasData = canvas.toJSON();
          await saveCanvas({ id: selectedBoardId, canvasData });
          setHasUnsaved(false);
        } catch {} finally {
          setIsSaving(false);
        }
      }
    }
    setSelectedBoardId(Number(boardId));
  }, [hasUnsaved, selectedBoardId, saveCanvas]);

  const currentBoard = boards.find((b: PlanningBoardType) => b.id === selectedBoardId);

  const toolBtn = (
    mode: ToolMode | string,
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    active?: boolean
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={`toggle-elevate ${active ?? tool === mode ? "toggle-elevated bg-muted" : ""}`}
          onClick={onClick || (() => setTool(mode as ToolMode))}
          data-testid={`button-tool-${mode}`}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]" data-testid="planning-board-container">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Select
          value={selectedBoardId?.toString() || ""}
          onValueChange={handleBoardSwitch}
          data-testid="select-board"
        >
          <SelectTrigger className="w-[200px]" data-testid="select-board-trigger">
            <SelectValue placeholder={isLoadingBoards ? "Loading..." : "Select a board"} />
          </SelectTrigger>
          <SelectContent>
            {boards.map((b: PlanningBoardType) => (
              <SelectItem key={b.id} value={b.id.toString()} data-testid={`select-board-item-${b.id}`}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { setNewBoardName(""); setShowNewBoardDialog(true); }}
              data-testid="button-new-board"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">New Board</TooltipContent>
        </Tooltip>

        {selectedBoardId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-board-menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => { setRenameName(currentBoard?.name || ""); setShowRenameDialog(true); }}
                data-testid="menu-rename-board"
              >
                <Edit3 className="h-4 w-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowLinkDialog(true)}
                data-testid="menu-link-board"
              >
                <Link2 className="h-4 w-4 mr-2" /> Link to...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDownloadImage}
                data-testid="menu-download-board"
              >
                <Download className="h-4 w-4 mr-2" /> Download as Image
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive"
                data-testid="menu-delete-board"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {currentBoard?.linkedMilestoneId && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md" data-testid="badge-linked-milestone">
            Linked: {milestones.find((m: any) => m.id === currentBoard.linkedMilestoneId)?.title || "Milestone"}
          </span>
        )}
        {currentBoard?.linkedChecklistItemId && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md" data-testid="badge-linked-checklist">
            Linked: {checklistItems.find((c: any) => c.id === currentBoard.linkedChecklistItemId)?.title || "Checklist"}
          </span>
        )}
        {currentBoard?.linkedCalendarEventId && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md" data-testid="badge-linked-event">
            Linked: {calendarEvents.find((e: any) => e.id === currentBoard.linkedCalendarEventId)?.title || "Event"}
          </span>
        )}
        {(currentBoard?.linkedUserIds?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1" data-testid="badges-linked-people">
            <span className="text-xs text-muted-foreground mr-0.5">People:</span>
            <div className="flex -space-x-1.5">
              {currentBoard!.linkedUserIds!.slice(0, 4).map((uid: string) => {
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
            {currentBoard!.linkedUserIds!.length > 4 && (
              <span className="text-xs text-muted-foreground">+{currentBoard!.linkedUserIds!.length - 4}</span>
            )}
          </div>
        )}
        {(currentBoard?.linkedProjectIds?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 flex-wrap" data-testid="badges-linked-projects">
            {currentBoard!.linkedProjectIds!.map((pid: number) => {
              const proj = allProjects.find((p: any) => p.id === pid);
              return proj ? (
                <Badge key={pid} variant="outline" className="text-[10px]" data-testid={`badge-project-${pid}`}>
                  {proj.name}
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      {isMobileView && (
        <div className="sm:hidden flex items-start gap-3 px-3 py-2.5 mb-2 rounded-lg bg-muted/60 border border-border/50 text-sm" data-testid="banner-mobile-planning-board">
          <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Full editing is available on desktop. You can pan and zoom to explore the board here.</span>
        </div>
      )}

      {isLoadingData && !canvasReady && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-planning-board" />
        </div>
      )}

      {boards.length === 0 && !isLoadingBoards && (
        <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-boards">
          <p className="text-muted-foreground">No planning boards yet.</p>
          <Button
            onClick={() => { setNewBoardName("Main Board"); setShowNewBoardDialog(true); }}
            data-testid="button-create-first-board"
          >
            <Plus className="h-4 w-4 mr-2" /> Create Your First Board
          </Button>
        </div>
      )}

      {boards.length > 0 && (
      <Card className={`hidden sm:flex items-center gap-1 p-1.5 mb-3 flex-wrap ${(!selectedBoardId || isLoadingData) ? "invisible" : ""}`} data-testid="planning-board-toolbar">
        {!isViewOnly && toolBtn("select", <MousePointer2 className="h-4 w-4" />, "Select (V)")}
        {!isViewOnly && toolBtn("draw", <Pencil className="h-4 w-4" />, "Draw / Sketch")}
        {!isViewOnly && toolBtn("eraser", <Eraser className="h-4 w-4" />, "Eraser")}

        {!isViewOnly && <Separator orientation="vertical" className="h-6 mx-1" />}

        {!isViewOnly && toolBtn("text", <Type className="h-4 w-4" />, "Add Text", addText, false)}
        {!isViewOnly && toolBtn("sticky", <StickyNote className="h-4 w-4" />, "Sticky Note", addSticky, false)}
        {!isViewOnly && toolBtn("card", <LayoutPanelLeft className="h-4 w-4" />, "Add Card / Column", openCardDialog, false)}
        {!isViewOnly && toolBtn("rect", <Square className="h-4 w-4" />, "Rectangle", addRect, false)}
        {!isViewOnly && toolBtn("circle", <Circle className="h-4 w-4" />, "Circle", addCircle, false)}

        {!isViewOnly && <Separator orientation="vertical" className="h-6 mx-1" />}

        {!isViewOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                disabled={isUploadingImage}
                data-testid="button-add-image"
              >
                {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} data-testid="menu-upload-image">
                <ImagePlus className="h-4 w-4 mr-2" /> Upload from Device
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setImageUrl(""); setShowImageUrlDialog(true); }} data-testid="menu-image-from-url">
                <Link2 className="h-4 w-4 mr-2" /> Paste Image URL
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageUpload}
          data-testid="input-planning-board-image"
        />

        {!isViewOnly && <Separator orientation="vertical" className="h-6 mx-1" />}

        {!isViewOnly && (
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  data-testid="button-color-picker"
                >
                  <div className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: brushColor }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Brush Color</TooltipContent>
            </Tooltip>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-popover border rounded-md p-2 shadow-md" data-testid="color-picker-popover">
                <div className="grid grid-cols-5 gap-1.5">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      className="h-6 w-6 rounded-full border-2 transition-transform"
                      style={{
                        backgroundColor: c,
                        borderColor: brushColor === c ? "hsl(var(--primary))" : "transparent",
                      }}
                      onClick={() => { setBrushColor(c); setShowColorPicker(false); }}
                      data-testid={`button-color-${c.slice(1)}`}
                    />
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t">
                  <Input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="h-7 w-full p-0 border-0"
                    data-testid="input-custom-color"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!isViewOnly && (tool === "draw" || tool === "eraser") && (
          <div className="flex items-center gap-2 ml-1" data-testid="brush-size-control">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Size</span>
            <Slider
              value={[brushSize]}
              onValueChange={([v]) => setBrushSize(v)}
              min={1}
              max={20}
              step={1}
              className="w-20"
              data-testid="slider-brush-size"
            />
            <span className="text-[10px] text-muted-foreground w-4">{brushSize}</span>
          </div>
        )}

        <div className="flex-1" />

        {!isViewOnly && toolBtn("duplicate", <Copy className="h-4 w-4" />, "Duplicate (Cmd+D)", handleDuplicate, false)}
        {!isViewOnly && toolBtn("forward", <ChevronUp className="h-4 w-4" />, "Bring Forward", bringForward, false)}
        {!isViewOnly && toolBtn("backward", <ChevronDown className="h-4 w-4" />, "Send Backward", sendBackward, false)}
        {!isViewOnly && toolBtn("deleteObj", <Trash2 className="h-4 w-4" />, "Delete (Del)", handleDelete, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("undo", <Undo2 className="h-4 w-4" />, "Undo (Cmd+Z)", handleUndo, false)}
        {toolBtn("redo", <Redo2 className="h-4 w-4" />, "Redo (Cmd+Shift+Z)", handleRedo, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("zoomOut", <ZoomOut className="h-4 w-4" />, "Zoom Out", () => handleZoom(-0.1), false)}
        <button
          className="text-xs text-muted-foreground min-w-[3rem] text-center hover:text-foreground transition-colors cursor-pointer"
          onClick={resetView}
          title="Reset to 100%"
          data-testid="button-reset-zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        {toolBtn("zoomIn", <ZoomIn className="h-4 w-4" />, "Zoom In", () => handleZoom(0.1), false)}
        {toolBtn("fitScreen", <Maximize className="h-4 w-4" />, "Fit to Screen", fitToScreen, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={hasUnsaved ? "default" : "ghost"}
              onClick={handleManualSave}
              disabled={isSaving || !selectedBoardId}
              data-testid="button-save-planning-board"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {hasUnsaved ? "Save (Cmd+S)" : "Saved"}
          </TooltipContent>
        </Tooltip>
      </Card>
      )}

      {tool === "sticky" && boards.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1" data-testid="sticky-color-bar">
          <span className="text-xs text-muted-foreground">Sticky color:</span>
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              className="h-5 w-5 rounded border-2 transition-transform"
              style={{
                backgroundColor: c,
                borderColor: stickyColor === c ? "hsl(var(--primary))" : "transparent",
              }}
              onClick={() => setStickyColor(c)}
              data-testid={`button-sticky-color-${c.slice(1)}`}
            />
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 border rounded-md overflow-hidden bg-muted/30 ${boards.length === 0 ? "hidden" : ""} ${(!selectedBoardId || isLoadingBoard) && boards.length > 0 ? "invisible" : ""}`}
        style={{ cursor: isPanning || spaceHeld.current ? "grabbing" : tool === "draw" ? "crosshair" : tool === "eraser" ? "cell" : "default" }}
        data-testid="planning-board-canvas-container"
      >
        <canvas ref={canvasRef} data-testid="planning-board-canvas" />
      </div>

      {boards.length > 0 && (
        <div className={`flex items-center justify-between mt-2 px-1 ${(!selectedBoardId || isLoadingData) ? "invisible" : ""}`}>
          <p className="text-[10px] text-muted-foreground">
            Scroll to pan, Ctrl+scroll to zoom, hold Space to drag. Click % to reset view. {hasUnsaved && "(Auto-saving...)"}
          </p>
          <p className="text-[10px] text-muted-foreground" data-testid="text-save-status">
            {isSaving ? "Saving..." : hasUnsaved ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
      )}

      <Dialog open={showNewBoardDialog} onOpenChange={(open) => { setShowNewBoardDialog(open); if (!open) { setSelectedTemplateId(null); setNewBoardName(""); } }}>
        <DialogContent className={isAdmin && templateCatalogue.length > 0 ? "sm:max-w-lg" : ""}>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Board name"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
            data-testid="input-new-board-name"
          />
          {isAdmin && templateCatalogue.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Start from Template</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(null)}
                  className={`flex items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors hover:bg-accent/50 ${selectedTemplateId === null ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
                  data-testid="template-blank"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">Blank Board</div>
                    <div className="text-[10px] text-muted-foreground truncate">Start from scratch</div>
                  </div>
                </button>
                {templateCatalogue.map((t) => {
                  const IconComp = t.icon === "ChefHat" ? ChefHat : t.icon === "Bath" ? Bath : t.icon === "Home" ? Home : Palette;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`flex gap-2.5 rounded-md border p-2.5 text-left transition-colors hover:bg-accent/50 ${selectedTemplateId === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
                      data-testid={`template-${t.id}`}
                    >
                      <img src={templatePreviewById[t.id] ?? t.image} alt={t.name} className="h-16 w-20 shrink-0 rounded object-cover border border-border" data-testid={`img-template-${t.id}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <IconComp className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="text-xs font-medium truncate">{t.name}</div>
                        </div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2">{t.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBoardDialog(false)} data-testid="button-cancel-new-board">Cancel</Button>
            <Button onClick={handleCreateBoard} data-testid="button-confirm-new-board">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Board</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New name"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameBoard()}
            data-testid="input-rename-board"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)} data-testid="button-cancel-rename">Cancel</Button>
            <Button onClick={handleRenameBoard} data-testid="button-confirm-rename">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{currentBoard?.name}"? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBoard} data-testid="button-confirm-delete">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Board To...</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">People</label>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2" data-testid="link-people-list">
                {allUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No team members found</p>
                )}
                {allUsers.map((u: any) => {
                  const isLinked = (currentBoard?.linkedUserIds || []).includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer"
                      data-testid={`link-person-${u.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => toggleLinkedUser(u.id)}
                        data-testid={`checkbox-person-${u.id}`}
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={u.profileImageUrl || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        {u.firstName} {u.lastName}
                      </span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{u.role}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Projects</label>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2" data-testid="link-projects-list">
                {allProjects.filter((p: any) => p.id !== projectId).length === 0 && (
                  <p className="text-xs text-muted-foreground">No other projects available</p>
                )}
                {allProjects.filter((p: any) => p.id !== projectId).map((p: any) => {
                  const isLinked = (currentBoard?.linkedProjectIds || []).includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer"
                      data-testid={`link-project-${p.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => toggleLinkedProject(p.id)}
                        data-testid={`checkbox-project-${p.id}`}
                      />
                      <span className="text-sm truncate">{p.name}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{p.status}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div>
              <label className="text-sm font-medium mb-1 block">Milestone</label>
              <Select
                value={currentBoard?.linkedMilestoneId?.toString() || "none"}
                onValueChange={(v) => handleLinkUpdate("linkedMilestoneId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger data-testid="select-link-milestone">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {milestones.map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Checklist Item</label>
              <Select
                value={currentBoard?.linkedChecklistItemId?.toString() || "none"}
                onValueChange={(v) => handleLinkUpdate("linkedChecklistItemId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger data-testid="select-link-checklist">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {checklistItems.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Calendar Event</label>
              <Select
                value={currentBoard?.linkedCalendarEventId?.toString() || "none"}
                onValueChange={(v) => handleLinkUpdate("linkedCalendarEventId", v === "none" ? null : Number(v))}
              >
                <SelectTrigger data-testid="select-link-event">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {calendarEvents.map((e: any) => (
                    <SelectItem key={e.id} value={e.id.toString()}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowLinkDialog(false)} data-testid="button-close-link-dialog">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImageUrlDialog} onOpenChange={setShowImageUrlDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Image from URL</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Paste the direct link to an image (e.g. ending in .jpg, .png, .webp).</p>
          <Input
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddImageFromUrl(); }}
            data-testid="input-image-url"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageUrlDialog(false)}>Cancel</Button>
            <Button onClick={handleAddImageFromUrl} disabled={!imageUrl.trim()} data-testid="button-confirm-image-url">Add Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCardDialog} onOpenChange={setShowCardDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Card / Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Column Title</Label>
              <Input
                placeholder="New Column"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                data-testid="input-card-title"
              />
            </div>

            {cardItems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Content ({cardItems.length} card{cardItems.length !== 1 ? "s" : ""})</Label>
                {cardItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted p-2 rounded-md">
                    {item.type === "text" && (
                      <div className="flex-1 text-sm truncate"><Type className="h-3 w-3 inline mr-1" />{item.text}</div>
                    )}
                    {item.type === "color" && (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="h-5 w-5 rounded" style={{ backgroundColor: item.color }} />
                        <span className="text-sm truncate">{item.color} - {item.colorName}</span>
                      </div>
                    )}
                    {item.type === "image" && (
                      <div className="flex-1 text-sm truncate"><ImagePlus className="h-3 w-3 inline mr-1" />{item.imageCaption || item.imageUrl}</div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeCardItem(i)}
                      data-testid={`button-remove-card-item-${i}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {cardAddMode === null && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Add Content</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setCardAddMode("text")} data-testid="button-add-text-item">
                    <Type className="h-3.5 w-3.5 mr-1.5" /> Text Block
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCardAddMode("color")} data-testid="button-add-color-item">
                    <Palette className="h-3.5 w-3.5 mr-1.5" /> Color Swatch
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCardAddMode("image")} data-testid="button-add-image-item">
                    <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> Image
                  </Button>
                </div>
              </div>
            )}

            {cardAddMode === "text" && (
              <div className="space-y-2 bg-muted/50 p-3 rounded-md border">
                <Label className="text-sm font-medium">Text Block</Label>
                <Input
                  placeholder="Type your note text..."
                  value={cardItemText}
                  onChange={(e) => setCardItemText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCardItem(); }}
                  autoFocus
                  data-testid="input-card-item-text"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setCardAddMode(null)}>Cancel</Button>
                  <Button size="sm" onClick={addCardItem} disabled={!cardItemText.trim()} data-testid="button-confirm-card-item">Add</Button>
                </div>
              </div>
            )}

            {cardAddMode === "color" && (
              <div className="space-y-2 bg-muted/50 p-3 rounded-md border">
                <Label className="text-sm font-medium">Color Swatch</Label>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={cardItemColor}
                        onChange={(e) => setCardItemColor(e.target.value)}
                        className="h-9 w-12 rounded border cursor-pointer"
                        data-testid="input-card-item-color"
                      />
                      <Input
                        value={cardItemColor}
                        onChange={(e) => setCardItemColor(e.target.value)}
                        className="font-mono text-sm"
                        placeholder="#EE96E7"
                        data-testid="input-card-item-color-hex"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    placeholder="Lavender Magenta"
                    value={cardItemColorName}
                    onChange={(e) => setCardItemColorName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCardItem(); }}
                    data-testid="input-card-item-color-name"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setCardAddMode(null)}>Cancel</Button>
                  <Button size="sm" onClick={addCardItem} data-testid="button-confirm-card-item">Add</Button>
                </div>
              </div>
            )}

            {cardAddMode === "image" && (
              <div className="space-y-2 bg-muted/50 p-3 rounded-md border">
                <Label className="text-sm font-medium">Image</Label>
                <div>
                  <Label className="text-xs text-muted-foreground">Image URL</Label>
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={cardItemImageUrl}
                    onChange={(e) => setCardItemImageUrl(e.target.value)}
                    data-testid="input-card-item-image-url"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Caption (optional)</Label>
                  <Input
                    placeholder="Image description..."
                    value={cardItemImageCaption}
                    onChange={(e) => setCardItemImageCaption(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCardItem(); }}
                    data-testid="input-card-item-image-caption"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setCardAddMode(null)}>Cancel</Button>
                  <Button size="sm" onClick={addCardItem} disabled={!cardItemImageUrl.trim()} data-testid="button-confirm-card-item">Add</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCardDialog(false)} data-testid="button-cancel-card">Cancel</Button>
            <Button onClick={handleCreateCard} data-testid="button-confirm-card">Create Card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
