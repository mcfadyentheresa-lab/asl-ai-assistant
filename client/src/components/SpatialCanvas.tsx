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
  Bold, Italic, Strikethrough, Underline, List, ListOrdered, Code, Link as LinkIcon,
  MousePointer, Eraser, Undo2, Redo2, Save, PenTool,
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
  draw: { width: 400, height: 300, content: { paths: [], color: "#000000", strokeWidth: 2 } },
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
  const [showImagePopup, setShowImagePopup] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const noteTextareaRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const [focusedTodoItem, setFocusedTodoItem] = useState<{ elementId: number; itemIdx: number } | null>(null);
  const [drawTool, setDrawTool] = useState<"pen" | "select" | "eraser">("pen");
  const [drawColor, setDrawColor] = useState("#000000");
  const [drawStrokeWidth, setDrawStrokeWidth] = useState(2);
  const [drawingPaths, setDrawingPaths] = useState<any[]>([]);
  const [drawUndoStack, setDrawUndoStack] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawCanvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});

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
      const el = elements[draggingId];
      if (el) {
        const snappedX = Math.round(el.x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(el.y / GRID_SIZE) * GRID_SIZE;
        moveElement(draggingId, snappedX, snappedY);
        if (el.type !== "column") {
          assignToColumn(draggingId);
        }
      }
      debouncedSavePositions(selectedBoardId);
      setDraggingId(null);
      dragStartRef.current = null;
    }
    handleLongPressEnd();
  };

  const assignToColumn = (elementId: number) => {
    const el = elements[elementId];
    if (!el || el.type === "column" || el.type === "section_header") return;
    const cx = el.x + (el.width / 2);
    const cy = el.y + ((el.height || 60) / 2);
    let foundColumn: number | null = null;
    Object.values(elements).forEach((col) => {
      if (col.type !== "column" || col.id === elementId) return;
      if (
        cx >= col.x &&
        cx <= col.x + col.width &&
        cy >= col.y &&
        cy <= col.y + (col.height || 300)
      ) {
        foundColumn = col.id;
      }
    });
    if (foundColumn !== el.parentColumnId) {
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
        updateElement(elementId, {
          parentColumnId: foundColumn,
          width: fitWidth,
          x: col.x + padding,
          y: stackY + 8,
        });
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

  const renderFormattingToolbar = (elementId: number) => (
    <div
      className="absolute -top-9 left-0 flex items-center gap-0.5 bg-card border border-border rounded-md shadow-md px-1 py-0.5 z-20"
      onMouseDown={(e) => e.stopPropagation()}
      data-testid={`formatting-toolbar-${elementId}`}
    >
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "bold")} data-testid={`format-bold-${elementId}`}><Bold className="h-3.5 w-3.5" /></button>
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "italic")} data-testid={`format-italic-${elementId}`}><Italic className="h-3.5 w-3.5" /></button>
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "strikethrough")} data-testid={`format-strikethrough-${elementId}`}><Strikethrough className="h-3.5 w-3.5" /></button>
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "underline")} data-testid={`format-underline-${elementId}`}><Underline className="h-3.5 w-3.5" /></button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "bullet")} data-testid={`format-bullet-${elementId}`}><List className="h-3.5 w-3.5" /></button>
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "numbered")} data-testid={`format-numbered-${elementId}`}><ListOrdered className="h-3.5 w-3.5" /></button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "code")} data-testid={`format-code-${elementId}`}><Code className="h-3.5 w-3.5" /></button>
      <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => applyFormat(elementId, "link")} data-testid={`format-link-${elementId}`}><LinkIcon className="h-3.5 w-3.5" /></button>
    </div>
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
      setShowImagePopup(false);
      setImageUrlInput("");
    } catch {
      toast({ title: "Error", description: "Failed to add image", variant: "destructive" });
    }
  };

  const redrawCanvas = useCallback((canvasEl: HTMLCanvasElement, paths: any[]) => {
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    paths.forEach((path: any) => {
      if (!path.points || path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.color || "#000000";
      ctx.lineWidth = path.strokeWidth || 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  }, []);

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
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (draggingId !== null && selectedBoardId) {
      const el = elements[draggingId];
      if (el) {
        const snappedX = Math.round(el.x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(el.y / GRID_SIZE) * GRID_SIZE;
        moveElement(draggingId, snappedX, snappedY);
        if (el.type !== "column") {
          assignToColumn(draggingId);
        }
      }
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

  useEffect(() => {
    if (editingId !== null) {
      const el = elements[editingId];
      if (el?.type === "draw") {
        const content = (el.content || {}) as any;
        setDrawingPaths(content.paths || []);
        setDrawUndoStack([]);
      }
    }
  }, [editingId]);

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
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-note-${el.id}`}
        >
          {isSelected && renderFormattingToolbar(el.id)}
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
          style={{ left: el.x, top: el.y, width: el.width, minHeight: 80, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-todo-${el.id}`}
        >
          {isSelected && renderFormattingToolbar(el.id)}
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
      const isDropTarget = draggingId !== null && draggingId !== el.id && elements[draggingId]?.type !== "column";
      const childrenBottom = childEls.reduce((acc, child) => {
        return Math.max(acc, (child.y - el.y) + (child.height || 60) + 12);
      }, 0);
      const computedHeight = Math.max(el.height || 300, childrenBottom);
      const hasCustomBg = !!c.backgroundColor;
      const isDraggedSwatch = isDropTarget && draggingId !== null && elements[draggingId]?.type === "color_swatch";
      const presetColors = ["#ffffff", "#d4d4d4", "#fecdd3", "#e9d5ff", "#bfdbfe", "#bbf7d0", "#fef08a", "#fed7aa"];

      const swatchDropY = (() => {
        if (!isDraggedSwatch) return 0;
        const padding = 12;
        const headerHeight = 50;
        const siblings = childEls;
        return siblings.reduce((acc, sib) => {
          const sibBottom = (sib.y - el.y) + (sib.height || 60);
          return Math.max(acc, sibBottom);
        }, headerHeight) + 8;
      })();

      return (
        <div
          key={el.id}
          className={`${cardBase} border border-dashed ${isDropTarget ? "border-primary/40" : "border-border/60"} ${!hasCustomBg && !isDropTarget ? "bg-muted/40" : ""} ${isDropTarget && !hasCustomBg ? "bg-primary/10" : ""} transition-colors`}
          style={{
            left: el.x, top: el.y, width: el.width, minHeight: computedHeight, zIndex: el.zIndex,
            ...(hasCustomBg ? { backgroundColor: c.backgroundColor } : {}),
          }}
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
          {isDraggedSwatch && (
            <div
              className="absolute border-2 border-dashed border-foreground rounded"
              style={{
                left: 12,
                top: swatchDropY,
                width: el.width - 24,
                height: 60,
                pointerEvents: "none",
              }}
              data-testid={`swatch-drop-preview-${el.id}`}
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
                    onClick={(e) => { e.stopPropagation(); const { backgroundColor, ...rest } = c; handleUpdateContent(el.id, rest); }}
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
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-color-swatch-${el.id}`}
        >
          <div className="h-[140px] relative pointer-events-none select-none" style={{ backgroundColor: c.color || "#1e3a2f" }}>
            <span className="absolute bottom-2 left-3 text-xs text-white/80 font-mono">{(c.hex || c.color || "#1E3A2F").toUpperCase()}</span>
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
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
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
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border overflow-hidden cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-image-${el.id}`}
        >
          {c.url ? (
            <img src={c.url} alt={c.caption || ""} className="w-full h-auto max-h-[300px] object-cover pointer-events-none select-none" draggable={false} />
          ) : (
            <div
              className="h-[120px] bg-muted flex flex-col items-center justify-center gap-2 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); triggerImageUpload(el.id); }}
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
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={handleElementTouchStart(el.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-board-link-${el.id}`}
        >
          <div className="p-3 flex flex-col items-center justify-center h-full gap-1.5">
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

    if (el.type === "draw") {
      const paths = c.paths || [];
      const currentPaths = isSelected ? drawingPaths : paths;
      return (
        <div
          key={el.id}
          className={`${cardBase} bg-card border border-border cursor-grab`}
          style={{ left: el.x, top: el.y, width: el.width, minHeight: el.height, zIndex: el.zIndex }}
          onMouseDown={(e) => {
            if (isSelected && drawTool !== "select") return;
            const tag = (e.target as HTMLElement).tagName.toLowerCase();
            if (tag === "canvas" || tag === "input" || tag === "button" || (e.target as HTMLElement).closest("button")) return;
            startDrag(el.id, e);
          }}
          onClick={handleClick}
          onContextMenu={(e) => openContextMenu(e, el.id)}
          onTouchStart={(e) => {
            if (isSelected && drawTool !== "select") { e.stopPropagation(); return; }
            handleElementTouchStart(el.id)(e);
          }}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          data-testid={`element-draw-${el.id}`}
        >
          <canvas
            ref={(ref) => {
              drawCanvasRefs.current[el.id] = ref;
              if (ref && ref.width !== el.width && ref.height !== (el.height - 40)) {
                ref.width = el.width;
                ref.height = el.height - 40;
                redrawCanvas(ref, currentPaths);
              }
            }}
            width={el.width}
            height={el.height - 40}
            className="bg-white cursor-crosshair"
            style={{ display: "block" }}
            onMouseDown={(e) => {
              if (!isSelected || drawTool === "select") return;
              e.stopPropagation();
              e.preventDefault();
              const canvas = drawCanvasRefs.current[el.id];
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;
              if (drawTool === "eraser") {
                const newPaths = drawingPaths.filter((p: any) => {
                  return !p.points.some((pt: any) => Math.abs(pt.x - x) < 10 && Math.abs(pt.y - y) < 10);
                });
                setDrawingPaths(newPaths);
                redrawCanvas(canvas, newPaths);
              } else {
                setIsDrawing(true);
                setDrawingPaths((prev) => [...prev, { points: [{ x, y }], color: drawColor, strokeWidth: drawStrokeWidth }]);
              }
            }}
            onMouseMove={(e) => {
              if (!isDrawing || !isSelected || drawTool !== "pen") return;
              e.stopPropagation();
              const canvas = drawCanvasRefs.current[el.id];
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;
              setDrawingPaths((prev) => {
                const newPaths = [...prev];
                const last = { ...newPaths[newPaths.length - 1] };
                last.points = [...last.points, { x, y }];
                newPaths[newPaths.length - 1] = last;
                redrawCanvas(canvas, newPaths);
                return newPaths;
              });
            }}
            onMouseUp={() => { setIsDrawing(false); }}
            onMouseLeave={() => { setIsDrawing(false); }}
            onTouchStart={(e) => {
              if (!isSelected || drawTool === "select") return;
              e.stopPropagation();
              const touch = e.touches[0];
              const canvas = drawCanvasRefs.current[el.id];
              if (!canvas || !touch) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (touch.clientX - rect.left) * scaleX;
              const y = (touch.clientY - rect.top) * scaleY;
              setIsDrawing(true);
              setDrawingPaths((prev) => [...prev, { points: [{ x, y }], color: drawColor, strokeWidth: drawStrokeWidth }]);
            }}
            onTouchMove={(e) => {
              if (!isDrawing || !isSelected || drawTool !== "pen") return;
              e.stopPropagation();
              const touch = e.touches[0];
              const canvas = drawCanvasRefs.current[el.id];
              if (!canvas || !touch) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (touch.clientX - rect.left) * scaleX;
              const y = (touch.clientY - rect.top) * scaleY;
              setDrawingPaths((prev) => {
                const newPaths = [...prev];
                const last = { ...newPaths[newPaths.length - 1] };
                last.points = [...last.points, { x, y }];
                newPaths[newPaths.length - 1] = last;
                redrawCanvas(canvas, newPaths);
                return newPaths;
              });
            }}
            onTouchEnd={() => { setIsDrawing(false); }}
            data-testid={`draw-canvas-${el.id}`}
          />
          <div className="p-2 text-[10px] text-muted-foreground text-center border-t border-border">
            {paths.length} path{paths.length !== 1 ? "s" : ""}
          </div>
          {isSelected && (
            <>
              <div className="absolute -top-8 right-0 flex gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteElement(el.id)} data-testid={`button-delete-${el.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div
                className="absolute -bottom-10 left-0 right-0 flex items-center justify-center gap-1 bg-card border border-border rounded-md shadow-md px-2 py-1 z-20"
                onMouseDown={(e) => e.stopPropagation()}
                data-testid={`draw-toolbar-${el.id}`}
              >
                <button className={`p-1 rounded transition-colors ${drawTool === "pen" ? "bg-primary/20" : "hover:bg-muted"}`} onClick={() => setDrawTool("pen")} data-testid={`draw-pen-${el.id}`}><PenTool className="h-3.5 w-3.5" /></button>
                <button className={`p-1 rounded transition-colors ${drawTool === "select" ? "bg-primary/20" : "hover:bg-muted"}`} onClick={() => setDrawTool("select")} data-testid={`draw-select-${el.id}`}><MousePointer className="h-3.5 w-3.5" /></button>
                <button className={`p-1 rounded transition-colors ${drawTool === "eraser" ? "bg-primary/20" : "hover:bg-muted"}`} onClick={() => setDrawTool("eraser")} data-testid={`draw-eraser-${el.id}`}><Eraser className="h-3.5 w-3.5" /></button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} className="w-5 h-5 rounded cursor-pointer border border-border" data-testid={`draw-color-${el.id}`} />
                <button className="p-1 rounded hover:bg-muted transition-colors text-[9px] font-mono" onClick={() => setDrawStrokeWidth((w) => w >= 8 ? 1 : w + 1)} data-testid={`draw-stroke-${el.id}`}>{drawStrokeWidth}px</button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => { if (drawingPaths.length > 0) { setDrawUndoStack((s) => [...s, drawingPaths[drawingPaths.length - 1]]); const newPaths = drawingPaths.slice(0, -1); setDrawingPaths(newPaths); const canvas = drawCanvasRefs.current[el.id]; if (canvas) redrawCanvas(canvas, newPaths); } }} data-testid={`draw-undo-${el.id}`}><Undo2 className="h-3.5 w-3.5" /></button>
                <button className="p-1 rounded hover:bg-muted transition-colors" onClick={() => { if (drawUndoStack.length > 0) { const restored = drawUndoStack[drawUndoStack.length - 1]; setDrawUndoStack((s) => s.slice(0, -1)); const newPaths = [...drawingPaths, restored]; setDrawingPaths(newPaths); const canvas = drawCanvasRefs.current[el.id]; if (canvas) redrawCanvas(canvas, newPaths); } }} data-testid={`draw-redo-${el.id}`}><Redo2 className="h-3.5 w-3.5" /></button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button className="p-1 rounded hover:bg-muted transition-colors text-destructive" onClick={() => { setDrawingPaths(paths); setDrawUndoStack([]); const canvas = drawCanvasRefs.current[el.id]; if (canvas) redrawCanvas(canvas, paths); }} data-testid={`draw-discard-${el.id}`}><X className="h-3.5 w-3.5" /></button>
                <button className="p-1 rounded hover:bg-muted transition-colors text-primary" onClick={() => { handleUpdateContent(el.id, { ...c, paths: drawingPaths }); setDrawUndoStack([]); }} data-testid={`draw-save-${el.id}`}><Save className="h-3.5 w-3.5" /></button>
              </div>
            </>
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
    { type: "draw", icon: Pencil, label: "Draw" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="spatial-canvas-root">
      {/* Board selector bar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
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
                    className="w-12 h-12 flex flex-col items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors gap-0.5 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("tool-type", t.type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => t.type === "image" ? setShowImagePopup(!showImagePopup) : createElement(t.type)}
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

          {showImagePopup && (
            <div className="absolute left-[72px] top-1/3 z-50 bg-card border border-border rounded-md shadow-lg w-64" data-testid="image-popup-panel">
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
