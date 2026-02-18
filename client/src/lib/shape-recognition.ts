type Point = { x: number; y: number };

interface RecognizedShape {
  type: "circle" | "rectangle" | "line" | "triangle" | "arrow";
  points: Point[];
  color: string;
  strokeWidth: number;
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function centroid(pts: Point[]): Point {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

function boundingBox(pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += distance(pts[i - 1], pts[i]);
  }
  return len;
}

function isClosedShape(pts: Point[], threshold = 0.15): boolean {
  if (pts.length < 5) return false;
  const len = pathLength(pts);
  const endDist = distance(pts[0], pts[pts.length - 1]);
  return endDist / len < threshold;
}

function tryCircle(pts: Point[]): RecognizedShape | null {
  if (!isClosedShape(pts)) return null;
  if (pts.length < 8) return null;

  const c = centroid(pts);
  const distances = pts.map((p) => distance(p, c));
  const avgR = distances.reduce((s, d) => s + d, 0) / distances.length;
  if (avgR < 10) return null;

  const variance = distances.reduce((s, d) => s + (d - avgR) ** 2, 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / avgR;

  if (cv < 0.15) {
    const n = 36;
    const circlePoints: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const angle = (2 * Math.PI * i) / n;
      circlePoints.push({
        x: c.x + avgR * Math.cos(angle),
        y: c.y + avgR * Math.sin(angle),
      });
    }
    return { type: "circle", points: circlePoints, color: "", strokeWidth: 0 };
  }
  return null;
}

function tryRectangle(pts: Point[]): RecognizedShape | null {
  if (!isClosedShape(pts)) return null;
  if (pts.length < 8) return null;

  const bb = boundingBox(pts);
  if (bb.width < 15 || bb.height < 15) return null;

  const totalLen = pathLength(pts);
  const perimeterBB = 2 * (bb.width + bb.height);
  const lenRatio = totalLen / perimeterBB;

  if (lenRatio < 0.8 || lenRatio > 1.3) return null;

  let insideCount = 0;
  for (const p of pts) {
    const dLeft = Math.abs(p.x - bb.minX);
    const dRight = Math.abs(p.x - bb.maxX);
    const dTop = Math.abs(p.y - bb.minY);
    const dBottom = Math.abs(p.y - bb.maxY);
    const minDist = Math.min(dLeft, dRight, dTop, dBottom);
    const threshold = Math.max(bb.width, bb.height) * 0.15;
    if (minDist < threshold) insideCount++;
  }

  const edgeRatio = insideCount / pts.length;
  if (edgeRatio > 0.7) {
    const m = 4;
    return {
      type: "rectangle",
      points: [
        { x: bb.minX, y: bb.minY },
        { x: bb.maxX, y: bb.minY },
        { x: bb.maxX, y: bb.maxY },
        { x: bb.minX, y: bb.maxY },
        { x: bb.minX, y: bb.minY },
      ],
      color: "",
      strokeWidth: 0,
    };
  }
  return null;
}

function tryLine(pts: Point[]): RecognizedShape | null {
  if (pts.length < 3) return null;
  if (isClosedShape(pts, 0.1)) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const directDist = distance(first, last);
  if (directDist < 15) return null;

  const total = pathLength(pts);
  const straightness = directDist / total;

  if (straightness > 0.9) {
    return {
      type: "line",
      points: [first, last],
      color: "",
      strokeWidth: 0,
    };
  }
  return null;
}

function tryTriangle(pts: Point[]): RecognizedShape | null {
  if (!isClosedShape(pts)) return null;
  if (pts.length < 6) return null;

  const corners = findCorners(pts, 3);
  if (corners.length !== 3) return null;

  const sides = [
    distance(corners[0], corners[1]),
    distance(corners[1], corners[2]),
    distance(corners[2], corners[0]),
  ];

  const perimeter = sides[0] + sides[1] + sides[2];
  const totalLen = pathLength(pts);
  const ratio = totalLen / perimeter;

  if (ratio > 0.7 && ratio < 1.4) {
    return {
      type: "triangle",
      points: [...corners, corners[0]],
      color: "",
      strokeWidth: 0,
    };
  }
  return null;
}

function tryArrow(pts: Point[]): RecognizedShape | null {
  if (pts.length < 5) return null;
  if (isClosedShape(pts, 0.1)) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const directDist = distance(first, last);
  const total = pathLength(pts);

  if (directDist < 20) return null;

  const straightness = directDist / total;
  if (straightness > 0.6 && straightness < 0.85) {
    const midIdx = Math.floor(pts.length * 0.6);
    const mainDir = Math.atan2(last.y - first.y, last.x - first.x);
    const tipPoints = pts.slice(midIdx);
    if (tipPoints.length > 3) {
      const hasDeviation = tipPoints.some((p) => {
        const lineFromStart = Math.atan2(p.y - first.y, p.x - first.x);
        return Math.abs(lineFromStart - mainDir) > 0.3;
      });

      if (hasDeviation) {
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        const headLen = directDist * 0.2;
        const headAngle = 0.5;
        return {
          type: "arrow",
          points: [
            first,
            last,
            { x: last.x - headLen * Math.cos(angle - headAngle), y: last.y - headLen * Math.sin(angle - headAngle) },
            last,
            { x: last.x - headLen * Math.cos(angle + headAngle), y: last.y - headLen * Math.sin(angle + headAngle) },
          ],
          color: "",
          strokeWidth: 0,
        };
      }
    }
  }

  return null;
}

function findCorners(pts: Point[], targetCount: number): Point[] {
  const n = pts.length;
  if (n < targetCount * 2) return [];

  const angles: { idx: number; angle: number }[] = [];
  const windowSize = Math.max(3, Math.floor(n / 10));

  for (let i = windowSize; i < n - windowSize; i++) {
    const prev = pts[i - windowSize];
    const curr = pts[i];
    const next = pts[i + windowSize];

    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    angles.push({ idx: i, angle: diff });
  }

  angles.sort((a, b) => b.angle - a.angle);

  const minSeparation = Math.floor(n / (targetCount + 1));
  const selected: Point[] = [];
  const usedIndices: number[] = [];

  for (const a of angles) {
    if (selected.length >= targetCount) break;
    const tooClose = usedIndices.some((ui) => Math.abs(ui - a.idx) < minSeparation);
    if (!tooClose) {
      selected.push(pts[a.idx]);
      usedIndices.push(a.idx);
    }
  }

  return selected;
}

export interface DrawPath {
  points: Point[];
  color: string;
  strokeWidth: number;
}

export function recognizeShape(path: DrawPath): (DrawPath & { shapeType?: string }) | null {
  if (!path.points || path.points.length < 3) return null;

  const detectors: (() => RecognizedShape | null)[] = [
    () => tryLine(path.points),
    () => tryCircle(path.points),
    () => tryRectangle(path.points),
    () => tryTriangle(path.points),
    () => tryArrow(path.points),
  ];

  for (const detect of detectors) {
    const result = detect();
    if (result) {
      return {
        points: result.points,
        color: path.color,
        strokeWidth: path.strokeWidth,
        shapeType: result.type,
      };
    }
  }

  return null;
}

export function recognizeAllShapes(paths: DrawPath[]): DrawPath[] {
  return paths.map((path) => {
    const recognized = recognizeShape(path);
    return recognized || path;
  });
}
