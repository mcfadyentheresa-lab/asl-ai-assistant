import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface HeroImageEditorProps {
  projectId: number;
  imageUrl: string;
  initialFocalX: number;
  initialFocalY: number;
  initialZoom: number;
  onCancel: () => void;
  onSaved: (next: { focalX: number; focalY: number; zoom: number }) => void;
}

const PREVIEW_RATIOS: Array<{ label: string; ratio: number }> = [
  { label: "Mobile 16:9", ratio: 16 / 9 },
  { label: "Tablet 21:9", ratio: 21 / 9 },
  { label: "Desktop 32:9", ratio: 32 / 9 },
];

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function HeroImageEditor({
  projectId,
  imageUrl,
  initialFocalX,
  initialFocalY,
  initialZoom,
  onCancel,
  onSaved,
}: HeroImageEditorProps) {
  const { toast } = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const [focalX, setFocalX] = useState(clamp(initialFocalX, 0, 1));
  const [focalY, setFocalY] = useState(clamp(initialFocalY, 0, 1));
  const [zoom, setZoom] = useState(clamp(initialZoom, MIN_ZOOM, MAX_ZOOM));
  const [saving, setSaving] = useState(false);
  const [autoFraming, setAutoFraming] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Pointer drag (works for mouse + Pencil + touch).
  const dragState = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startFocalX: number;
    startFocalY: number;
    rect: DOMRect | null;
  }>({ active: false, pointerId: null, startX: 0, startY: 0, startFocalX: 0.5, startFocalY: 0.5, rect: null });

  // Pinch state — track two pointers.
  const pinchState = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startDist: number;
    startZoom: number;
  }>({ pointers: new Map(), startDist: 0, startZoom: 1 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (animating) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(e.pointerId);
    pinchState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchState.current.pointers.size === 2) {
      const [a, b] = Array.from(pinchState.current.pointers.values());
      pinchState.current.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchState.current.startZoom = zoom;
      dragState.current.active = false;
      return;
    }

    dragState.current.active = true;
    dragState.current.pointerId = e.pointerId;
    dragState.current.startX = e.clientX;
    dragState.current.startY = e.clientY;
    dragState.current.startFocalX = focalX;
    dragState.current.startFocalY = focalY;
    dragState.current.rect = stage.getBoundingClientRect();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (animating) return;
    const tracked = pinchState.current.pointers.get(e.pointerId);
    if (!tracked) return;
    pinchState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchState.current.pointers.size >= 2) {
      const [a, b] = Array.from(pinchState.current.pointers.values()).slice(0, 2);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchState.current.startDist > 0) {
        const ratio = dist / pinchState.current.startDist;
        setZoom(clamp(pinchState.current.startZoom * ratio, MIN_ZOOM, MAX_ZOOM));
      }
      return;
    }

    if (!dragState.current.active || dragState.current.pointerId !== e.pointerId) return;
    const rect = dragState.current.rect;
    if (!rect) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    // Drag moves the image, so focal point moves OPPOSITE the drag direction.
    // Scale by zoom so the apparent travel matches finger movement.
    const denom = Math.max(zoom, 0.0001);
    const nextX = clamp(dragState.current.startFocalX - dx / (rect.width * denom), 0, 1);
    const nextY = clamp(dragState.current.startFocalY - dy / (rect.height * denom), 0, 1);
    setFocalX(nextX);
    setFocalY(nextY);
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pinchState.current.pointers.delete(e.pointerId);
    if (pinchState.current.pointers.size < 2) {
      pinchState.current.startDist = 0;
    }
    if (dragState.current.pointerId === e.pointerId) {
      dragState.current.active = false;
      dragState.current.pointerId = null;
    }
  };

  // Wheel zoom for desktop.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (animating) return;
      e.preventDefault();
      const delta = -e.deltaY / 400;
      setZoom((z) => clamp(z + delta, MIN_ZOOM, MAX_ZOOM));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [animating]);

  // ESC to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const animateTo = useCallback((target: { focalX: number; focalY: number; zoom: number }) => {
    setAnimating(true);
    const startX = focalX;
    const startY = focalY;
    const startZoom = zoom;
    const duration = 400;
    const startTime = performance.now();
    const tick = (t: number) => {
      const progress = Math.min(1, (t - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setFocalX(startX + (target.focalX - startX) * ease);
      setFocalY(startY + (target.focalY - startY) * ease);
      setZoom(startZoom + (target.zoom - startZoom) * ease);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setAnimating(false);
      }
    };
    requestAnimationFrame(tick);
  }, [focalX, focalY, zoom]);

  const handleAutoFrame = async () => {
    if (autoFraming) return;
    setAutoFraming(true);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/hero/auto-frame`);
      const data = await res.json();
      animateTo({
        focalX: clamp(Number(data.focalX), 0, 1),
        focalY: clamp(Number(data.focalY), 0, 1),
        zoom: clamp(Number(data.zoom), MIN_ZOOM, MAX_ZOOM),
      });
      if (data.reasoning) {
        toast({ title: "Auto-frame", description: data.reasoning });
      }
    } catch (err: any) {
      toast({
        title: "Auto-frame couldn't read this image",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setAutoFraming(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/hero`, {
        heroFocalX: Number(focalX.toFixed(4)),
        heroFocalY: Number(focalY.toFixed(4)),
        heroZoom: Number(zoom.toFixed(3)),
      });
      await res.json();
      onSaved({ focalX, focalY, zoom });
      toast({ title: "Hero updated" });
    } catch (err: any) {
      toast({
        title: "Couldn't save hero",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const objectPosition = `${(focalX * 100).toFixed(2)}% ${(focalY * 100).toFixed(2)}%`;
  const transform = `scale(${zoom.toFixed(3)})`;
  const transformOrigin = objectPosition;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex flex-col"
      data-testid="hero-image-editor"
      role="dialog"
      aria-label="Edit hero image"
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-black/40 text-white border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] tracking-[0.16em] uppercase text-white/85"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Edit hero
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAutoFrame}
            disabled={autoFraming || saving}
            className="h-11 min-w-[44px] px-3 gap-1.5 bg-white/95 text-foreground hover:bg-white"
            data-testid="btn-hero-auto-frame"
          >
            <Sparkles
              className={`h-4 w-4 ${autoFraming ? "animate-pulse" : ""}`}
              style={{ color: "#2f4a3a" }}
            />
            <span className="text-xs">{autoFraming ? "Framing…" : "Auto-frame"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            className="h-11 min-w-[44px] px-3 gap-1.5 text-white hover:bg-white/10"
            data-testid="btn-hero-cancel"
          >
            <X className="h-4 w-4" />
            <span className="text-xs">Cancel</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || autoFraming}
            className="h-11 min-w-[44px] px-3 gap-1.5"
            style={{ backgroundColor: "#2f4a3a", color: "white" }}
            data-testid="btn-hero-save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span className="text-xs">Save</span>
          </Button>
        </div>
      </div>

      {/* Stage: drag/pinch surface — uses 32:9 (the widest preview) so the user reframes against the most demanding crop. */}
      <div className="flex-1 overflow-auto px-4 py-5 md:px-8 md:py-8">
        <div className="max-w-5xl mx-auto space-y-5">
          <div
            ref={stageRef}
            className="relative w-full overflow-hidden rounded-md bg-black select-none touch-none cursor-grab active:cursor-grabbing"
            style={{ aspectRatio: "32 / 9", touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            data-testid="hero-edit-stage"
          >
            <img
              src={imageUrl}
              alt="Hero preview"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={{
                objectPosition,
                transform,
                transformOrigin,
                transition: animating ? "object-position 0ms, transform 0ms" : undefined,
              }}
              data-testid="hero-edit-preview"
            />
            {/* Crosshair handle showing focal point */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${focalX * 100}%`,
                top: `${focalY * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden="true"
            >
              <div
                className="rounded-full border-2 shadow-lg"
                style={{
                  width: 44,
                  height: 44,
                  borderColor: "#2f4a3a",
                  background: "rgba(255,255,255,0.18)",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.55)",
                }}
              />
            </div>
            {/* Helper text */}
            <div
              className="absolute left-3 bottom-3 px-2 py-1 rounded text-[10px] tracking-[0.12em] uppercase text-white/85 bg-black/40"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Drag to reframe · Pinch / scroll to zoom · {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Multi-aspect previews so the user can see how the same focal point reads at every size. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PREVIEW_RATIOS.map((p) => (
              <div key={p.label} className="space-y-1.5">
                <div
                  className="text-[10px] tracking-[0.14em] uppercase text-white/70"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {p.label}
                </div>
                <div
                  className="relative w-full overflow-hidden rounded-sm bg-black/30"
                  style={{ aspectRatio: `${p.ratio}` }}
                >
                  <img
                    src={imageUrl}
                    alt={`${p.label} preview`}
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ objectPosition, transform, transformOrigin }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
