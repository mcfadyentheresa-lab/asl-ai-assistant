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
  Layers,
  ChevronUp,
  ChevronDown,
  Palette,
  StickyNote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMoodboard, useSaveMoodboard, useUploadImage } from "@/hooks/use-projects";

type ToolMode = "select" | "draw" | "eraser" | "text" | "rect" | "circle" | "sticky";

const DRAW_COLORS = [
  "#1a1a1a", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#1e3a2f",
];

const STICKY_COLORS = [
  "#fef9c3", "#fce7f3", "#dbeafe", "#dcfce7", "#f3e8ff",
  "#fed7aa", "#e2e8f0",
];

interface MoodBoardProps {
  projectId: number;
}

export default function MoodBoard({ projectId }: MoodBoardProps) {
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

  const { data: moodboardData, isLoading: isLoadingData } = useMoodboard(projectId);
  const { mutateAsync: saveMoodboard } = useSaveMoodboard();
  const { mutateAsync: uploadImage, isPending: isUploadingImage } = useUploadImage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveStateRef = useRef<() => void>(() => {});
  const autoSaveRef = useRef<() => void>(() => {});
  const [canvasReady, setCanvasReady] = useState(false);

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
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      try {
        setIsSaving(true);
        const canvasData = canvas.toJSON();
        await saveMoodboard({ projectId, canvasData });
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
    if (!canvas || !canvasReady || isLoadingData || !moodboardData?.canvasData) return;

    isLoadingCanvas.current = true;
    canvas.loadFromJSON(moodboardData.canvasData).then(() => {
      canvas.renderAll();
      const state = JSON.stringify(canvas.toJSON());
      undoStack.current = [state];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
      isLoadingCanvas.current = false;
    }).catch(() => {
      isLoadingCanvas.current = false;
    });
  }, [moodboardData, isLoadingData, canvasReady]);

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
    const bg = new fabric.Rect({
      width: 180,
      height: 140,
      fill: stickyColor,
      rx: 6,
      ry: 6,
      shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.12)", blur: 8, offsetX: 2, offsetY: 2 }),
    });
    const label = new fabric.IText("Note", {
      fontFamily: "DM Sans, sans-serif",
      fontSize: 14,
      fill: "#1a1a1a",
      left: 12,
      top: 12,
      width: 156,
    });
    const group = new fabric.Group([bg, label], {
      left: canvas.getWidth() / 2 - 90,
      top: canvas.getHeight() / 2 - 70,
    });
    canvas.add(group);
    canvas.setActiveObject(group);
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

  const handleManualSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      setIsSaving(true);
      const canvasData = canvas.toJSON();
      await saveMoodboard({ projectId, canvasData });
      setHasUnsaved(false);
      toast({ title: "Saved", description: "Moodboard saved successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save moodboard.", variant: "destructive" });
    } finally {
      setIsSaving(false);
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
  }, [canUndo, canRedo]);

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
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]" data-testid="moodboard-container">
      {isLoadingData && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-moodboard" />
        </div>
      )}
      <Card className={`flex items-center gap-1 p-1.5 mb-3 flex-wrap ${isLoadingData ? "invisible" : ""}`} data-testid="moodboard-toolbar">
        {toolBtn("select", <MousePointer2 className="h-4 w-4" />, "Select (V)")}
        {toolBtn("draw", <Pencil className="h-4 w-4" />, "Draw / Sketch")}
        {toolBtn("eraser", <Eraser className="h-4 w-4" />, "Eraser")}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {toolBtn("text", <Type className="h-4 w-4" />, "Add Text", addText, false)}
        {toolBtn("sticky", <StickyNote className="h-4 w-4" />, "Sticky Note", addSticky, false)}
        {toolBtn("rect", <Square className="h-4 w-4" />, "Rectangle", addRect, false)}
        {toolBtn("circle", <Circle className="h-4 w-4" />, "Circle", addCircle, false)}

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              data-testid="button-add-image"
            >
              {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Add Image</TooltipContent>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageUpload}
          data-testid="input-moodboard-image"
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
              disabled={isSaving}
              data-testid="button-save-moodboard"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {hasUnsaved ? "Save (Cmd+S)" : "Saved"}
          </TooltipContent>
        </Tooltip>
      </Card>

      {tool === "sticky" && (
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
        className={`flex-1 border rounded-md overflow-hidden bg-muted/30 ${isLoadingData ? "invisible" : ""}`}
        style={{ cursor: tool === "draw" ? "crosshair" : tool === "eraser" ? "cell" : "default" }}
        data-testid="moodboard-canvas-container"
      >
        <canvas ref={canvasRef} data-testid="moodboard-canvas" />
      </div>

      <div className={`flex items-center justify-between mt-2 px-1 ${isLoadingData ? "invisible" : ""}`}>
        <p className="text-[10px] text-muted-foreground">
          Tip: Use Apple Pen or mouse to draw. Drag images to arrange. {hasUnsaved && "(Auto-saving...)"}
        </p>
        <p className="text-[10px] text-muted-foreground" data-testid="text-save-status">
          {isSaving ? "Saving..." : hasUnsaved ? "Unsaved changes" : "All changes saved"}
        </p>
      </div>
    </div>
  );
}
