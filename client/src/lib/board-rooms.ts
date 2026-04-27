// Helpers for the "rooms as the spine" experience.
// Derives rooms from canvas state, computes per-room budget rollups, and
// resolves the room a card belongs to (explicit `room` field wins; otherwise
// containment in a `room_zone`).

import type { CanvasElement } from "@shared/schema";

export type RoomStatus = "idea" | "shortlist" | "selected" | "ordered";
export const ROOM_STATUSES: RoomStatus[] = ["idea", "shortlist", "selected", "ordered"];
export const STATUS_CYCLE: RoomStatus[] = ["idea", "shortlist", "selected", "ordered"];

// Status-tinted left edge — 3px stripe on hardware/surface/product cards so
// "selection vs exploration" reads at a glance without opening anything.
export const STATUS_EDGE_COLOR: Record<RoomStatus, string> = {
  idea: "#a8a29e",        // warm gray
  shortlist: "#7a9bb5",   // soft blue
  selected: "#2f4a3a",    // spruce
  ordered: "#2f4a3a",     // spruce, with checkmark badge in card corner
};

export function nextStatus(s: RoomStatus | undefined): RoomStatus {
  const cur = (s as RoomStatus) || "idea";
  const idx = STATUS_CYCLE.indexOf(cur);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// Cards that participate in rooms + status + budget.
export function isRoomable(el: CanvasElement): boolean {
  return el.type === "hardware" || el.type === "surface" || el.type === "product";
}

// Read the explicit `room` field on a card (hardware/surface/product); empty when missing.
export function explicitRoom(el: CanvasElement): string | undefined {
  if (!isRoomable(el)) return undefined;
  const c = (el.content as any) || {};
  const room = typeof c.room === "string" ? c.room.trim() : "";
  return room || undefined;
}

// Read the room name for a `room_zone` element.
export function roomZoneName(el: CanvasElement): string | undefined {
  if (el.type !== "room_zone") return undefined;
  const t = (el.content as any)?.title;
  if (typeof t !== "string") return undefined;
  const trimmed = t.trim();
  return trimmed || undefined;
}

// Find the room name for an element by checking the explicit field first,
// then falling back to containment inside a `room_zone`'s bounds.
export function resolveRoomFor(el: CanvasElement, allElements: CanvasElement[]): string | undefined {
  const direct = explicitRoom(el);
  if (direct) return direct;
  if (el.type === "room_zone") return roomZoneName(el);
  for (const z of allElements) {
    if (z.type !== "room_zone") continue;
    const name = roomZoneName(z);
    if (!name) continue;
    const w = z.width || 500;
    const h = z.height || 400;
    if (el.x >= z.x && el.y >= z.y && el.x < z.x + w && el.y < z.y + h) return name;
  }
  return undefined;
}

// Union of all room names referenced anywhere on the board.
export function deriveRooms(elements: CanvasElement[]): string[] {
  const seen = new Set<string>();
  for (const el of elements) {
    const name = roomZoneName(el) ?? explicitRoom(el);
    if (name) seen.add(name);
  }
  return Array.from(seen);
}

// Apply a saved order on top of derived names. Names not in `savedOrder`
// keep their natural order at the end; saved names that no longer exist drop.
export function orderRooms(rooms: string[], savedOrder: string[] | undefined): string[] {
  if (!savedOrder || savedOrder.length === 0) return rooms;
  const set = new Set(rooms);
  const ordered: string[] = [];
  for (const n of savedOrder) {
    if (set.has(n)) {
      ordered.push(n);
      set.delete(n);
    }
  }
  for (const n of rooms) {
    if (set.has(n)) ordered.push(n);
  }
  return ordered;
}

// Currency-aware price reader. Hardware uses numeric `price`; product uses
// free-form `price` strings ("$249", "249.00 CAD"). For v1 we sum CAD only and
// flag mixed currencies; non-CAD entries return null so the caller can warn.
export function readCadPrice(el: CanvasElement): { amount: number | null; currency: string } {
  const c = (el.content as any) || {};
  const currency = (typeof c.currency === "string" && c.currency.trim()) || "CAD";
  const raw = c.price;
  if (raw == null || raw === "") return { amount: null, currency };
  if (typeof raw === "number") return { amount: Number.isFinite(raw) ? raw : null, currency };
  // String: strip currency markers, accept the first numeric chunk.
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return { amount: null, currency };
  const n = Number(cleaned);
  return { amount: Number.isFinite(n) ? n : null, currency };
}

export interface RoomBudget {
  selected: number;
  ordered: number;
  total: number;
  hasMixedCurrency: boolean;
}

export function computeRoomBudget(
  elements: CanvasElement[],
  roomName: string | null,
): RoomBudget {
  let selected = 0;
  let ordered = 0;
  let mixed = false;
  for (const el of elements) {
    if (!isRoomable(el)) continue;
    const status = ((el.content as any)?.status as RoomStatus | undefined) || "idea";
    if (status !== "selected" && status !== "ordered") continue;
    const elRoom = resolveRoomFor(el, elements);
    if (roomName != null && elRoom !== roomName) continue;
    const { amount, currency } = readCadPrice(el);
    if (amount == null) continue;
    if (currency.toUpperCase() !== "CAD") {
      mixed = true;
      continue;
    }
    if (status === "selected") selected += amount;
    else ordered += amount;
  }
  return { selected, ordered, total: selected + ordered, hasMixedCurrency: mixed };
}

const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function formatCad(n: number): string {
  return cadFormatter.format(n);
}

// Count how many cards on the board (or in a specific room) carry each status.
// Used to label the status filter pills with counts.
export function countByStatus(
  elements: CanvasElement[],
  roomName: string | null,
): Record<RoomStatus, number> {
  const out: Record<RoomStatus, number> = { idea: 0, shortlist: 0, selected: 0, ordered: 0 };
  for (const el of elements) {
    if (!isRoomable(el)) continue;
    if (roomName != null) {
      const elRoom = resolveRoomFor(el, elements);
      if (elRoom !== roomName) continue;
    }
    const s = ((el.content as any)?.status as RoomStatus | undefined) || "idea";
    out[s] = (out[s] || 0) + 1;
  }
  return out;
}
