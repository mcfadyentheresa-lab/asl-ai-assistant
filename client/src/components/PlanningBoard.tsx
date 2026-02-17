import { useEffect, useRef, useState, useCallback } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
} from "@/hooks/use-projects";
import type { PlanningBoard as PlanningBoardType } from "@shared/schema";

type ToolMode = "select" | "draw" | "eraser" | "text" | "rect" | "circle" | "sticky";

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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoadingData = isLoadingBoards || isLoadingBoard;

  useEffect(() => {
    if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

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
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      setCanvasReady(false);
    };
  }, []);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !canvasReady) return;

    if (!selectedBoardId || isLoadingBoard) return;

    isLoadingCanvas.current = true;

    if (boardData?.canvasData) {
      canvas.loadFromJSON(boardData.canvasData).then(() => {
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

  const handleUndo = () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.current.length <= 1) return;
    const current = undoStack.current.pop()!;
    redoStack.current.push(current);
    const prev = undoStack.current[undoStack.current.length - 1];
    isLoadingCanvas.current = true;
    canvas.loadFromJSON(JSON.parse(prev)).then(() => {
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
    newZoom = Math.max(0.25, Math.min(3, newZoom));
    canvas.setZoom(newZoom);
    setZoom(newZoom);
    canvas.renderAll();
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const text = new fabric.IText("Type here", {
      left: Math.max(50, w / 2 - 50),
      top: Math.max(50, h / 2 - 15),
      fontFamily: "DM Sans, sans-serif",
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
    const rect = new fabric.Rect({
      left: canvas.getWidth() / 2 - 50,
      top: canvas.getHeight() / 2 - 50,
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
    const circle = new fabric.Circle({
      left: canvas.getWidth() / 2 - 40,
      top: canvas.getHeight() / 2 - 40,
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
    const textbox = new fabric.Textbox("Type your note here...", {
      left: canvas.getWidth() / 2 - 90,
      top: canvas.getHeight() / 2 - 70,
      width: 180,
      fontFamily: "DM Sans, sans-serif",
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
      const result = await createBoard({ projectId, name: newBoardName || "Untitled Board" });
      setSelectedBoardId(result.id);
      setNewBoardName("");
      setShowNewBoardDialog(false);
      toast({ title: "Created", description: "New planning board created." });
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

  const handleLinkUpdate = async (field: string, value: number | null) => {
    if (!selectedBoardId) return;
    try {
      await updateBoard({ id: selectedBoardId, [field]: value });
      toast({ title: "Updated", description: "Board link updated." });
    } catch {
      toast({ title: "Error", description: "Failed to update link.", variant: "destructive" });
    }
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
      </div>

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

      <Card className={`flex items-center gap-1 p-1.5 mb-3 flex-wrap ${(!selectedBoardId || isLoadingData) && boards.length > 0 ? "invisible" : ""} ${boards.length === 0 ? "hidden" : ""}`} data-testid="planning-board-toolbar">
        {toolBtn("select", <MousePointer2 className="h-4 w-4" />, "Select (V)")}
        {toolBtn("draw", <Pencil className="h-4 w-4" />, "Draw / Sketch")}
        {toolBtn("eraser", <Eraser className="h-4 w-4" />, "Eraser")}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("text", <Type className="h-4 w-4" />, "Add Text", addText, false)}
        {toolBtn("sticky", <StickyNote className="h-4 w-4" />, "Sticky Note", addSticky, false)}
        {toolBtn("rect", <Square className="h-4 w-4" />, "Rectangle", addRect, false)}
        {toolBtn("circle", <Circle className="h-4 w-4" />, "Circle", addCircle, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageUpload}
          data-testid="input-planning-board-image"
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

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

        {(tool === "draw" || tool === "eraser") && (
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

        {toolBtn("duplicate", <Copy className="h-4 w-4" />, "Duplicate (Cmd+D)", handleDuplicate, false)}
        {toolBtn("forward", <ChevronUp className="h-4 w-4" />, "Bring Forward", bringForward, false)}
        {toolBtn("backward", <ChevronDown className="h-4 w-4" />, "Send Backward", sendBackward, false)}
        {toolBtn("deleteObj", <Trash2 className="h-4 w-4" />, "Delete (Del)", handleDelete, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("undo", <Undo2 className="h-4 w-4" />, "Undo (Cmd+Z)", handleUndo, false)}
        {toolBtn("redo", <Redo2 className="h-4 w-4" />, "Redo (Cmd+Shift+Z)", handleRedo, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("zoomOut", <ZoomOut className="h-4 w-4" />, "Zoom Out", () => handleZoom(-0.1), false)}
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center" data-testid="text-zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        {toolBtn("zoomIn", <ZoomIn className="h-4 w-4" />, "Zoom In", () => handleZoom(0.1), false)}

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
        style={{ cursor: tool === "draw" ? "crosshair" : tool === "eraser" ? "cell" : "default" }}
        data-testid="planning-board-canvas-container"
      >
        <canvas ref={canvasRef} data-testid="planning-board-canvas" />
      </div>

      {boards.length > 0 && (
        <div className={`flex items-center justify-between mt-2 px-1 ${(!selectedBoardId || isLoadingData) ? "invisible" : ""}`}>
          <p className="text-[10px] text-muted-foreground">
            Tip: Double-click sticky notes to edit text. Use the image button to upload or paste a URL. {hasUnsaved && "(Auto-saving...)"}
          </p>
          <p className="text-[10px] text-muted-foreground" data-testid="text-save-status">
            {isSaving ? "Saving..." : hasUnsaved ? "Unsaved changes" : "All changes saved"}
          </p>
        </div>
      )}

      <Dialog open={showNewBoardDialog} onOpenChange={setShowNewBoardDialog}>
        <DialogContent>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Board To...</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
    </div>
  );
}
