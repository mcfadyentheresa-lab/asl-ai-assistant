// Renders 1080x1920 PNG title/palette/material/spec cards for the Ken-Burns
// reel using sharp + SVG. v1 uses default sans-serif on the server side; an
// Inter polish pass is a follow-up.
import sharp from "sharp";
import path from "path";
import fs from "fs";

const SPRUCE = "#2f4a3a";
const PAPER = "#f3efe8";
const WIDTH = 1080;
const HEIGHT = 1920;

function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function svgToPng(svg: string, outPath: string): Promise<void> {
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);
}

export async function renderTitleCard(opts: {
  outPath: string;
  projectName: string;
  roomName: string;
}): Promise<void> {
  const { outPath, projectName, roomName } = opts;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <rect x="120" y="900" width="120" height="6" fill="${SPRUCE}"/>
  <text x="120" y="1000" font-family="serif" font-size="72" font-weight="700" fill="${SPRUCE}">${escapeXml(roomName)}</text>
  <text x="120" y="1080" font-family="sans-serif" font-size="36" fill="${SPRUCE}" opacity="0.85">${escapeXml(projectName)}</text>
  <text x="120" y="1820" font-family="sans-serif" font-size="22" letter-spacing="6" fill="${SPRUCE}" opacity="0.65">ASTER &amp; SPRUCE LIVING</text>
</svg>`;
  await svgToPng(svg, outPath);
}

export async function renderPaletteCard(opts: {
  outPath: string;
  swatches: Array<{ name?: string; hex?: string; brand?: string; code?: string }>;
}): Promise<void> {
  const { outPath, swatches } = opts;
  const top = swatches.slice(0, 5);
  const rowH = 220;
  const baseY = 600;
  const rows = top
    .map((s, i) => {
      const y = baseY + i * rowH;
      const hex = (s.hex || "#cccccc").trim();
      const safeHex = /^#[0-9a-fA-F]{3,6}$/.test(hex) ? hex : "#cccccc";
      const label = [s.name, s.brand, s.code].filter(Boolean).join(" · ");
      return `
        <rect x="120" y="${y}" width="220" height="180" fill="${safeHex}" stroke="${SPRUCE}" stroke-width="2"/>
        <text x="380" y="${y + 70}" font-family="serif" font-size="38" fill="${SPRUCE}" font-weight="600">${escapeXml(s.name || "Untitled")}</text>
        <text x="380" y="${y + 120}" font-family="sans-serif" font-size="26" fill="${SPRUCE}" opacity="0.8">${escapeXml(label)}</text>
      `;
    })
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <text x="120" y="380" font-family="serif" font-size="64" font-weight="700" fill="${SPRUCE}">Palette</text>
  <rect x="120" y="420" width="80" height="4" fill="${SPRUCE}"/>
  ${rows}
</svg>`;
  await svgToPng(svg, outPath);
}

export async function renderMaterialCard(opts: {
  outPath: string;
  materials: Array<{ name?: string; supplier?: string; category?: string; code?: string }>;
}): Promise<void> {
  const { outPath, materials } = opts;
  const top = materials.slice(0, 5);
  const baseY = 600;
  const rowH = 200;
  const rows = top
    .map((m, i) => {
      const y = baseY + i * rowH;
      const sub = [m.category, m.supplier, m.code].filter(Boolean).join(" · ");
      return `
        <text x="120" y="${y + 60}" font-family="serif" font-size="42" fill="${SPRUCE}" font-weight="600">${escapeXml(m.name || "Untitled material")}</text>
        <text x="120" y="${y + 110}" font-family="sans-serif" font-size="28" fill="${SPRUCE}" opacity="0.8">${escapeXml(sub)}</text>
        <rect x="120" y="${y + 140}" width="${WIDTH - 240}" height="2" fill="${SPRUCE}" opacity="0.25"/>
      `;
    })
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <text x="120" y="380" font-family="serif" font-size="64" font-weight="700" fill="${SPRUCE}">Materials</text>
  <rect x="120" y="420" width="80" height="4" fill="${SPRUCE}"/>
  ${rows}
</svg>`;
  await svgToPng(svg, outPath);
}

export async function renderSpecCard(opts: {
  outPath: string;
  projectName: string;
  roomName: string;
  counts: { palette: number; materials: number; hardware: number; products: number; images: number };
}): Promise<void> {
  const { outPath, projectName, roomName, counts } = opts;
  const lines = [
    `Project · ${projectName}`,
    `Room · ${roomName}`,
    `Palette · ${counts.palette}`,
    `Materials · ${counts.materials}`,
    `Hardware · ${counts.hardware}`,
    `Products · ${counts.products}`,
    `Images · ${counts.images}`,
  ];
  const rows = lines
    .map((l, i) => `<text x="120" y="${720 + i * 90}" font-family="sans-serif" font-size="38" fill="${SPRUCE}">${escapeXml(l)}</text>`)
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <text x="120" y="600" font-family="serif" font-size="64" font-weight="700" fill="${SPRUCE}">Spec sheet</text>
  <rect x="120" y="640" width="80" height="4" fill="${SPRUCE}"/>
  ${rows}
  <text x="120" y="1820" font-family="sans-serif" font-size="22" letter-spacing="6" fill="${SPRUCE}" opacity="0.65">ASTER &amp; SPRUCE LIVING</text>
</svg>`;
  await svgToPng(svg, outPath);
}

// Normalise an arbitrary input image (web URL or /uploads path) into a 1080x1920
// JPEG suitable for ffmpeg's zoompan. Returns the path of the prepared frame.
export async function prepareImageFrame(opts: {
  inputPath: string;
  outPath: string;
}): Promise<void> {
  const { inputPath, outPath } = opts;
  await sharp(inputPath)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toFile(outPath);
}

// Best-effort resolve a /uploads/... or http(s) URL into a local file path that
// sharp can read. http(s) URLs are downloaded to a tmp file. Returns null on
// any failure so callers can skip the shot.
export async function resolveImageToLocal(url: string, tmpDir: string, suffix: string): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/uploads/")) {
      const uploadDir = process.env.UPLOAD_DIR
        ? path.resolve(process.env.UPLOAD_DIR)
        : path.join(process.cwd(), "uploads");
      const filename = url.slice("/uploads/".length);
      const localPath = path.join(uploadDir, filename);
      if (!fs.existsSync(localPath)) return null;
      return localPath;
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const out = path.join(tmpDir, `dl-${suffix}.bin`);
      await fs.promises.writeFile(out, buf);
      return out;
    }
    return null;
  } catch {
    return null;
  }
}
