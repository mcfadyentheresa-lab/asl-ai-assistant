// CompareDrawer — the decision surface for the Design Board.
// Designers pin 2-4 cards side by side at full size to choose between options.
// Backed by `compareIds` in the canvas store; opens via the floating "Compare (N)"
// pill or the keyboard shortcut Shift+C. Pick winner sets a card's status to
// `selected` and routes through the same status edit path the AI Partner panel
// observes. Save comparison drops a small `text` callout near the top-right of
// the canvas capturing the winner + also-considered.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Pin, X, Trash2, Save, Check, ExternalLink } from "lucide-react";
import type { CanvasElement } from "@shared/schema";
import { isCategorizable, isRoomable } from "@/lib/board-rooms";

const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  shortlist: "Shortlist",
  selected: "Selected",
  ordered: "Ordered",
};

// Comparable types per spec: hardware, surface, product, link.
export function isComparable(el: CanvasElement | undefined): boolean {
  if (!el) return false;
  return (
    el.type === "hardware" ||
    el.type === "surface" ||
    el.type === "product" ||
    el.type === "link"
  );
}

type SpecRowKey =
  | "type"
  | "name"
  | "brand"
  | "sku"
  | "finish"
  | "dimensions"
  | "color"
  | "price"
  | "vendorUrl"
  | "status"
  | "room"
  | "category";

interface SpecRowDef {
  key: SpecRowKey;
  label: string;
  // numeric / id-like values render in JetBrains Mono.
  mono?: boolean;
}

const SPEC_ROWS: SpecRowDef[] = [
  { key: "type", label: "Type" },
  { key: "name", label: "Name" },
  { key: "brand", label: "Brand / Supplier" },
  { key: "sku", label: "SKU / Code", mono: true },
  { key: "finish", label: "Finish / Sheen" },
  { key: "dimensions", label: "Dimensions", mono: true },
  { key: "color", label: "Color" },
  { key: "price", label: "Price", mono: true },
  { key: "vendorUrl", label: "Vendor" },
  { key: "status", label: "Status" },
  { key: "room", label: "Room" },
  { key: "category", label: "Category" },
];

interface SpecValue {
  raw: string | null;
  // Optional render hints used by the cell renderer.
  swatch?: string;
  hex?: string;
  lrv?: number;
  url?: string;
}

function typeLabel(el: CanvasElement): string {
  if (el.type === "hardware") return "Hardware";
  if (el.type === "product") return "Product";
  if (el.type === "link") return "Link";
  if (el.type === "surface") {
    const k = (el.content as any)?.kind;
    if (k === "paint") return "Paint";
    if (k === "material") return "Material";
    return "Surface";
  }
  return el.type;
}

function priceLabel(el: CanvasElement): string | null {
  const c = (el.content || {}) as any;
  if (el.type === "hardware") {
    if (typeof c.price === "number" && Number.isFinite(c.price)) {
      const cur = c.currency || "CAD";
      return `${cur} ${c.price.toFixed(2)}`;
    }
    return null;
  }
  // product / link store price as a free-form string.
  if (typeof c.price === "string" && c.price.trim()) return c.price.trim();
  return null;
}

function nameLabel(el: CanvasElement): string {
  const c = (el.content || {}) as any;
  if (el.type === "link") return c.title || c.url || "Untitled link";
  return c.name || c.title || "Untitled";
}

function brandLabel(el: CanvasElement): string | null {
  const c = (el.content || {}) as any;
  return c.brand || c.supplier || null;
}

function skuLabel(el: CanvasElement): string | null {
  const c = (el.content || {}) as any;
  return c.sku || c.code || null;
}

function finishLabel(el: CanvasElement): string | null {
  const c = (el.content || {}) as any;
  return c.finish || c.sheen || null;
}

function vendorUrlOf(el: CanvasElement): string | null {
  const c = (el.content || {}) as any;
  return c.vendorUrl || c.url || null;
}

function colorValue(el: CanvasElement): SpecValue | null {
  const c = (el.content || {}) as any;
  if (el.type === "surface" && (c.kind || "paint") === "paint") {
    const hex = (c.hex || c.color || "").toString();
    if (!hex) return null;
    const label = c.name || hex.toUpperCase();
    const lrv = typeof c.lrv === "number" ? c.lrv : undefined;
    return {
      raw: label,
      swatch: hex,
      hex: hex.toUpperCase(),
      lrv,
    };
  }
  return null;
}

function specValue(el: CanvasElement, key: SpecRowKey): SpecValue | null {
  const c = (el.content || {}) as any;
  switch (key) {
    case "type":
      return { raw: typeLabel(el) };
    case "name":
      return { raw: nameLabel(el) };
    case "brand": {
      const v = brandLabel(el);
      return v ? { raw: v } : null;
    }
    case "sku": {
      const v = skuLabel(el);
      return v ? { raw: v } : null;
    }
    case "finish": {
      const v = finishLabel(el);
      return v ? { raw: v } : null;
    }
    case "dimensions": {
      const v = c.dimensions;
      return typeof v === "string" && v.trim() ? { raw: v.trim() } : null;
    }
    case "color":
      return colorValue(el);
    case "price": {
      const p = priceLabel(el);
      return p ? { raw: p } : null;
    }
    case "vendorUrl": {
      const u = vendorUrlOf(el);
      if (!u) return null;
      let host = u;
      try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
      return { raw: host, url: u };
    }
    case "status": {
      if (!isRoomable(el)) return null;
      const s = (c.status as string) || "idea";
      return { raw: STATUS_LABEL[s] || s };
    }
    case "room": {
      if (!isRoomable(el)) return null;
      const r = c.room;
      return typeof r === "string" && r.trim() ? { raw: r.trim() } : null;
    }
    case "category": {
      if (!isCategorizable(el)) return null;
      const cat = c.category;
      return typeof cat === "string" && cat.trim() ? { raw: cat.trim() } : null;
    }
    default:
      return null;
  }
}

function thumbForCard(el: CanvasElement): JSX.Element {
  const c = (el.content || {}) as any;
  if (el.type === "surface" && (c.kind || "paint") === "paint") {
    const hex = c.hex || c.color || "#1e3a2f";
    return (
      <div className="relative w-full" style={{ height: 160, backgroundColor: hex }}>
        <span
          className="absolute bottom-2 left-3 text-xs text-white/90"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {(c.hex || c.color || "").toUpperCase() || ""}
        </span>
        {typeof c.lrv === "number" && (
          <span
            className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-sm bg-black/35 text-white"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            LRV {c.lrv}
          </span>
        )}
      </div>
    );
  }
  if (c.imageUrl) {
    return (
      <div className="w-full bg-muted overflow-hidden" style={{ height: 160 }}>
        <img
          src={c.imageUrl}
          alt={nameLabel(el)}
          className="w-full h-full object-cover"
          style={{ filter: "saturate(0.9) contrast(0.97)" }}
        />
      </div>
    );
  }
  // No image — fall back to a warm-paper tile so the column still has rhythm.
  return (
    <div
      className="w-full flex items-center justify-center"
      style={{ height: 160, background: "linear-gradient(135deg, #f4ede0 0%, #ede4d3 100%)" }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.2em] text-foreground/50"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {typeLabel(el)}
      </span>
    </div>
  );
}

interface SaveResult {
  ok: boolean;
}

interface CompareDrawerProps {
  open: boolean;
  onClose: () => void;
  compareIds: number[];
  elements: Record<number, CanvasElement>;
  removeFromCompare: (id: number) => void;
  clearCompare: () => void;
  // Set status via the same path other status edits use, so the AI Partner
  // panel sees the diff. The host wires this to handleUpdateContent.
  onUpdateContent: (id: number, content: any) => void;
  onSaveComparison: (winnerId: number, alsoIds: number[]) => Promise<SaveResult> | SaveResult;
}

export default function CompareDrawer({
  open,
  onClose,
  compareIds,
  elements,
  removeFromCompare,
  clearCompare,
  onUpdateContent,
  onSaveComparison,
}: CompareDrawerProps) {
  const { toast } = useToast();
  const [winnerFlash, setWinnerFlash] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cards in spec order, dropping any that have been deleted from the board.
  const cards = useMemo(
    () => compareIds.map((id) => elements[id]).filter((el): el is CanvasElement => Boolean(el)),
    [compareIds, elements],
  );

  // Only show spec rows with at least one card carrying a value.
  const visibleSpecRows = useMemo(() => {
    if (cards.length === 0) return [] as SpecRowDef[];
    return SPEC_ROWS.filter((row) => cards.some((el) => specValue(el, row.key) != null));
  }, [cards]);

  // Esc / backdrop close — drag-down is provided by a top drag-handle button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const pickWinner = (el: CanvasElement) => {
    const c = (el.content || {}) as any;
    onUpdateContent(el.id, { ...c, status: "selected" });
    setWinnerFlash(el.id);
    setTimeout(() => setWinnerFlash(null), 1100);
    toast({ title: "Winner picked", description: nameLabel(el) });
  };

  const saveComparison = async () => {
    if (saving) return;
    const winner = cards.find((el) => ((el.content as any)?.status === "selected"));
    if (!winner) {
      toast({
        title: "Pick a winner first",
        description: "Tap Pick winner on a card to mark it Selected, then save.",
        variant: "destructive",
      });
      return;
    }
    const alsoIds = cards.filter((el) => el.id !== winner.id).map((el) => el.id);
    setSaving(true);
    try {
      const res = await onSaveComparison(winner.id, alsoIds);
      if (res && res.ok !== false) {
        toast({ title: "Comparison saved", description: `Winner: ${nameLabel(winner)}` });
      } else {
        toast({ title: "Couldn't save", description: "Try again in a moment.", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (el: CanvasElement, row: SpecRowDef) => {
    const v = specValue(el, row.key);
    if (!v) {
      return <span className="text-muted-foreground/40">—</span>;
    }
    if (row.key === "vendorUrl" && v.url) {
      return (
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
          style={{ fontFamily: "var(--font-mono)" }}
          onClick={(e) => e.stopPropagation()}
          data-testid={`compare-vendor-${el.id}`}
        >
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{v.raw}</span>
        </a>
      );
    }
    if (row.key === "color" && v.swatch) {
      return (
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-sm border border-border/60 shrink-0"
            style={{ backgroundColor: v.swatch }}
            aria-hidden
          />
          <span className="truncate">{v.raw}</span>
          <span
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {v.hex}
          </span>
          {typeof v.lrv === "number" && (
            <span
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              LRV {v.lrv}
            </span>
          )}
        </div>
      );
    }
    if (row.key === "status") {
      return (
        <span
          className="text-[11px] uppercase tracking-wider"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {v.raw}
        </span>
      );
    }
    return (
      <span
        className={row.mono ? "" : ""}
        style={row.mono ? { fontFamily: "var(--font-mono)" } : undefined}
      >
        {v.raw}
      </span>
    );
  };

  // iPad portrait (≤ ~1180px) shows max 2 columns; larger viewports show up to 4.
  // Beyond that, horizontal scroll preserves full-size rendering.
  const columnsClass = "grid-cols-1 md:grid-cols-2 xl:grid-cols-4";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Compare drawer"
      data-testid="compare-drawer"
    >
      {/* Warm-paper darken backdrop. Tap to close. */}
      <button
        type="button"
        aria-label="Close compare"
        className="absolute inset-0 bg-[#3a2f24]/30 backdrop-blur-[1px]"
        onClick={onClose}
        data-testid="compare-drawer-backdrop"
      />
      <div
        ref={containerRef}
        className="relative w-full bg-[#f3efe8] border-t border-border shadow-2xl rounded-t-xl flex flex-col"
        style={{ height: "70vh", fontFamily: "var(--font-sans)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — also acts as the close button (44pt min for iPad). */}
        <button
          type="button"
          aria-label="Close compare drawer"
          onClick={onClose}
          className="mx-auto mt-2 flex items-center justify-center w-16 h-11 group"
          data-testid="compare-drawer-handle"
        >
          <span className="block h-1.5 w-12 rounded-full bg-foreground/20 group-hover:bg-foreground/40 transition-colors" />
        </button>

        {/* Header — title + actions */}
        <div className="px-6 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-display, Inter Tight, Inter, sans-serif)" }}
            >
              Compare
            </h2>
            <span
              className="text-xs text-muted-foreground"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {cards.length} / 4
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={clearCompare}
              disabled={cards.length === 0}
              className="h-11 md:h-9 gap-1.5"
              data-testid="compare-drawer-clear"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </Button>
            <Button
              size="sm"
              onClick={saveComparison}
              disabled={saving || cards.length < 2}
              className="h-11 md:h-9 gap-1.5 bg-[#2f4a3a] text-white hover:bg-[#264033]"
              data-testid="compare-drawer-save"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save comparison</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 md:h-9 md:w-9"
              onClick={onClose}
              aria-label="Close"
              data-testid="compare-drawer-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p
              className="text-sm text-muted-foreground text-center max-w-sm"
              data-testid="compare-empty"
            >
              Long-press a card and add it to Compare to start.
            </p>
          </div>
        ) : cards.length === 1 ? (
          <div className="flex-1 flex flex-col gap-4 px-6 pb-6 overflow-auto">
            <div className={`grid ${columnsClass} gap-4`}>
              {cards.map((el) => (
                <CardColumn
                  key={el.id}
                  el={el}
                  flash={winnerFlash}
                  flashSelf={winnerFlash === el.id}
                  onPickWinner={() => pickWinner(el)}
                  onRemove={() => removeFromCompare(el.id)}
                />
              ))}
            </div>
            <p
              className="text-sm text-muted-foreground text-center pt-2"
              data-testid="compare-too-few"
            >
              Add at least one more card to compare.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-6 pb-6">
            <div className={`grid ${columnsClass} gap-4 mb-5`}>
              {cards.map((el) => (
                <CardColumn
                  key={el.id}
                  el={el}
                  flash={winnerFlash}
                  flashSelf={winnerFlash === el.id}
                  onPickWinner={() => pickWinner(el)}
                  onRemove={() => removeFromCompare(el.id)}
                />
              ))}
            </div>

            {/* Spec table — column-aligned with the cards above. */}
            <div
              className="rounded-md border border-border bg-card/60 overflow-hidden"
              data-testid="compare-spec-table"
            >
              {visibleSpecRows.map((row, idx) => (
                <div
                  key={row.key}
                  className={`grid ${columnsClass} gap-4 px-3 py-2 ${idx % 2 === 0 ? "bg-transparent" : "bg-foreground/[0.02]"}`}
                >
                  <div
                    className="col-span-full text-[10px] uppercase tracking-[0.16em] text-muted-foreground pb-1"
                    style={{ fontFamily: "var(--font-display, Inter Tight, Inter, sans-serif)" }}
                  >
                    {row.label}
                  </div>
                  {cards.map((el) => (
                    <div
                      key={`${row.key}-${el.id}`}
                      className={`text-sm leading-snug min-w-0 ${winnerFlash != null && winnerFlash !== el.id ? "opacity-50 transition-opacity" : "transition-opacity"}`}
                      data-testid={`compare-cell-${row.key}-${el.id}`}
                    >
                      {renderCell(el, row)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface CardColumnProps {
  el: CanvasElement;
  flash: number | null;
  flashSelf: boolean;
  onPickWinner: () => void;
  onRemove: () => void;
}

function CardColumn({ el, flash, flashSelf, onPickWinner, onRemove }: CardColumnProps) {
  const c = (el.content || {}) as any;
  const isFaded = flash != null && !flashSelf;
  const status = (c.status as string) || (isRoomable(el) ? "idea" : null);
  return (
    <div
      className={`relative flex flex-col rounded-md border border-border bg-card overflow-hidden ${isFaded ? "opacity-50 transition-opacity" : "transition-opacity"}`}
      data-testid={`compare-col-${el.id}`}
    >
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 z-10 h-7 w-7 inline-flex items-center justify-center rounded-full bg-card/90 border border-border text-muted-foreground hover:text-foreground hover:bg-card"
        aria-label="Remove from compare"
        data-testid={`compare-remove-${el.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {thumbForCard(el)}
      <div className="p-3 flex flex-col gap-1">
        <div
          className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {typeLabel(el)}
        </div>
        <div className="text-sm font-semibold leading-snug line-clamp-2">
          {nameLabel(el)}
        </div>
        {brandLabel(el) && (
          <div className="text-[11px] text-muted-foreground truncate">{brandLabel(el)}</div>
        )}
      </div>
      <div className="px-3 pb-3 mt-auto">
        <Button
          size="sm"
          onClick={onPickWinner}
          className="w-full h-11 gap-1.5 bg-[#2f4a3a] text-white hover:bg-[#264033]"
          data-testid={`compare-pick-${el.id}`}
        >
          {flashSelf ? <Check className="h-4 w-4" /> : <Pin className="h-3.5 w-3.5" />}
          <span>{flashSelf ? "Picked" : status === "selected" ? "Already winner" : "Pick winner"}</span>
        </Button>
      </div>
    </div>
  );
}
