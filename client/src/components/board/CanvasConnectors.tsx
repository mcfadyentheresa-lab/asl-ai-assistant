import { useMemo } from "react";
import type { CanvasElement } from "@shared/schema";

// ---- Types ----

export type ConnectorAnchor = "auto" | "top" | "right" | "bottom" | "left";
export type ConnectorStyle = "arrow" | "line" | "dotted";
export type ConnectorCurve = "straight" | "orthogonal" | "curved";

export interface ConnectorContent {
  fromId: number;
  fromAnchor?: ConnectorAnchor;
  toId: number;
  toAnchor?: ConnectorAnchor;
  style?: ConnectorStyle;
  color?: string | null;
  label?: string;
  curve?: ConnectorCurve;
}

interface Bounds {
  cx: number;
  cy: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}

function elementBounds(el: CanvasElement): Bounds {
  const w = el.width || 200;
  const h = el.height || 60;
  return {
    left: el.x,
    top: el.y,
    right: el.x + w,
    bottom: el.y + h,
    cx: el.x + w / 2,
    cy: el.y + h / 2,
    w,
    h,
  };
}

type Side = "top" | "right" | "bottom" | "left";

function pickAutoSide(from: Bounds, to: Bounds): Side {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function anchorPoint(b: Bounds, side: Side): { x: number; y: number; nx: number; ny: number } {
  switch (side) {
    case "top":    return { x: b.cx,    y: b.top,    nx: 0,  ny: -1 };
    case "right":  return { x: b.right, y: b.cy,     nx: 1,  ny: 0 };
    case "bottom": return { x: b.cx,    y: b.bottom, nx: 0,  ny: 1 };
    case "left":   return { x: b.left,  y: b.cy,     nx: -1, ny: 0 };
  }
}

export interface ResolvedConnector {
  id: number;
  content: ConnectorContent;
  fromPt: { x: number; y: number };
  toPt: { x: number; y: number };
  fromSide: Side;
  toSide: Side;
  d: string;
  midPt: { x: number; y: number };
  style: ConnectorStyle;
  curve: ConnectorCurve;
  color: string;
  label: string;
}

const DEFAULT_COLOR = "__brand__";
export const CONNECTOR_DEFAULT_COLOR = DEFAULT_COLOR;

function resolveSide(a: ConnectorAnchor | undefined, self: Bounds, other: Bounds): Side {
  if (!a || a === "auto") return pickAutoSide(self, other);
  return a;
}

function buildPath(
  from: { x: number; y: number; nx: number; ny: number },
  to: { x: number; y: number; nx: number; ny: number },
  curve: ConnectorCurve,
): { d: string; midPt: { x: number; y: number } } {
  if (curve === "straight") {
    const midPt = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    return { d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, midPt };
  }
  if (curve === "orthogonal") {
    // Elbow: leave perpendicular from each endpoint, meet halfway.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const horizFirst = Math.abs(from.nx) >= Math.abs(from.ny);
    let mid1: { x: number; y: number };
    let mid2: { x: number; y: number };
    if (horizFirst) {
      const midX = from.x + dx / 2;
      mid1 = { x: midX, y: from.y };
      mid2 = { x: midX, y: to.y };
    } else {
      const midY = from.y + dy / 2;
      mid1 = { x: from.x, y: midY };
      mid2 = { x: to.x, y: midY };
    }
    const d = `M ${from.x} ${from.y} L ${mid1.x} ${mid1.y} L ${mid2.x} ${mid2.y} L ${to.x} ${to.y}`;
    const midPt = { x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2 };
    return { d, midPt };
  }
  // Curved (default): cubic Bezier with control points offset along endpoint normals.
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const offset = Math.max(40, Math.min(160, dist * 0.4));
  const c1 = { x: from.x + from.nx * offset, y: from.y + from.ny * offset };
  const c2 = { x: to.x + to.nx * offset, y: to.y + to.ny * offset };
  const d = `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
  // Midpoint of the cubic at t=0.5
  const midPt = {
    x: 0.125 * from.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * to.x,
    y: 0.125 * from.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * to.y,
  };
  return { d, midPt };
}

export function resolveConnector(
  el: CanvasElement,
  elementsById: Record<number, CanvasElement>,
): ResolvedConnector | null {
  const c = (el.content || {}) as ConnectorContent;
  const fromEl = elementsById[c.fromId];
  const toEl = elementsById[c.toId];
  if (!fromEl || !toEl || fromEl.id === toEl.id) return null;
  const fromB = elementBounds(fromEl);
  const toB = elementBounds(toEl);
  const fromSide = resolveSide(c.fromAnchor, fromB, toB);
  const toSide = resolveSide(c.toAnchor, toB, fromB);
  const fromPt = anchorPoint(fromB, fromSide);
  const toPt = anchorPoint(toB, toSide);
  const curve: ConnectorCurve = c.curve || "curved";
  const style: ConnectorStyle = c.style || "arrow";
  const color = c.color || DEFAULT_COLOR;
  const { d, midPt } = buildPath(fromPt, toPt, curve);
  return {
    id: el.id,
    content: c,
    fromPt: { x: fromPt.x, y: fromPt.y },
    toPt: { x: toPt.x, y: toPt.y },
    fromSide,
    toSide,
    d,
    midPt,
    style,
    curve,
    color,
    label: typeof c.label === "string" ? c.label : "",
  };
}

// Each side anchor point as {side, x, y}
export function anchorDots(el: CanvasElement): { side: Side; x: number; y: number }[] {
  const b = elementBounds(el);
  return (["top", "right", "bottom", "left"] as Side[]).map((side) => {
    const a = anchorPoint(b, side);
    return { side, x: a.x, y: a.y };
  });
}

// ---- Component ----

interface CanvasConnectorsProps {
  elements: Record<number, CanvasElement>;
  selectedConnectorId: number | null;
  zoom: number;
  /** Resolved brand color used to render default-colored arrows (e.g. "hsl(152 22% 24%)"). */
  defaultColorHex: string;
  /** Fired on connector click (hit on its widened invisible stroke). */
  onConnectorClick?: (id: number, evt: React.MouseEvent) => void;
  /** Fired on endpoint handle pointer down (start of re-targeting drag). */
  onEndpointPointerDown?: (id: number, endpoint: "from" | "to", evt: React.PointerEvent) => void;
}

/**
 * Single SVG overlay rendering all connector elements above element DOM but
 * below the toolbar. Geometry is memoized over the elements map; live
 * re-routing happens for free as elements are dragged.
 */
export default function CanvasConnectors({
  elements,
  selectedConnectorId,
  zoom,
  defaultColorHex,
  onConnectorClick,
  onEndpointPointerDown,
}: CanvasConnectorsProps) {
  const resolved = useMemo<ResolvedConnector[]>(() => {
    const out: ResolvedConnector[] = [];
    for (const el of Object.values(elements)) {
      if (el.type !== "connector") continue;
      const r = resolveConnector(el, elements);
      if (r) out.push(r);
    }
    return out;
  }, [elements]);

  // Marker arrowheads — one per distinct color so colored arrows stay coloured.
  const usedColors = useMemo(() => {
    const set = new Set<string>();
    for (const r of resolved) {
      if (r.style === "arrow") set.add(r.color);
    }
    return Array.from(set);
  }, [resolved]);

  // Scale arrowhead inversely with zoom so it doesn't dominate at low zoom.
  // markerUnits='userSpaceOnUse' keeps marker size constant relative to board coords.
  const arrowSize = 12 / Math.max(0.4, Math.min(2.5, zoom));

  const colorToMarkerId = (color: string) => {
    // Stable, DOM-safe id from the color string.
    const safe = color.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32);
    return `arrow-${safe}`;
  };

  return (
    <svg
      className="absolute"
      style={{ left: 0, top: 0, width: 99999, height: 99999, overflow: "visible", zIndex: 99995, pointerEvents: "none" }}
      data-testid="canvas-connectors-svg"
    >
      <defs>
        {usedColors.map((color) => {
          const fill = color === DEFAULT_COLOR ? defaultColorHex : color;
          return (
            <marker
              key={colorToMarkerId(color)}
              id={colorToMarkerId(color)}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={arrowSize}
              markerHeight={arrowSize}
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
            </marker>
          );
        })}
      </defs>
      {resolved.map((r) => {
        const isSelected = selectedConnectorId === r.id;
        const strokeColor = r.color === DEFAULT_COLOR ? defaultColorHex : r.color;
        const strokeWidth = isSelected ? 2.5 : 1.75;
        const dashArray = r.style === "dotted" ? "4 5" : undefined;
        const markerEnd = r.style === "arrow" ? `url(#${colorToMarkerId(r.color)})` : undefined;
        return (
          <g key={`connector-${r.id}`} data-testid={`connector-${r.id}`}>
            {/* Wide invisible hit stroke for clickable area */}
            <path
              d={r.d}
              stroke="transparent"
              strokeWidth={24}
              fill="none"
              style={{ cursor: "pointer", pointerEvents: "stroke" }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onConnectorClick?.(r.id, e); }}
              data-testid={`connector-hit-${r.id}`}
            />
            {/* Visible stroke */}
            <path
              d={r.d}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashArray}
              markerEnd={markerEnd}
              style={{ pointerEvents: "none" }}
            />
            {r.label && (
              <ConnectorLabel x={r.midPt.x} y={r.midPt.y} text={r.label} />
            )}
            {isSelected && (
              <>
                <circle
                  cx={r.fromPt.x}
                  cy={r.fromPt.y}
                  r={7}
                  fill="#fff"
                  stroke={strokeColor}
                  strokeWidth={2}
                  style={{ cursor: "grab", pointerEvents: "all" }}
                  onPointerDown={(e) => { e.stopPropagation(); onEndpointPointerDown?.(r.id, "from", e); }}
                  data-testid={`connector-handle-from-${r.id}`}
                />
                <circle
                  cx={r.toPt.x}
                  cy={r.toPt.y}
                  r={7}
                  fill="#fff"
                  stroke={strokeColor}
                  strokeWidth={2}
                  style={{ cursor: "grab", pointerEvents: "all" }}
                  onPointerDown={(e) => { e.stopPropagation(); onEndpointPointerDown?.(r.id, "to", e); }}
                  data-testid={`connector-handle-to-${r.id}`}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ConnectorLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const padX = 6;
  const padY = 3;
  // Approximate width — rendered text is mono uppercase, ~6.5px per glyph at 10px size.
  const w = Math.max(18, text.length * 6.6 + padX * 2);
  const h = 16;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={4}
        ry={4}
        fill="hsl(var(--background))"
        stroke="hsl(var(--border))"
        strokeWidth={1}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fill: "hsl(var(--foreground))",
        }}
      >
        {text.toUpperCase()}
      </text>
    </g>
  );
}
