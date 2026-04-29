import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

// Crop is stored as fractions of the natural image (0..1).
// { x, y, w, h } where x+w <= 1 and y+h <= 1.
export type ImageCrop = { x: number; y: number; w: number; h: number };

const FULL_CROP: ImageCrop = { x: 0, y: 0, w: 1, h: 1 };

type DragMode =
  | { kind: "move"; startX: number; startY: number; orig: ImageCrop }
  | { kind: "resize"; corner: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; orig: ImageCrop }
  | null;

interface ImageCropDialogProps {
  open: boolean;
  imageUrl: string;
  initialCrop?: ImageCrop | null;
  onCancel: () => void;
  onApply: (crop: ImageCrop | null) => void; // null clears the crop
}

/**
 * Lightweight image cropper. The user drags a rectangular selection over the
 * full image; the result is persisted as 0..1 fractions of the natural image
 * so it survives container resizes. No external deps.
 */
export function ImageCropDialog({ open, imageUrl, initialCrop, onCancel, onApply }: ImageCropDialogProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgRect, setImgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<ImageCrop>(initialCrop ?? FULL_CROP);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  // Reset crop when dialog opens.
  useEffect(() => {
    if (open) {
      setCrop(initialCrop ?? FULL_CROP);
      setImgLoaded(false);
      setImgRect(null);
    }
  }, [open, imageUrl, initialCrop]);

  // Measure the rendered image inside its letterboxed container.
  const measure = () => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || !img.naturalWidth || !img.naturalHeight) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = sw;
    let h = sw / ar;
    if (h > sh) {
      h = sh;
      w = sh * ar;
    }
    setImgRect({ left: (sw - w) / 2, top: (sh - h) / 2, width: w, height: h });
  };

  useEffect(() => {
    if (!imgLoaded) return;
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded]);

  // Convert crop fractions to pixel rect inside the stage.
  const cropPx = useMemo(() => {
    if (!imgRect) return null;
    return {
      left: imgRect.left + crop.x * imgRect.width,
      top: imgRect.top + crop.y * imgRect.height,
      width: crop.w * imgRect.width,
      height: crop.h * imgRect.height,
    };
  }, [crop, imgRect]);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const onPointerDownMove = (e: React.PointerEvent) => {
    if (!imgRect) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragMode({ kind: "move", startX: e.clientX, startY: e.clientY, orig: crop });
  };

  const onPointerDownResize = (corner: "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    if (!imgRect) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragMode({ kind: "resize", corner, startX: e.clientX, startY: e.clientY, orig: crop });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !imgRect) return;
    const dxFrac = (e.clientX - dragMode.startX) / imgRect.width;
    const dyFrac = (e.clientY - dragMode.startY) / imgRect.height;
    const o = dragMode.orig;
    const MIN = 0.05; // keep selection at least 5% per side so it remains grabbable

    if (dragMode.kind === "move") {
      const nx = clamp01(o.x + dxFrac);
      const ny = clamp01(o.y + dyFrac);
      // Don't let it slide past the right/bottom edge.
      const x = Math.min(nx, 1 - o.w);
      const y = Math.min(ny, 1 - o.h);
      setCrop({ x, y, w: o.w, h: o.h });
      return;
    }

    // Resize from one corner; opposite corner stays anchored.
    let x = o.x;
    let y = o.y;
    let w = o.w;
    let h = o.h;
    if (dragMode.corner === "nw") {
      const nx = clamp01(o.x + dxFrac);
      const ny = clamp01(o.y + dyFrac);
      x = Math.min(nx, o.x + o.w - MIN);
      y = Math.min(ny, o.y + o.h - MIN);
      w = o.x + o.w - x;
      h = o.y + o.h - y;
    } else if (dragMode.corner === "ne") {
      const nw = Math.max(MIN, Math.min(1 - o.x, o.w + dxFrac));
      const ny = clamp01(o.y + dyFrac);
      y = Math.min(ny, o.y + o.h - MIN);
      h = o.y + o.h - y;
      w = nw;
    } else if (dragMode.corner === "sw") {
      const nx = clamp01(o.x + dxFrac);
      x = Math.min(nx, o.x + o.w - MIN);
      w = o.x + o.w - x;
      h = Math.max(MIN, Math.min(1 - o.y, o.h + dyFrac));
    } else if (dragMode.corner === "se") {
      w = Math.max(MIN, Math.min(1 - o.x, o.w + dxFrac));
      h = Math.max(MIN, Math.min(1 - o.y, o.h + dyFrac));
    }
    setCrop({ x, y, w, h });
  };

  const onPointerUp = () => setDragMode(null);

  const handleApply = () => {
    // If the user effectively did not crop, clear it instead.
    const cleared =
      crop.x < 0.001 && crop.y < 0.001 && crop.w > 0.999 && crop.h > 0.999;
    onApply(cleared ? null : crop);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>Drag the corners to choose what to keep. Drag inside the box to reposition it.</DialogDescription>
        </DialogHeader>

        <div
          ref={stageRef}
          className="relative w-full bg-[#1f1d1a] rounded-md overflow-hidden select-none"
          style={{ height: 420, touchAction: "none" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Underlying image, letterboxed in stage. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={() => setImgLoaded(true)}
            className="absolute pointer-events-none"
            style={imgRect ? { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height } : { opacity: 0 }}
            data-testid="image-crop-source"
          />

          {imgRect && cropPx && (
            <>
              {/* Dim mask outside crop. Four rects around the crop window. */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.55)", clipPath: `polygon(
                0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                ${cropPx.left}px ${cropPx.top}px,
                ${cropPx.left}px ${cropPx.top + cropPx.height}px,
                ${cropPx.left + cropPx.width}px ${cropPx.top + cropPx.height}px,
                ${cropPx.left + cropPx.width}px ${cropPx.top}px,
                ${cropPx.left}px ${cropPx.top}px
              )` }} />

              {/* Crop window */}
              <div
                className="absolute border border-white/90 cursor-move"
                style={{ left: cropPx.left, top: cropPx.top, width: cropPx.width, height: cropPx.height, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
                onPointerDown={onPointerDownMove}
                data-testid="image-crop-window"
              >
                {/* Rule-of-thirds guides */}
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)", backgroundSize: "33.333% 33.333%" }} />

                {/* Corner handles */}
                {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                  <div
                    key={corner}
                    className="absolute w-3 h-3 bg-white border border-[#1f1d1a]"
                    style={{
                      left: corner.includes("w") ? -6 : undefined,
                      right: corner.includes("e") ? -6 : undefined,
                      top: corner.includes("n") ? -6 : undefined,
                      bottom: corner.includes("s") ? -6 : undefined,
                      cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                    }}
                    onPointerDown={onPointerDownResize(corner)}
                    data-testid={`image-crop-handle-${corner}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCrop(FULL_CROP)}
            data-testid="image-crop-reset"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} data-testid="image-crop-cancel">Cancel</Button>
            <Button size="sm" onClick={handleApply} data-testid="image-crop-apply">Apply crop</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
