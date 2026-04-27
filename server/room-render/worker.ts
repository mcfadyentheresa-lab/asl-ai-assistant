// In-process FIFO worker for room_renders. Concurrency 1.
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { storage } from "../storage";
import { getRoomRender, nextQueuedRoomRender, updateRoomRender } from "./db";
import { buildPrompt, resolveRoom } from "./prompt";

let running = false;

const RENDER_TIMEOUT_MS = 60_000;
// Sanity ceiling — reject estimates above this. PR spec.
const COST_CEILING_CENTS = 50;
// Single-image cost estimate for gpt-image-1 1024x1536 portrait. Documented in
// the PR description; treat as a rough audit number, not a billing source of
// truth.
const ESTIMATED_COST_CENTS = 4;

export function kickRoomRenderWorker(): void {
  if (running) return;
  running = true;
  void drain().finally(() => {
    running = false;
  });
}

async function drain(): Promise<void> {
  while (true) {
    const job = await nextQueuedRoomRender();
    if (!job) return;
    await processJob(job.id);
  }
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

async function resolveSourceFile(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/uploads/")) {
      const dir = uploadDir();
      const filename = url.slice("/uploads/".length);
      const localPath = path.join(dir, filename);
      if (!fs.existsSync(localPath)) return null;
      return localPath;
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      ensureUploadDir();
      const out = path.join(uploadDir(), `srcphoto-${randomUUID()}.bin`);
      await fs.promises.writeFile(out, buf);
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

async function callImageModel(opts: {
  prompt: string;
  mode: "restyle" | "imagine";
  sourcePath: string | null;
}): Promise<Buffer> {
  const { prompt, mode, sourcePath } = opts;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const size = "1024x1536";
  const model = "gpt-image-1";

  if (mode === "restyle" && sourcePath) {
    // Edit endpoint expects a file/Blob. Use the SDK's file helper to attach.
    const toFile = (await import("openai")).toFile;
    const buf = await fs.promises.readFile(sourcePath);
    const file = await toFile(buf, "source.png", { type: "image/png" });
    const resp = (await client.images.edit({
      model,
      image: file,
      prompt,
      size,
    } as any)) as any;
    const b64 = resp?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image edit returned no data");
    return Buffer.from(b64, "base64");
  }

  const resp = (await client.images.generate({
    model,
    prompt,
    size,
    n: 1,
  } as any)) as any;
  const b64 = resp?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generate returned no data");
  return Buffer.from(b64, "base64");
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    to = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T;
  } finally {
    if (to) clearTimeout(to);
  }
}

async function processJob(jobId: number): Promise<void> {
  const claimed = await updateRoomRender(jobId, { status: "rendering" });
  if (!claimed) return;
  try {
    if (ESTIMATED_COST_CENTS > COST_CEILING_CENTS) {
      throw new Error(
        `Estimated cost ${ESTIMATED_COST_CENTS}¢ exceeds ceiling ${COST_CEILING_CENTS}¢`,
      );
    }

    if (!claimed.boardId) throw new Error("Render requires a boardId");

    const elements = await storage.getCanvasElements(claimed.boardId);
    const { zone, elements: roomEls } = resolveRoom(elements as any, claimed.roomName);

    const built = buildPrompt({
      roomName: claimed.roomName,
      zone: zone as any,
      elements: roomEls as any,
      mode: claimed.mode as "restyle" | "imagine",
    });

    let sourcePath: string | null = null;
    if (claimed.mode === "restyle") {
      const url = (zone?.content as any)?.sourcePhotoUrl as string | undefined;
      if (!url) throw new Error("Re-style requires a source photo on this room");
      sourcePath = await resolveSourceFile(url);
      if (!sourcePath) throw new Error("Source photo could not be loaded");
    }

    console.info(
      `[room-render] job ${jobId} room="${claimed.roomName}" mode=${claimed.mode} estCents=${ESTIMATED_COST_CENTS}`,
    );

    const buf = await withTimeout(
      callImageModel({ prompt: built.prompt, mode: claimed.mode as any, sourcePath }),
      RENDER_TIMEOUT_MS,
      "Image render",
    );

    ensureUploadDir();
    const baseName = `room-render-${jobId}-${randomUUID()}`;
    const fullName = `${baseName}.jpg`;
    const thumbName = `${baseName}-thumb.jpg`;
    const fullPath = path.join(uploadDir(), fullName);
    const thumbPath = path.join(uploadDir(), thumbName);

    await sharp(buf).jpeg({ quality: 90 }).toFile(fullPath);
    await sharp(buf).resize(512, 768, { fit: "cover" }).jpeg({ quality: 80 }).toFile(thumbPath);

    await updateRoomRender(jobId, {
      status: "completed",
      imageUrl: `/uploads/${fullName}`,
      thumbnailUrl: `/uploads/${thumbName}`,
      prompt: built.prompt,
      costEstimateCents: ESTIMATED_COST_CENTS,
      errorMessage: null,
    });
  } catch (err: any) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error(`[room-render] job ${jobId} failed:`, msg);
    await updateRoomRender(jobId, {
      status: "failed",
      errorMessage: msg.slice(0, 500),
    });
  }
}

export async function getRoomRenderStatus(jobId: number) {
  return getRoomRender(jobId);
}
