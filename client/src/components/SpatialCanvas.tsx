import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  StickyNote, Type, ImagePlus, Square, Columns3, LayoutGrid, Link2, Palette, Trash2, Plus,
  ZoomIn, ZoomOut, Maximize, Loader2, MoreVertical, Edit3, Download, CheckSquare, GripVertical,
  X, ChevronDown, ExternalLink, Pencil, Upload, Copy, ArrowUpFromLine,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlanningBoards, useCreatePlanningBoard, useDeletePlanningBoard, useUpdatePlanningBoard, useUploadImage } from "@/hooks/use-projects";
import { useCanvasStore, debouncedSavePositions } from "@/stores/canvas-store";
import { api, buildUrl } from "@shared/routes";
import type { CanvasElement, PlanningBoard as PlanningBoardType } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

interface SpatialCanvasProps {
  projectId: number;
}

const GRID_SIZE = 20;

const ELEMENT_DEFAULTS: Record<string, { width: number; height: number; content: any }> = {
  note: { width: 240, height: 140, content: { title: "", text: "Type your note here..." } },
  todo: { width: 240, height: 200, content: { title: "To-do", items: [{ text: "Add a task...", checked: false }] } },
  column: { width: 240, height: 400, content: { title: "New Column", subtitle: "0 cards" } },
  board_link: { width: 180, height: 80, content: { title: "Board", targetBoardId: null } },
  link: { width: 240, height: 100, content: { title: "", url: "" } },
  image: { width: 240, height: 200, content: { url: "", caption: "" } },
  color_swatch: { width: 220, height: 220, content: { color: "#1e3a2f", name: "Forest Green", hex: "#1E3A2F" } },
  section_header: { width: 600, height: 40, content: { title: "Section Title" } },
};

export default function SpatialCanvas({ projectId }: SpatialCanvasProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const spaceRef = useRef(false);

  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [newBoardName, setNewBoardName] = useState("");

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [maxZ, setMaxZ] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const elements = useCanvasStore((s) => s.elements);
  const loading = useCanvasStore((s) => s.loading);
  const { setElements, addElement, updateElement, removeElement, moveElement, setLoading, setBoardId } = useCanvasStore.getState();

  const { data: boards = [], isLoading: isLoadingBoards } = usePlanningBoards(projectId);
  const { mutateAsync: createBoard } = useCreatePlanningBoard();
  const { mutateAsync: updateBoard } = useUpdatePlanningBoard();
  const { mutateAsync: deleteBoard } = useDeletePlanningBoard();
  const { mutateAsync: uploadImage } = useUploadImage();

  useEffect(() => {
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

  const handleCreateBoard = async () => {
    try {
      const board = await createBoard({ projectId, name: newBoardName || "Untitled Board" });
      setSelectedBoardId(board.id);
      setShowNewBoardDialog(false);
      setNewBoardName("");
      queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
    } catch {
      toast({ title: "Error", description: "Failed to create board", variant: "destructive" });
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
    await deleteBoard({ id: selectedBoardId, projectId });
    setShowDeleteConfirm(false);
    setSelectedBoardId(null);
    queryClient.invalidateQueries({ queryKey: [api.planningBoards.list.path, projectId] });
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
        body: JSON.stringify({ type, x: centerX, y: centerY, width: def.width, height: def.height, zIndex: newZ, content: def.content }),
      });
      const el = await res.json();
      addElement(el);
    } catch {
      toast({ title: "Error", description: "Failed to create element", variant: "destructive" });
    }
  };

  const handleDeleteElement = async (id: number) => {
    removeElement(id);
    setEditingId(null);
    try {
      const url = buildUrl(api.canvasElements.delete.path, { id });
      await fetch(url, { method: "DELETE", credentials: "include" });
    } catch {}
  };

  const handleUpdateContent = async (id: number, content: any) => {
    updateElement(id, { content });
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
    const newZ = maxZ;
    setMaxZ((z) => z + 1);
    updateElement(elementId, { zIndex: newZ });
    setDraggingId(elementId);
    setEditingId(elementId);
    dragStartRef.current = { x: touch.clientX, y: touch.clientY, elX: el.x, elY: el.y };
    longPressTimerRef.current = setTimeout(() => {
      setDraggingId(null);
      dragStartRef.current = null;
      openContextMenu(e, elementId);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Touch-based canvas handlers for drag & pan on mobile
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsPanning(true);
      panStartRef.current = { x: touch.clientX, y: touch.clientY, px: pan.x, py: pan.y };
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingId !== null && dragStartRef.current) {
      e.preventDefault();
      const dx = (touch.clientX - dragStartRef.current.x) / zoom;
      const dy = (touch.clientY - dragStartRef.current.y) / zoom;
      const newX = Math.round((dragStartRef.current.elX + dx) / GRID_SIZE) * GRID_SIZE;
      const newY = Math.round((dragStartRef.current.elY + dy) / GRID_SIZE) * GRID_SIZE;
      moveElement(draggingId, newX, newY);
    } else if (isPanning && panStartRef.current && e.touches.length === 1) {
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
    }
  };

  const handleCanvasTouchEnd = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingId !== null && selectedBoardId) {
      debouncedSavePositions(selectedBoardId);
      setDraggingId(null);
      dragStartRef.current = null;
    }
    handleLongPressEnd();
  };

  // Panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
    }
    if (draggingId !== null && dragStartRef.current) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      const newX = Math.round((dragStartRef.current.elX + dx) / GRID_SIZE) * GRID_SIZE;
      const newY = Math.round((dragStartRef.current.elY + dy) / GRID_SIZE) * GRID_SIZE;
      moveElement(draggingId, newX, newY);
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingId !== null && selectedBoardId) {
      debouncedSavePositions(selectedBoardId);
      setDraggingId(null);
      dragStartRef.current = null;
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
        if (editingId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
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

  const startDrag = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elements[id];
    if (!el) return;
    const newZ = maxZ;
    setMaxZ((z) => z + 1);
    updateElement(id, { zIndex: newZ });
    setDraggingId(id);
    setEditingId(id);
    dragStartRef.current = { x: e.clientX, y: e.clientY, elX: el.x, elY: el.y };
  };


  // Template: Weekly planner
  const createWeeklyPlanner = async () => {
    if (!selectedBoardId) return;
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const elems: any[] = [];
    elems.push({ type: "section_header", x: 40, y: 20, width: 1340, height: 40, zIndex: 0, content: { title: "Current week" } });
    days.forEach((d, i) => {
      elems.push({ type: "column", x: 40 + i * 260, y: 80, width: 240, height: 360, zIndex: 1, content: { title: d, subtitle: "0 cards" } });
    });
    elems.push({ type: "section_header", x: 40, y: 470, width: 1340, height: 40, zIndex: 0, content: { title: "Upcoming weeks" } });
    for (let row = 0; row < 3; row++) {
      days.forEach((d, i) => {
        elems.push({ type: "column", x: 40 + i * 260, y: 530 + row * 200, width: 240, height: 180, zIndex: 1, content: { title: d, subtitle: "0 cards" } });
      });
    }
    try {
      const url = buildUrl(api.canvasElements.createBatch.path, { boardId: selectedBoardId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ elements: elems }),
      });
      const created = await res.json();
      created.forEach((el: CanvasElement) => addElement(el));
      setMaxZ(Math.max(...created.map((e: CanvasElement) => e.zIndex)) + 1);
      fitToScreen();
      toast({ title: "Weekly Planner created" });
    } catch {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
    }
  };

  const selectedBoard = boards.find((b: PlanningBoardType) => b.id === selectedBoardId);
  const elementsList = Object.values(elements);

  // Card renderers
  const renderElement = (el: CanvasElement) => {
    const isSelected = editingId === el.id;
    const isDragging = draggingId === el.id;
    const c = (el.content || {}) as any;

    const cardBase = `absolute transition-shadow rounded select-none ${isSelected ? "ring-2 ring-primary/50 shadow-lg" : "shadow-sm"} ${isDragging ? "opacity-80 cursor-grabbing" : ""}`;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(el.id);
    };

    const dragHandle = (
      <div
        className="absolute -top-0 left-0 right-0 h-6 cursor-grab flex items-center justify-center opacity-0 hover:opacity-60 transition-opacity z-10"
        onMouseDown={(e) => startDrag(el.id, e)}
        data-testid={`drag-handle-${el.id}`}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );

    if (el.type === "section_header") {
      return (
        <div
          key={el.id}
          className="absolute select-none"
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          onMouseDown={(e) => startDrag(el.id, e)}
          data-testid={`element-section-header-${el.id}`}
        >
          {isSelected ? (
            <input
              className="w-full bg-transparent border-none text-lg font-serif font-semibold text-foreground/70 outline-none"
              style={{ borderBottom: "2px dashed hsl(var(--border))" }}
              defaultValue={c.title}
              onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
              autoFocus
              data-testid={`input-section-title-${el.id}`}
            />
          ) : (
            <div className="text-lg font-serif font-semibold text-foreground/70 border-b-2 border-dashed border-border pb-1 cursor-grab" data-testid={`text-section-title-${el.id}`}>
              {c.title || "Section Title"}
            </div>
          )}
        </div>
      );
    }

    if (el.type === "note") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-note-${el.id}`}
        >
          {dragHandle}
          <div className="p-3.5">
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
                  className="w-full bg-transparent border-none text-sm resize-none outline-none min-h-[60px] placeholder:text-muted-foreground/50"
                  defaultValue={c.text}
                  placeholder="Type your note..."
                  onBlur={(e) => handleUpdateContent(el.id, { ...c, text: e.target.value })}
                  data-testid={`input-note-text-${el.id}`}
                />
              </div>
            ) : (
              <div className="cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
                {c.title && <div className="text-sm font-semibold mb-1">{c.title}</div>}
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{c.text || "Type your note here..."}</div>
              </div>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
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
          className={`${cardBase} bg-card border border-border`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: 80, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-todo-${el.id}`}
        >
          {dragHandle}
          <div className="p-3.5">
            <div className="flex items-center justify-between mb-2 cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
              <span className="text-sm font-semibold">{c.title || "To-do"}</span>
              <span className="text-[10px] text-muted-foreground">{checked}/{items.length}</span>
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
                      className="flex-1 bg-transparent border-none text-xs outline-none"
                      defaultValue={item.text}
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
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-muted/40 border border-dashed border-border/60`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onClick={handleClick}
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
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "color_swatch") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-color-swatch-${el.id}`}
        >
          {dragHandle}
          <div className="cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
            <div className="h-[140px] relative" style={{ backgroundColor: c.color || "#1e3a2f" }}>
              <span className="absolute bottom-2 left-3 text-xs text-white/80 font-mono">{(c.hex || c.color || "#1E3A2F").toUpperCase()}</span>
            </div>
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
              </div>
            ) : (
              <div className="text-sm font-medium">{c.name || "Color"}</div>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
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
          className={`${cardBase} bg-card border border-border`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-link-${el.id}`}
        >
          {dragHandle}
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
              <div className="cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{c.title || c.url || "Link"}</span>
                </div>
                {c.url && <div className="text-[10px] text-primary truncate mt-1">{c.url}</div>}
              </div>
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
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-image-${el.id}`}
        >
          {dragHandle}
          {c.url ? (
            <div className="cursor-grab" onMouseDown={(e) => startDrag(el.id, e)}>
              <img src={c.url} alt={c.caption || ""} className="w-full h-auto max-h-[300px] object-cover" />
            </div>
          ) : (
            <div
              className="h-[120px] bg-muted flex flex-col items-center justify-center gap-2 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); triggerImageUpload(el.id); }}
              onMouseDown={(e) => { if (e.button !== 0) startDrag(el.id, e); }}
              data-testid={`image-upload-area-${el.id}`}
            >
              {isUploading && uploadTargetId === el.id ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground/60">Click to upload image</span>
                </>
              )}
            </div>
          )}
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
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); triggerImageUpload(el.id); }} disabled={isUploading} data-testid={`button-replace-image-${el.id}`}>
                <Upload className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (el.type === "board_link") {
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-board-link-${el.id}`}
        >
          <div className="p-3 flex flex-col items-center justify-center h-full cursor-grab gap-1.5" onMouseDown={(e) => startDrag(el.id, e)}>
            <LayoutGrid className="h-6 w-6 text-primary/60" />
            {isSelected ? (
              <input
                className="w-full bg-transparent border-none text-sm font-medium text-center outline-none"
                defaultValue={c.title}
                placeholder="Board name"
                onBlur={(e) => handleUpdateContent(el.id, { ...c, title: e.target.value })}
                data-testid={`input-board-link-title-${el.id}`}
              />
            ) : (
              <span className="text-sm font-medium">{c.title || "Board"}</span>
            )}
          </div>
          {isSelected && (
            <div className="absolute -top-8 right-0 flex gap-1">
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

  const sidebarTools = [
    { type: "note", icon: StickyNote, label: "Note" },
    { type: "link", icon: Link2, label: "Link" },
    { type: "todo", icon: CheckSquare, label: "To-do" },
    { type: "column", icon: Columns3, label: "Column" },
    { type: "board_link", icon: LayoutGrid, label: "Board" },
    { type: "image", icon: ImagePlus, label: "Image" },
    { type: "color_swatch", icon: Palette, label: "Color" },
    { type: "section_header", icon: Type, label: "Header" },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="spatial-canvas-root">
      {/* Board selector bar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {!isLoadingBoards && boards.length > 0 && (
          <Select value={String(selectedBoardId || "")} onValueChange={(v) => setSelectedBoardId(Number(v))}>
            <SelectTrigger className="w-[200px]" data-testid="select-board-trigger">
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
        <Button variant="outline" size="sm" onClick={() => { setNewBoardName(""); setShowNewBoardDialog(true); }} data-testid="button-new-board">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Board
        </Button>
        {selectedBoardId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-board-menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => { setRenameName(selectedBoard?.name || ""); setShowRenameDialog(true); }} data-testid="menu-rename-board">
                <Edit3 className="h-4 w-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={createWeeklyPlanner} data-testid="menu-weekly-template">
                <Columns3 className="h-4 w-4 mr-2" /> Add Weekly Planner
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteConfirm(true)} data-testid="menu-delete-board">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))} data-testid="button-zoom-out">
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Zoom Out</TooltipContent>
          </Tooltip>
          <button className="text-xs text-muted-foreground min-w-[3rem] text-center cursor-pointer hover:text-foreground transition-colors" onClick={resetView} data-testid="button-reset-zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(4, z + 0.1))} data-testid="button-zoom-in">
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={fitToScreen} data-testid="button-fit-screen">
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Fit to Screen</TooltipContent>
          </Tooltip>
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
          {/* Left sidebar */}
          <div className="w-16 shrink-0 border-r flex flex-col items-center py-3 gap-1 bg-muted/20" data-testid="canvas-sidebar">
            {sidebarTools.map((t) => (
              <Tooltip key={t.type}>
                <TooltipTrigger asChild>
                  <button
                    className="w-12 h-12 flex flex-col items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors gap-0.5"
                    onClick={() => t.type === "image" ? triggerImageUpload() : createElement(t.type)}
                    data-testid={`sidebar-tool-${t.type}`}
                  >
                    <t.icon className="h-5 w-5" />
                    <span className="text-[9px] leading-none">{t.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{t.label}</TooltipContent>
              </Tooltip>
            ))}
            <Separator className="my-1 w-8" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-12 h-12 flex flex-col items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors gap-0.5"
                  onClick={() => { if (editingId) handleDeleteElement(editingId); }}
                  data-testid="sidebar-tool-delete"
                >
                  <Trash2 className="h-5 w-5" />
                  <span className="text-[9px] leading-none">Delete</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Delete Selected</TooltipContent>
            </Tooltip>
          </div>

          {/* Canvas area */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden bg-background"
            style={{ cursor: isPanning ? "grabbing" : spaceRef.current ? "grab" : "default", touchAction: "none" }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            onTouchEnd={handleCanvasTouchEnd}
            onWheel={handleWheel}
            onClick={() => { if (!draggingId) { setEditingId(null); setContextMenu(null); } }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
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
            </div>
          </div>
        </div>
      )}

      {/* Tip bar */}
      {boards.length > 0 && selectedBoardId && (
        <div className="flex items-center justify-between mt-1.5 px-1">
          <p className="text-[10px] text-muted-foreground">
            Scroll to pan. Ctrl+scroll to zoom. Hold Space to drag canvas. Click elements to edit.
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
      <Dialog open={showNewBoardDialog} onOpenChange={setShowNewBoardDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New Board</DialogTitle></DialogHeader>
          <Input placeholder="Board name" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }} data-testid="input-new-board-name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBoardDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateBoard} data-testid="button-confirm-new-board">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Board</DialogTitle></DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }} data-testid="input-rename-board" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancel</Button>
            <Button onClick={handleRename} data-testid="button-confirm-rename">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Board</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete &quot;{selectedBoard?.name}&quot; and all its elements. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBoard} data-testid="button-confirm-delete-board">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
