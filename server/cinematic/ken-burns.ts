// Ken-Burns assembly. Builds a 1080x1920 reel by stitching together short
// zoompan segments with crossfades, then writes a thumbnail from the first
// second of the result. Each segment failure is logged and skipped rather
// than aborting the whole render.
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { storage } from "../storage";
import {
  prepareImageFrame,
  renderMaterialCard,
  renderPaletteCard,
  renderSpecCard,
  renderTitleCard,
  resolveImageToLocal,
} from "./cards";

const TARGET_W = 1080;
const TARGET_H = 1920;
const FPS = 30;
const RENDER_TIMEOUT_MS = 90_000;

type ShotKind = "card" | "image";

interface Shot {
  kind: ShotKind;
  path: string; // local file path
  durationSec: number;
  zoomDirection: "in" | "out" | "panLeft" | "panRight";
}

function uploadDir(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");
}

function ensureUploadDir(): void {
  const dir = uploadDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pickRoomElements(allElements: any[], roomName: string): any[] {
  const target = roomName.trim().toLowerCase();
  if (!target) return [];

  const rooms = allElements.filter((e) => e.type === "room_zone");
  const matchingZones = rooms.filter((r) => {
    const c = (r.content || {}) as any;
    const n = String(c.name || c.label || "").trim().toLowerCase();
    return n === target;
  });

  const rectsContains = (zone: any, e: any): boolean => {
    if (!zone) return false;
    const cx = e.x + (e.width || 0) / 2;
    const cy = e.y + (e.height || 0) / 2;
    return cx >= zone.x && cx <= zone.x + (zone.width || 0) && cy >= zone.y && cy <= zone.y + (zone.height || 0);
  };

  const pickedIds = new Set<number>();
  const picked: any[] = [];
  for (const e of allElements) {
    if (e.type === "room_zone") continue;
    const c = (e.content || {}) as any;
    const elementRoom = String(c.room || "").trim().toLowerCase();
    const matchByContent = elementRoom && elementRoom === target;
    const matchByZone = matchingZones.some((z) => rectsContains(z, e));
    if (matchByContent || matchByZone) {
      if (!pickedIds.has(e.id)) {
        pickedIds.add(e.id);
        picked.push(e);
      }
    }
  }
  return picked;
}

function categorize(elements: any[]) {
  const colorSwatches = elements.filter((e) =>
    e.type === "color_swatch" || (e.type === "surface" && (e.content as any)?.kind === "paint"),
  );
  const hardware = elements.filter((e) => e.type === "hardware");
  const materials = elements.filter((e) =>
    e.type === "material" || (e.type === "surface" && (e.content as any)?.kind === "material"),
  );
  const products = elements.filter((e) => e.type === "product");
  const images = elements.filter((e) => e.type === "image");
  return { colorSwatches, hardware, materials, products, images };
}

// Build a zoompan-based clip for a single still frame. Returns the clip path.
async function renderSegment(opts: {
  sourcePath: string; // a 1080x1920 still
  outPath: string;
  durationSec: number;
  zoomDirection: Shot["zoomDirection"];
  timeoutMs: number;
}): Promise<void> {
  const { sourcePath, outPath, durationSec, zoomDirection, timeoutMs } = opts;
  const totalFrames = Math.max(2, Math.round(durationSec * FPS));

  // zoompan needs an input larger than output to allow movement; we re-scale
  // the still up first so zoompan has headroom. Output stays at 1080x1920.
  const scaleW = TARGET_W * 2;
  const scaleH = TARGET_H * 2;

  let zoomExpr: string;
  let xExpr: string;
  let yExpr: string;
  switch (zoomDirection) {
    case "in":
      zoomExpr = "min(zoom+0.0015,1.4)";
      xExpr = "iw/2-(iw/zoom/2)";
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "out":
      zoomExpr = "if(eq(on,1),1.4,max(zoom-0.0015,1.0))";
      xExpr = "iw/2-(iw/zoom/2)";
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "panLeft":
      zoomExpr = "1.2";
      xExpr = `(iw-iw/zoom)*(1-on/${totalFrames})`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "panRight":
    default:
      zoomExpr = "1.2";
      xExpr = `(iw-iw/zoom)*(on/${totalFrames})`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
  }

  const filter = [
    `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase`,
    `crop=${scaleW}:${scaleH}`,
    `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${TARGET_W}x${TARGET_H}:fps=${FPS}`,
    `format=yuv420p`,
  ].join(",");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cmd = ffmpeg(sourcePath)
      .inputOptions(["-loop", "1"])
      .outputOptions([
        "-t", String(durationSec),
        "-r", String(FPS),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "stillimage",
        "-pix_fmt", "yuv420p",
      ])
      .videoFilters(filter)
      .on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      })
      .save(outPath);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { cmd.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`segment timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

// Concat segments with 1s crossfades into a single 1080x1920 mp4 with a
// silent AAC track. Uses xfade for video and amix-of-anullsrc for audio.
async function concatWithCrossfades(opts: {
  segmentPaths: string[];
  outPath: string;
  timeoutMs: number;
}): Promise<{ durationSec: number }> {
  const { segmentPaths, outPath, timeoutMs } = opts;
  if (segmentPaths.length === 0) throw new Error("no segments to concat");

  // Probe each segment for duration so xfade offsets line up.
  const durations: number[] = [];
  for (const p of segmentPaths) {
    const d = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(p, (err: any, data: any) => {
        if (err) return reject(err);
        const dur = Number(data?.format?.duration || 0);
        resolve(dur > 0 ? dur : 1);
      });
    });
    durations.push(d);
  }

  const xfadeDur = 1; // 1s crossfade

  let cmd = ffmpeg();
  for (const p of segmentPaths) cmd = cmd.input(p);

  // Build xfade chain: [0:v][1:v]xfade=offset=d0-1[v01]; [v01][2:v]xfade=offset=d0+d1-2[v02]; ...
  const filterParts: string[] = [];
  let lastLabel = `[0:v]`;
  let cumulativeOffset = 0;
  for (let i = 1; i < segmentPaths.length; i++) {
    cumulativeOffset += durations[i - 1] - xfadeDur;
    const outLabel = i === segmentPaths.length - 1 ? `[vout]` : `[v${i}]`;
    const offset = Math.max(0, cumulativeOffset);
    filterParts.push(`${lastLabel}[${i}:v]xfade=transition=fade:duration=${xfadeDur}:offset=${offset.toFixed(3)}${outLabel}`);
    lastLabel = outLabel;
  }
  if (segmentPaths.length === 1) {
    // Single segment fallback — just label it.
    filterParts.push(`[0:v]copy[vout]`);
  }

  // Total duration after crossfades
  const totalDur = durations.reduce((a, b) => a + b, 0) - (segmentPaths.length - 1) * xfadeDur;

  const filterComplex = filterParts.join(";");

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const c = cmd
      .complexFilter(filterComplex, ["vout"])
      .addInput("anullsrc=channel_layout=stereo:sample_rate=44100")
      .inputOptions(["-f", "lavfi", "-t", String(totalDur.toFixed(3))])
      .outputOptions([
        "-map", "[vout]",
        "-map", `${segmentPaths.length}:a`,
        "-shortest",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
      ])
      .on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      })
      .save(outPath);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { c.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`concat timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return { durationSec: totalDur };
}

async function makeThumbnail(videoPath: string, outPath: string, timeoutMs = 10_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const c = ffmpeg(videoPath)
      .inputOptions(["-ss", "1"])
      .outputOptions(["-frames:v", "1", "-q:v", "3"])
      .on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      })
      .save(outPath);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      try { c.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`thumbnail timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export interface KenBurnsAssemblyResult {
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
}

export async function assembleKenBurnsForRoom(opts: {
  jobId: number;
  projectId: number;
  boardId: number;
  roomName: string;
}): Promise<KenBurnsAssemblyResult> {
  const { jobId, projectId, boardId, roomName } = opts;
  ensureUploadDir();

  const project = await storage.getProject(projectId);
  const projectName = project?.name || "Project";
  const allElements = await storage.getCanvasElements(boardId);
  const roomElements = pickRoomElements(allElements, roomName);
  const cats = categorize(roomElements);

  const tmpRoot = path.join(uploadDir(), `cinematic-tmp-${jobId}-${randomUUID()}`);
  fs.mkdirSync(tmpRoot, { recursive: true });

  const cleanup = () => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* noop */ }
  };

  try {
    // Render the four cards
    const titleStill = path.join(tmpRoot, "title.png");
    const paletteStill = path.join(tmpRoot, "palette.png");
    const materialStill = path.join(tmpRoot, "material.png");
    const specStill = path.join(tmpRoot, "spec.png");

    await renderTitleCard({ outPath: titleStill, projectName, roomName });
    await renderPaletteCard({
      outPath: paletteStill,
      swatches: cats.colorSwatches.map((s: any) => (s.content || {}) as any),
    });
    await renderMaterialCard({
      outPath: materialStill,
      materials: cats.materials.map((m: any) => (m.content || {}) as any),
    });
    await renderSpecCard({
      outPath: specStill,
      projectName,
      roomName,
      counts: {
        palette: cats.colorSwatches.length,
        materials: cats.materials.length,
        hardware: cats.hardware.length,
        products: cats.products.length,
        images: cats.images.length,
      },
    });

    // Build shot list. Shot durations come from the spec.
    const shots: Shot[] = [];
    shots.push({ kind: "card", path: titleStill, durationSec: 5, zoomDirection: "in" });

    const heroImage = cats.images[0];
    if (heroImage) {
      const heroUrl = (heroImage.content as any)?.url;
      const local = heroUrl ? await resolveImageToLocal(heroUrl, tmpRoot, `hero-${heroImage.id}`) : null;
      if (local) {
        const prepared = path.join(tmpRoot, `hero-${heroImage.id}.jpg`);
        try {
          await prepareImageFrame({ inputPath: local, outPath: prepared });
          shots.push({ kind: "image", path: prepared, durationSec: 5, zoomDirection: "in" });
        } catch (err) {
          console.warn(`[cinematic] hero prepare failed: ${(err as Error).message}`);
        }
      }
    }

    // Up to 4 inspiration shots (skipping the hero used above)
    const inspirations = cats.images.slice(1, 5);
    let panToggle = true;
    for (const img of inspirations) {
      const url = (img.content as any)?.url;
      const local = url ? await resolveImageToLocal(url, tmpRoot, `insp-${img.id}`) : null;
      if (!local) continue;
      const prepared = path.join(tmpRoot, `insp-${img.id}.jpg`);
      try {
        await prepareImageFrame({ inputPath: local, outPath: prepared });
        shots.push({
          kind: "image",
          path: prepared,
          durationSec: 4,
          zoomDirection: panToggle ? "panLeft" : "panRight",
        });
        panToggle = !panToggle;
      } catch (err) {
        console.warn(`[cinematic] inspiration prepare failed: ${(err as Error).message}`);
      }
    }

    shots.push({ kind: "card", path: paletteStill, durationSec: 4, zoomDirection: "out" });
    shots.push({ kind: "card", path: materialStill, durationSec: 4, zoomDirection: "in" });

    // Up to 3 hardware shots (uses any image url on the hardware element if present)
    const hardwareWithImages = cats.hardware
      .map((h: any) => ({ h, url: ((h.content || {}) as any)?.imageUrl || ((h.content || {}) as any)?.url }))
      .filter((x) => Boolean(x.url))
      .slice(0, 3);
    for (const { h, url } of hardwareWithImages) {
      const local = await resolveImageToLocal(url, tmpRoot, `hw-${h.id}`);
      if (!local) continue;
      const prepared = path.join(tmpRoot, `hw-${h.id}.jpg`);
      try {
        await prepareImageFrame({ inputPath: local, outPath: prepared });
        shots.push({ kind: "image", path: prepared, durationSec: 3, zoomDirection: "in" });
      } catch (err) {
        console.warn(`[cinematic] hardware prepare failed: ${(err as Error).message}`);
      }
    }

    shots.push({ kind: "card", path: specStill, durationSec: 5, zoomDirection: "out" });

    // Render each shot to a segment, skipping any that fail.
    const wallStart = Date.now();
    const segmentPaths: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const elapsed = Date.now() - wallStart;
      if (elapsed > RENDER_TIMEOUT_MS) {
        console.warn(`[cinematic] wall-time cap reached at segment ${i}; stopping`);
        break;
      }
      const segPath = path.join(tmpRoot, `seg-${String(i).padStart(2, "0")}.mp4`);
      const remaining = Math.max(2_000, RENDER_TIMEOUT_MS - elapsed);
      try {
        await renderSegment({
          sourcePath: shots[i].path,
          outPath: segPath,
          durationSec: shots[i].durationSec,
          zoomDirection: shots[i].zoomDirection,
          timeoutMs: Math.min(20_000, remaining),
        });
        segmentPaths.push(segPath);
      } catch (err) {
        console.warn(`[cinematic] segment ${i} failed: ${(err as Error).message}`);
      }
    }

    if (segmentPaths.length === 0) {
      throw new Error("No cinematic segments rendered successfully");
    }

    const out = uploadDir();
    const videoFilename = `cinematic-${jobId}.mp4`;
    const thumbFilename = `cinematic-${jobId}-thumb.jpg`;
    const videoPath = path.join(out, videoFilename);
    const thumbPath = path.join(out, thumbFilename);

    const concatBudget = Math.max(5_000, RENDER_TIMEOUT_MS - (Date.now() - wallStart));
    const { durationSec } = await concatWithCrossfades({
      segmentPaths,
      outPath: videoPath,
      timeoutMs: concatBudget,
    });

    try {
      await makeThumbnail(videoPath, thumbPath);
    } catch (err) {
      console.warn(`[cinematic] thumbnail failed: ${(err as Error).message}`);
    }

    return {
      videoUrl: `/uploads/${videoFilename}`,
      thumbnailUrl: fs.existsSync(thumbPath) ? `/uploads/${thumbFilename}` : "",
      durationSec,
    };
  } finally {
    cleanup();
  }
}
