// Lazy migration for legacy canvas element types.
//
// Old types collapse into two new primitives:
//   note / plain_text / callout / section_header  ->  text  (with content.variant)
//   color_swatch / material                       ->  surface (with content.kind)
//
// Migration is idempotent: re-running on already-migrated content is a no-op.
// Old type strings still load gracefully — `migrateElement` is called on every read.

import type { CanvasElement } from "@shared/schema";

export type TextVariant = "note" | "clean" | "callout" | "heading";
export type SurfaceKind = "paint" | "material";
export type SurfaceStatus = "idea" | "shortlist" | "selected" | "ordered";

type AnyContent = Record<string, any>;

export function migrateElement(el: CanvasElement): CanvasElement {
  const c: AnyContent = (el.content as AnyContent) || {};

  // Lazy-add status to product elements that predate the status spine.
  if (el.type === "product" && !c.status) {
    return { ...el, content: { ...c, status: "idea" } as any };
  }

  if (el.type === "text" || el.type === "surface") {
    return el;
  }

  if (el.type === "note") {
    if (c.variant) return el;
    const variant: TextVariant = c.plain ? "clean" : "note";
    const { plain, ...rest } = c;
    return { ...el, type: "text", content: { ...rest, variant } as any };
  }

  if (el.type === "plain_text") {
    return { ...el, type: "text", content: { ...c, variant: "clean" } as any };
  }

  if (el.type === "callout") {
    return { ...el, type: "text", content: { ...c, variant: "callout" } as any };
  }

  if (el.type === "section_header") {
    return { ...el, type: "text", content: { ...c, variant: "heading" } as any };
  }

  if (el.type === "color_swatch") {
    return { ...el, type: "surface", content: { ...c, kind: "paint" } as any };
  }

  if (el.type === "material") {
    return { ...el, type: "surface", content: { ...c, kind: "material" } as any };
  }

  return el;
}

export function migrateElements(elements: CanvasElement[]): CanvasElement[] {
  return elements.map(migrateElement);
}

// Treat post-migration elements and pre-migration legacy types as the same role.
// Lets gesture / filter sites stay readable without sprinkling variant checks.
export function isTextHeading(el: CanvasElement): boolean {
  if (el.type === "section_header") return true;
  if (el.type === "text") return ((el.content as AnyContent | null)?.variant) === "heading";
  return false;
}

export function isPaintSurface(el: CanvasElement): boolean {
  if (el.type === "color_swatch") return true;
  if (el.type === "surface") return ((el.content as AnyContent | null)?.kind) === "paint";
  return false;
}

export function isMaterialSurface(el: CanvasElement): boolean {
  if (el.type === "material") return true;
  if (el.type === "surface") return ((el.content as AnyContent | null)?.kind) === "material";
  return false;
}

export function isAnyTextElement(el: CanvasElement): boolean {
  return el.type === "text" || el.type === "note" || el.type === "plain_text" || el.type === "callout" || el.type === "section_header";
}

export function isAnySurfaceElement(el: CanvasElement): boolean {
  return el.type === "surface" || el.type === "color_swatch" || el.type === "material";
}
