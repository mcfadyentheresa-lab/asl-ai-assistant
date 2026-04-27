// Palette extraction — fetch image, k-means cluster pixels in Lab space,
// snap each centroid to the nearest paint color from the seeded catalogue.
//
// Pipeline:
//   1. Fetch image (size + timeout caps).
//   2. Decode + downsample with jimp (~200×200).
//   3. Convert pixels to CIE Lab (perceptual clustering).
//   4. k-means (k=3..8), with kmeans++ init.
//   5. Filter near-black/white centroids that hold <2% of pixels (likely shadow/highlight noise).
//   6. For each surviving centroid, snap to nearest paint color by Delta E 2000.
//
// The extraction returns both the raw centroid hex and the snapped paint
// metadata so the client can show "extracted → matched" pairs.
import { Jimp } from "jimp";
import type { PaintColor } from "@shared/schema";

export type ExtractedColor = {
  hex: string;
  weight: number;
  match: {
    brand: string;
    name: string;
    code: string;
    hex: string;
    lrv?: number;
    colorFamily?: string;
    deltaE: number;
  } | null;
};

const MAX_BYTES = 6 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const SAMPLE_SIDE = 200;
const KMEANS_ITER = 12;
const NULL_MATCH_THRESHOLD = 25;

function hexFromRgb(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return ("#" + h(r) + h(g) + h(b)).toUpperCase();
}

function rgbFromHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

// sRGB → linear → XYZ (D65) → Lab.
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const linear = (c: number) => {
    const cs = c / 255;
    return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  const rl = linear(r), gl = linear(g), bl = linear(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.00000;
  const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Delta E 2000 — the standard perceptual color-difference metric.
// Compact implementation (~30 lines) sufficient for snapping centroids.
function deltaE2000(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI; const h1pn = h1p < 0 ? h1p + 360 : h1p;
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI; const h2pn = h2p < 0 ? h2p + 360 : h2p;
  let dhp = h2pn - h1pn;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  let avgHp = (h1pn + h2pn) / 2;
  if (Math.abs(h1pn - h2pn) > 180) avgHp += 180;
  if (avgHp >= 360) avgHp -= 360;
  const T =
    1 - 0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180)
      + 0.24 * Math.cos((2 * avgHp * Math.PI) / 180)
      + 0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180)
      - 0.20 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);
  const SL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const RT = -RC * Math.sin((2 * dTheta * Math.PI) / 180);
  return Math.sqrt(
    Math.pow(dLp / SL, 2)
      + Math.pow(dCp / SC, 2)
      + Math.pow(dHp / SH, 2)
      + RT * (dCp / SC) * (dHp / SH)
  );
}

async function fetchImageBuffer(imageUrl: string, originBaseUrl?: string): Promise<Buffer> {
  let url = imageUrl;
  if (url.startsWith("/") && originBaseUrl) {
    url = originBaseUrl.replace(/\/$/, "") + url;
  }
  if (url.startsWith("/")) {
    // Local file path under uploads dir — read off disk.
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadDir = process.env.UPLOAD_DIR || "uploads";
    const rel = url.replace(/^\/+uploads\/?/, "");
    const safe = path.normalize(rel).replace(/^\/+/, "");
    if (safe.includes("..")) throw new Error("Invalid path");
    const buf = await fs.readFile(path.join(uploadDir, safe));
    if (buf.byteLength > MAX_BYTES) throw new Error("Image too large");
    return buf;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
    const ct = r.headers.get("content-type") || "";
    if (ct && !/^image\//i.test(ct)) throw new Error("Not an image");
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > MAX_BYTES) throw new Error("Image too large");
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) throw new Error("Image too large");
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
}

type Sample = { L: number; a: number; b: number; r: number; g: number; bl: number };

async function decodeAndSample(buf: Buffer): Promise<Sample[]> {
  const img = await Jimp.fromBuffer(buf);
  const w = img.bitmap.width, h = img.bitmap.height;
  const longest = Math.max(w, h);
  if (longest > SAMPLE_SIDE) {
    const scale = SAMPLE_SIDE / longest;
    img.resize({ w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) });
  }
  const data = img.bitmap.data; // RGBA
  const samples: Sample[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const [L, A, B] = rgbToLab(r, g, bl);
    samples.push({ L, a: A, b: B, r, g, bl });
  }
  return samples;
}

function kmeans(samples: Sample[], k: number): { centers: Sample[]; assignments: Uint16Array } {
  const n = samples.length;
  const centers: Sample[] = [];

  // kmeans++ seeding
  centers.push({ ...samples[Math.floor(Math.random() * n)] });
  while (centers.length < k) {
    const dists = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const c of centers) {
        const d = (samples[i].L - c.L) ** 2 + (samples[i].a - c.a) ** 2 + (samples[i].b - c.b) ** 2;
        if (d < best) best = d;
      }
      dists[i] = best;
      total += best;
    }
    if (total === 0) {
      centers.push({ ...samples[Math.floor(Math.random() * n)] });
      continue;
    }
    let target = Math.random() * total;
    let pickIdx = 0;
    for (let i = 0; i < n; i++) {
      target -= dists[i];
      if (target <= 0) { pickIdx = i; break; }
    }
    centers.push({ ...samples[pickIdx] });
  }

  const assignments = new Uint16Array(n);
  for (let iter = 0; iter < KMEANS_ITER; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (samples[i].L - centers[c].L) ** 2 + (samples[i].a - centers[c].a) ** 2 + (samples[i].b - centers[c].b) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; moved++; }
    }
    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, r: 0, g: 0, bl: 0, n: 0 }));
    for (let i = 0; i < n; i++) {
      const s = sums[assignments[i]];
      s.L += samples[i].L; s.a += samples[i].a; s.b += samples[i].b;
      s.r += samples[i].r; s.g += samples[i].g; s.bl += samples[i].bl;
      s.n += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s.n === 0) continue;
      centers[c] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n, r: s.r / s.n, g: s.g / s.n, bl: s.bl / s.n };
    }
    if (moved === 0) break;
  }

  return { centers, assignments };
}

export async function extractPalette(opts: {
  imageUrl: string;
  k: number;
  paintColors: PaintColor[];
  originBaseUrl?: string;
}): Promise<ExtractedColor[]> {
  const k = Math.max(3, Math.min(8, Math.round(opts.k)));
  const buf = await fetchImageBuffer(opts.imageUrl, opts.originBaseUrl);
  const samples = await decodeAndSample(buf);
  if (samples.length < k * 4) {
    throw new Error("Image too small or unreadable");
  }

  const { centers, assignments } = kmeans(samples, k);

  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < assignments.length; i++) counts[assignments[i]]++;
  const total = samples.length;

  // Filter near-black/near-white clusters that account for very little weight,
  // and any empty cluster (k-means may converge to fewer than k distinct colors).
  // These are usually shadows / highlights / paper white, not real palette colors.
  const filtered: { center: Sample; weight: number }[] = [];
  for (let c = 0; c < centers.length; c++) {
    const w = counts[c] / total;
    if (w === 0) continue;
    const L = centers[c].L;
    const isExtreme = L < 12 || L > 92;
    if (isExtreme && w < 0.02) continue;
    filtered.push({ center: centers[c], weight: w });
  }
  filtered.sort((a, b) => b.weight - a.weight);

  // Pre-compute Lab for the catalogue.
  const cat: { color: PaintColor; lab: [number, number, number] }[] = [];
  for (const c of opts.paintColors) {
    const rgb = rgbFromHex(c.hex);
    if (!rgb) continue;
    cat.push({ color: c, lab: rgbToLab(rgb[0], rgb[1], rgb[2]) });
  }

  const results: ExtractedColor[] = filtered.map(({ center, weight }) => {
    let bestDist = Infinity;
    let best: { color: PaintColor; lab: [number, number, number] } | null = null;
    for (const entry of cat) {
      const d = deltaE2000(center.L, center.a, center.b, entry.lab[0], entry.lab[1], entry.lab[2]);
      if (d < bestDist) { bestDist = d; best = entry; }
    }
    const hex = hexFromRgb(center.r, center.g, center.bl);
    if (!best || bestDist > NULL_MATCH_THRESHOLD) {
      return { hex, weight, match: null };
    }
    return {
      hex,
      weight,
      match: {
        brand: best.color.brand,
        name: best.color.name,
        code: best.color.code,
        hex: best.color.hex,
        lrv: best.color.lrv ?? undefined,
        colorFamily: best.color.colorFamily,
        deltaE: Math.round(bestDist * 10) / 10,
      },
    };
  });

  return results;
}
