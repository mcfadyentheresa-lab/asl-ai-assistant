/**
 * VersionsCompareDialog — side-by-side preview of the live board vs. a saved
 * snapshot. Both panels share zoom/pan via wheel + drag. The diff stat strip
 * uses a heuristic counts-based diff — not a semantic compare, by design.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Undo2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useBoardSnapshots,
  useCreateBoardSnapshot,
  useRestoreBoardSnapshot,
} from "@/hooks/use-projects";
import type { CanvasElement } from "@shared/schema";

interface MiniElement {
  id: number | string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: any;
}

const TYPE_COLOR: Record<string, string> = {
  text: "#fef3c7",
  note: "#fef3c7",
  plain_text: "#fafaf5",
  callout: "#fde68a",
  section_header: "#e7e5e4",
  surface: "#cbd5e1",
  color_swatch: "#cbd5e1",
  material: "#cbd5e1",
  image: "#dbeafe",
  link: "#ede9fe",
  hardware: "#fce7f3",
  product: "#dcfce7",
  todo: "#fef9c3",
  column: "#f5f5f4",
  room_zone: "#2f4a3a22",
  draw: "#f3f4f6",
  connector: "#9ca3af",
};

function typeColor(t: string): string {
  return TYPE_COLOR[t] ?? "#e5e7eb";
}

function bucketOf(t: string): string {
  if (t === "hardware") return "hardware";
  if (t === "surface" || t === "color_swatch" || t === "material") return "surface";
  if (t === "image") return "image";
  if (t === "link") return "link";
  if (t === "product") return "product";
  if (t === "text" || t === "note" || t === "plain_text" || t === "callout" || t === "section_header") return "text";
  return t;
}

function diffStats(live: MiniElement[], snap: MiniElement[]): string[] {
  const buckets: Record<string, [number, number]> = {};
  for (const e of live) {
    const b = bucketOf(e.type);
    buckets[b] = buckets[b] ?? [0, 0];
    buckets[b][0]++;
  }
  for (const e of snap) {
    const b = bucketOf(e.type);
    buckets[b] = buckets[b] ?? [0, 0];
    buckets[b][1]++;
  }
  const out: string[] = [];
  for (const [b, [cur, old]] of Object.entries(buckets)) {
    const delta = cur - old;
    if (delta === 0) continue;
    const sign = delta > 0 ? "+" : "−";
    const label = b === "surface" ? "surface" : b;
    const plural = Math.abs(delta) === 1 ? label : `${label}s`;
    out.push(`${sign}${Math.abs(delta)} ${plural}`);
  }

  const liveSwatches = live.filter((e) => bucketOf(e.type) === "surface");
  const snapSwatches = snap.filter((e) => bucketOf(e.type) === "surface");
  const liveHex = new Set(
    liveSwatches.map((e) => (e.content?.hex || e.content?.color || "").toLowerCase()).filter(Boolean),
  );
  const snapHex = new Set(
    snapSwatches.map((e) => (e.content?.hex || e.content?.color || "").toLowerCase()).filter(Boolean),
  );
  let palettesDiffer = false;
  if (liveHex.size !== snapHex.size) palettesDiffer = true;
  else for (const h of Array.from(liveHex)) if (!snapHex.has(h)) { palettesDiffer = true; break; }
  if (palettesDiffer && liveHex.size + snapHex.size > 0) out.push("palette changed");

  if (out.length === 0) out.push("no structural differences");
  return out;
}

function MiniBoard({
  elements,
  zoom,
  pan,
  onPanChange,
  onZoomChange,
}: {
  elements: MiniElement[];
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (p: { x: number; y: number }) => void;
  onZoomChange: (z: number) => void;
}) {
  const [dragging, setDragging] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  return (
    <div
      className="relative w-full h-full bg-muted/30 overflow-hidden touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        onPanChange({ x: dragging.px + (e.clientX - dragging.x), y: dragging.py + (e.clientY - dragging.y) });
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(null);
      }}
      onWheel={(e) => {
        if (e.deltaY === 0) return;
        const next = Math.min(2, Math.max(0.05, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
        onZoomChange(next);
      }}
    >
      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {elements.map((el) => {
          const text = el.content?.title || el.content?.text || el.content?.label || el.content?.name || "";
          const isImage = el.type === "image" && el.content?.url;
          return (
            <div
              key={el.id}
              className="absolute rounded-[2px] border border-foreground/10 overflow-hidden"
              style={{
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                background: el.type === "color_swatch" || el.type === "surface"
                  ? (el.content?.hex || el.content?.color || typeColor(el.type))
                  : typeColor(el.type),
              }}
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={el.content.url}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : text ? (
                <div className="p-1 text-[10px] leading-tight text-foreground/80 line-clamp-3 break-words">
                  {String(text).slice(0, 80)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface VersionsCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
  snapshotId: number | null;
  liveElements: CanvasElement[];
  onAfterRestore: () => Promise<void> | void;
}

export default function VersionsCompareDialog({
  open,
  onOpenChange,
  boardId,
  snapshotId,
  liveElements,
  onAfterRestore,
}: VersionsCompareDialogProps) {
  const { toast } = useToast();
  const { data: snapshots = [] } = useBoardSnapshots(boardId);
  const snap = (snapshots as any[]).find((s) => s.id === snapshotId);
  const snapElements = (snap?.canvasData as MiniElement[]) ?? [];

  const [zoom, setZoom] = useState(0.25);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [restoring, setRestoring] = useState(false);

  const { mutateAsync: createSnapshot } = useCreateBoardSnapshot();
  const { mutateAsync: restoreSnapshot } = useRestoreBoardSnapshot();

  const liveMini: MiniElement[] = useMemo(
    () => liveElements.map((e: any) => ({ id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, content: e.content })),
    [liveElements],
  );

  const stats = useMemo(() => diffStats(liveMini, snapElements), [liveMini, snapElements]);

  useEffect(() => {
    if (open) {
      setZoom(0.25);
      setPan({ x: 40, y: 40 });
    }
  }, [open, snapshotId]);

  const handleUseThisVersion = async () => {
    if (!snap) return;
    setRestoring(true);
    try {
      const autoName = `Auto: before restoring "${snap.name}"`;
      try {
        await createSnapshot({ boardId, name: autoName });
      } catch {
        toast({ title: "Could not auto-save current state — restore cancelled", variant: "destructive" });
        setRestoring(false);
        return;
      }
      await restoreSnapshot({ id: snap.id, boardId });
      await onAfterRestore();
      toast({ title: "Restored. Your previous state was saved as a snapshot." });
      onOpenChange(false);
    } catch {
      toast({ title: "Couldn't restore snapshot", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[1200px] w-[95vw] h-[85vh] p-0 flex flex-col gap-0"
        data-testid="versions-compare-dialog"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b">
          <div className="text-sm font-medium">
            Compare — current board vs. <span className="text-[#2f4a3a]">{snap?.name ?? "snapshot"}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onOpenChange(false)}
            aria-label="Close compare"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 grid grid-cols-2 min-h-0">
          <div className="border-r flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-b">
              Current (live)
            </div>
            <div className="flex-1 min-h-0">
              <MiniBoard
                elements={liveMini}
                zoom={zoom}
                pan={pan}
                onPanChange={setPan}
                onZoomChange={setZoom}
              />
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-b flex items-center justify-between">
              <span>Snapshot — read-only</span>
              <Button
                size="sm"
                disabled={restoring || !snap}
                onClick={handleUseThisVersion}
                className="h-7 px-2 text-xs bg-[#2f4a3a] hover:bg-[#2f4a3a]/90 text-white"
                data-testid="versions-compare-use"
              >
                {restoring ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
                Use this version
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <MiniBoard
                elements={snapElements}
                zoom={zoom}
                pan={pan}
                onPanChange={setPan}
                onZoomChange={setZoom}
              />
            </div>
          </div>
        </div>

        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="font-medium text-foreground/80">Differences:</span>
          {stats.map((s, i) => (
            <span key={i} className="rounded-full bg-muted px-2 py-0.5">{s}</span>
          ))}
          <span className="ml-auto text-[10px]">Drag to pan · scroll to zoom (linked)</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
