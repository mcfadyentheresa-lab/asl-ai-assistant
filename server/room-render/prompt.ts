// Build a single rich prompt string for the room render job. We resolve the
// room from canvas elements, gather paint / material / hardware selections,
// pluck mood notes from inspiration captions, and stitch it all together.
import type { CanvasElement } from "@shared/schema";

export interface ResolvedRoom {
  zone: CanvasElement | undefined;
  elements: CanvasElement[];
}

const STYLE_DIRECTION =
  "Photorealistic interior architecture render in the style of an editorial home magazine. Natural light. Warm, calm, lived-in. No people. No text. Avoid 3d-render-clipart style.";

const RESTYLE_SUFFIX =
  "Keep the existing room architecture, window positions, ceiling lines, and proportions. Only change wall paint, flooring, fixtures, hardware, and furnishings to match the spec.";

export function resolveRoom(allElements: CanvasElement[], roomName: string): ResolvedRoom {
  const target = roomName.trim().toLowerCase();
  const rooms = allElements.filter((e) => e.type === "room_zone");
  const zone = rooms.find((r) => {
    const c = (r.content || {}) as any;
    const n = String(c.name || c.label || "").trim().toLowerCase();
    return n === target;
  });

  const rectsContains = (z: CanvasElement | undefined, e: CanvasElement): boolean => {
    if (!z) return false;
    const cx = e.x + (e.width || 0) / 2;
    const cy = e.y + (e.height || 0) / 2;
    return cx >= z.x && cx <= z.x + (z.width || 0) && cy >= z.y && cy <= z.y + (z.height || 0);
  };

  const picked: CanvasElement[] = [];
  const seen = new Set<number>();
  for (const e of allElements) {
    if (e.type === "room_zone") continue;
    const c = (e.content || {}) as any;
    const elementRoom = String(c.room || "").trim().toLowerCase();
    const matchByContent = elementRoom && elementRoom === target;
    const matchByZone = rectsContains(zone, e);
    if ((matchByContent || matchByZone) && !seen.has(e.id)) {
      seen.add(e.id);
      picked.push(e);
    }
  }
  return { zone, elements: picked };
}

interface Bucket {
  paints: Array<{ name: string; hex?: string; lrv?: number; brand?: string; code?: string }>;
  materials: Array<{ name: string; supplier?: string; finish?: string; notes?: string }>;
  hardware: Array<{ name: string; finish?: string; style?: string }>;
  inspirationCaptions: string[];
}

function bucket(elements: CanvasElement[]): Bucket {
  const out: Bucket = { paints: [], materials: [], hardware: [], inspirationCaptions: [] };
  for (const el of elements) {
    const c: any = el.content || {};
    if (el.type === "surface" && c.kind === "paint") {
      out.paints.push({
        name: String(c.name || "Paint"),
        hex: c.hex || c.color,
        lrv: typeof c.lrv === "number" ? c.lrv : undefined,
        brand: c.brand,
        code: c.code,
      });
    } else if (el.type === "color_swatch") {
      // Legacy color swatches treated as paint-ish.
      out.paints.push({
        name: String(c.name || "Color"),
        hex: c.hex || c.color,
      });
    } else if (el.type === "surface" && c.kind === "material") {
      out.materials.push({
        name: String(c.name || "Material"),
        supplier: c.supplier || c.brand,
        finish: c.finish || c.sheen,
        notes: c.notes,
      });
    } else if (el.type === "material") {
      out.materials.push({
        name: String(c.name || "Material"),
        supplier: c.supplier || c.brand,
        finish: c.finish,
        notes: c.notes,
      });
    } else if (el.type === "hardware") {
      out.hardware.push({
        name: String(c.name || "Hardware"),
        finish: c.finish,
        style: c.style || c.category,
      });
    } else if (el.type === "image" && (c.isInspiration || c.inspiration)) {
      const cap = String(c.caption || c.label || "").trim();
      if (cap) out.inspirationCaptions.push(cap);
    }
  }
  return out;
}

function dimsLine(zone: CanvasElement | undefined): string {
  if (!zone) return "";
  const c: any = zone.content || {};
  const wFt = Number(c.widthFt) || 0;
  const wIn = Number(c.widthIn) || 0;
  const dFt = Number(c.depthFt) || 0;
  const dIn = Number(c.depthIn) || 0;
  if (wFt + wIn + dFt + dIn === 0) return "";
  const w = wFt + wIn / 12;
  const d = dFt + dIn / 12;
  return `${w.toFixed(1)} ft x ${d.toFixed(1)} ft`;
}

export interface BuiltPrompt {
  prompt: string;
  hasInputs: boolean; // true when at least one selection or inspiration was found
}

export function buildPrompt(opts: {
  roomName: string;
  zone: CanvasElement | undefined;
  elements: CanvasElement[];
  mode: "restyle" | "imagine";
}): BuiltPrompt {
  const { roomName, zone, elements, mode } = opts;
  const b = bucket(elements);
  const lines: string[] = [];

  const dims = dimsLine(zone);
  lines.push(
    dims
      ? `Room type: ${roomName}. Approximate dimensions: ${dims}.`
      : `Room type: ${roomName}.`,
  );

  if (b.paints.length > 0) {
    const parts = b.paints.slice(0, 6).map((p) => {
      const bits = [p.name];
      if (p.brand) bits.push(`(${p.brand}${p.code ? ` ${p.code}` : ""})`);
      if (p.hex) bits.push(p.hex);
      if (typeof p.lrv === "number") bits.push(`LRV ${p.lrv}`);
      return bits.join(" ");
    });
    lines.push(`Paint colors: ${parts.join("; ")}.`);
  }

  if (b.materials.length > 0) {
    const parts = b.materials.slice(0, 8).map((m) => {
      const bits = [m.name];
      if (m.supplier) bits.push(`from ${m.supplier}`);
      if (m.finish) bits.push(`(${m.finish})`);
      if (m.notes) bits.push(`— ${m.notes}`);
      return bits.join(" ");
    });
    lines.push(`Materials: ${parts.join("; ")}.`);
  }

  if (b.hardware.length > 0) {
    const parts = b.hardware.slice(0, 8).map((h) => {
      const bits = [h.name];
      if (h.finish) bits.push(`(${h.finish})`);
      if (h.style) bits.push(`— ${h.style}`);
      return bits.join(" ");
    });
    lines.push(`Hardware: ${parts.join("; ")}.`);
  }

  if (b.inspirationCaptions.length > 0) {
    const captions = b.inspirationCaptions.slice(0, 4).join("; ");
    lines.push(`Mood/style direction (from inspiration captions): ${captions}.`);
  }

  lines.push(STYLE_DIRECTION);
  if (mode === "restyle") lines.push(RESTYLE_SUFFIX);

  const hasInputs =
    b.paints.length + b.materials.length + b.hardware.length + b.inspirationCaptions.length > 0;
  return { prompt: lines.join(" "), hasInputs };
}
