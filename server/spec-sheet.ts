// Spec sheet PDF generator. Pulls every selected/ordered hardware/surface/product
// from every board on a project, groups by room → category, and renders a
// printable tearsheet for the trades.

import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Response } from "express";
import { storage } from "./storage";
import type { LinkHealth } from "./link-health";
import type { CanvasElement, Project } from "@shared/schema";

// Brand
const SPRUCE = "#2f4a3a";
const PAPER = "#f0e9da"; // HSL 40 20% 94% in hex (warm paper)
const INK = "#1a1f1c";
const MUTED = "#6b6f6c";
const RULE = "#cfc7b6";
const AMBER = "#a8632b";

const PAGE_MARGIN = 48;
const COL_GAP = 12;

// CAD currency formatter — enforced everywhere.
const cadFmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

interface LineItem {
  el: CanvasElement;
  category: "Hardware" | "Surfaces" | "Products";
  room: string;
  imageInfo: { kind: "url" | "swatch" | "none"; url?: string; swatch?: string };
  name: string;
  brand?: string;
  sku?: string;
  meta: string[]; // finish / dimensions / paint code / LRV / sheen — whatever applies
  vendorUrl?: string;
  linkHealth?: LinkHealth;
  unitPrice?: number;
  quantity: number;
  lineTotal: number;
}

const SELECTED_OR_ORDERED = new Set(["selected", "ordered"]);

// Build line items from raw canvas elements.
function buildItems(elements: CanvasElement[]): LineItem[] {
  const items: LineItem[] = [];
  for (const el of elements) {
    const c: any = el.content || {};
    const status = String(c.status || "idea").toLowerCase();
    if (!SELECTED_OR_ORDERED.has(status)) continue;

    const room = String(c.room || "Unassigned").trim() || "Unassigned";
    const qtyRaw = Number(c.quantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
    const unitPrice = typeof c.price === "number" && Number.isFinite(c.price) ? c.price : undefined;
    const lineTotal = unitPrice != null ? unitPrice * quantity : 0;

    if (el.type === "hardware") {
      items.push({
        el,
        category: "Hardware",
        room,
        imageInfo: c.imageUrl ? { kind: "url", url: c.imageUrl } : { kind: "none" },
        name: String(c.name || "Hardware"),
        brand: c.brand,
        sku: c.sku,
        meta: [c.category, c.finish, c.dimensions].filter(Boolean).map(String),
        vendorUrl: c.vendorUrl,
        linkHealth: c.linkHealth,
        unitPrice,
        quantity,
        lineTotal,
      });
    } else if (el.type === "surface") {
      const isPaint = c.kind === "paint";
      items.push({
        el,
        category: "Surfaces",
        room,
        imageInfo: isPaint
          ? { kind: "swatch", swatch: String(c.hex || c.color || "#999999") }
          : c.imageUrl
            ? { kind: "url", url: c.imageUrl }
            : { kind: "none" },
        name: String(c.name || (isPaint ? "Color" : "Material")),
        brand: c.brand || c.supplier,
        sku: c.code,
        meta: [
          c.code,
          isPaint && typeof c.lrv === "number" ? `LRV ${c.lrv}` : null,
          c.sheen,
          c.category,
        ].filter(Boolean).map(String),
        vendorUrl: c.vendorUrl,
        linkHealth: c.linkHealth,
        unitPrice,
        quantity,
        lineTotal,
      });
    } else if (el.type === "product") {
      items.push({
        el,
        category: "Products",
        room,
        imageInfo: c.imageUrl ? { kind: "url", url: c.imageUrl } : { kind: "none" },
        name: String(c.name || "Product"),
        brand: c.supplier,
        sku: c.sku,
        meta: [c.dimensions, c.finish].filter(Boolean).map(String),
        vendorUrl: c.url,
        linkHealth: c.linkHealth,
        unitPrice,
        quantity,
        lineTotal,
      });
    }
  }
  return items;
}

interface RoomGroup {
  room: string;
  items: LineItem[];
  categories: Record<"Hardware" | "Surfaces" | "Products", LineItem[]>;
  subtotal: number;
}

function groupByRoom(items: LineItem[]): RoomGroup[] {
  const map = new Map<string, RoomGroup>();
  for (const it of items) {
    let g = map.get(it.room);
    if (!g) {
      g = {
        room: it.room,
        items: [],
        categories: { Hardware: [], Surfaces: [], Products: [] },
        subtotal: 0,
      };
      map.set(it.room, g);
    }
    g.items.push(it);
    g.categories[it.category].push(it);
    g.subtotal += it.lineTotal;
  }
  // Stable sort: rooms alphabetical, "Unassigned" last.
  return Array.from(map.values()).sort((a, b) => {
    if (a.room === "Unassigned") return 1;
    if (b.room === "Unassigned") return -1;
    return a.room.localeCompare(b.room);
  });
}

// Resolve a /uploads/... path or absolute http URL into something pdfkit can
// embed. PDFKit's image() takes a Buffer or a path; we pre-fetch and return a
// Buffer for http URLs, and resolve /uploads/ to disk.
async function loadImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("/uploads/")) {
      const uploadDir = process.env.UPLOAD_DIR
        ? path.resolve(process.env.UPLOAD_DIR)
        : path.join(process.cwd(), "uploads");
      const filename = url.slice("/uploads/".length);
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    }
    if (/^https?:\/\//i.test(url)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; AsterSpruceSpecSheet/1.0)",
          },
        });
        if (!r.ok) return null;
        const ct = r.headers.get("content-type") || "";
        if (!/^image\/(jpe?g|png)/i.test(ct)) {
          // PDFKit only handles JPEG/PNG. Skip svg/webp/etc.
          return null;
        }
        const arr = new Uint8Array(await r.arrayBuffer());
        return Buffer.from(arr);
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isLinkBroken(h: LinkHealth | undefined): boolean {
  return h?.status === "unhealthy" || h?.status === "unreachable";
}

interface PdfContext {
  doc: InstanceType<typeof PDFDocument>;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
}

function paintBackground(doc: InstanceType<typeof PDFDocument>, w: number, h: number): void {
  doc.save();
  doc.rect(0, 0, w, h).fill(PAPER);
  doc.restore();
  doc.fillColor(INK);
}

function drawHeader(ctx: PdfContext, project: Project): void {
  const { doc, contentWidth } = ctx;
  const top = PAGE_MARGIN;
  // Wordmark
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(SPRUCE)
    .text("ASTER & SPRUCE LIVING", PAGE_MARGIN, top, { characterSpacing: 1.2 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text("Spec sheet · trades reference", PAGE_MARGIN, top + 14);

  // Date right-aligned
  const dateStr = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(dateStr, PAGE_MARGIN, top, { width: contentWidth, align: "right" });

  // Project name
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(INK)
    .text(project.name, PAGE_MARGIN, top + 36, { width: contentWidth });

  if (project.address) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(project.address, PAGE_MARGIN, top + 62);
  }

  // Spruce rule
  const ruleY = top + 86;
  doc.save();
  doc
    .strokeColor(SPRUCE)
    .lineWidth(1.4)
    .moveTo(PAGE_MARGIN, ruleY)
    .lineTo(PAGE_MARGIN + contentWidth, ruleY)
    .stroke();
  doc.restore();
  doc.fillColor(INK);

  doc.y = ruleY + 14;
  doc.x = PAGE_MARGIN;
}

function drawFooter(ctx: PdfContext, project: Project, pageNum: number): void {
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;
  const y = pageHeight - PAGE_MARGIN + 8;
  const left = "Prepared by Aster & Spruce Living · Muskoka, Ontario";
  const right = `Page ${pageNum}`;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(left, PAGE_MARGIN, y, { width: contentWidth - 60, align: "left" });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(right, PAGE_MARGIN, y, { width: contentWidth, align: "right" });
  if (project.address) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(MUTED)
      .text(project.address, PAGE_MARGIN, y + 10, { width: contentWidth, align: "left" });
  }
  doc.fillColor(INK);
}

// Reserve room for footer when calculating remaining space.
function bottomLimit(ctx: PdfContext): number {
  return ctx.pageHeight - PAGE_MARGIN - 28;
}

function ensureSpace(ctx: PdfContext, needed: number, project: Project, pageNumRef: { n: number }): void {
  if (ctx.doc.y + needed > bottomLimit(ctx)) {
    addPage(ctx, project, pageNumRef);
  }
}

function addPage(ctx: PdfContext, project: Project, pageNumRef: { n: number }): void {
  drawFooter(ctx, project, pageNumRef.n);
  ctx.doc.addPage();
  paintBackground(ctx.doc, ctx.pageWidth, ctx.pageHeight);
  pageNumRef.n += 1;
  drawHeader(ctx, project);
}

interface RoomDrawArgs {
  ctx: PdfContext;
  group: RoomGroup;
  itemImages: Map<number, Buffer | null>;
  project: Project;
  pageNumRef: { n: number };
}

// Vision Renders section. Shows the most recent completed render per room as
// a wide image with the room name beneath it. Only rendered when at least one
// completed render exists.
async function drawVisionRenders(
  ctx: PdfContext,
  renders: Array<{ roomName: string; imageUrl: string }>,
  project: Project,
  pageNumRef: { n: number },
): Promise<void> {
  if (renders.length === 0) return;
  const { doc, contentWidth } = ctx;
  ensureSpace(ctx, 36, project, pageNumRef);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(SPRUCE)
    .text("VISION RENDERS", PAGE_MARGIN, doc.y + 8, { characterSpacing: 1.4 });
  doc.y += 6;
  doc.save();
  doc
    .strokeColor(RULE)
    .lineWidth(0.5)
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + contentWidth, doc.y)
    .stroke();
  doc.restore();
  doc.fillColor(INK);
  doc.y += 8;

  const cardW = (contentWidth - COL_GAP) / 2;
  const cardH = cardW * 1.4;
  let col = 0;
  for (const r of renders) {
    ensureSpace(ctx, cardH + 24, project, pageNumRef);
    const x = PAGE_MARGIN + col * (cardW + COL_GAP);
    const y = doc.y;
    const buf = await loadImageBuffer(r.imageUrl);
    if (buf) {
      try {
        doc.image(buf, x, y, { fit: [cardW, cardH], align: "center", valign: "center" });
      } catch {
        doc.save();
        doc.rect(x, y, cardW, cardH).fill("#e6dfce");
        doc.restore();
        doc.fillColor(INK);
      }
    } else {
      doc.save();
      doc.rect(x, y, cardW, cardH).fill("#e6dfce");
      doc.restore();
      doc.fillColor(INK);
    }
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK)
      .text(r.roomName, x, y + cardH + 4, { width: cardW, align: "center" });
    if (col === 1) {
      doc.y = y + cardH + 22;
      col = 0;
    } else {
      col = 1;
    }
  }
  if (col === 1) doc.y += cardH + 22;
  doc.y += 6;
}

function drawRoomHeading(ctx: PdfContext, group: RoomGroup, project: Project, pageNumRef: { n: number }): void {
  ensureSpace(ctx, 36, project, pageNumRef);
  const { doc, contentWidth } = ctx;
  const y = doc.y + 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(SPRUCE)
    .text(group.room.toUpperCase(), PAGE_MARGIN, y, { characterSpacing: 1.4 });
  const itemsLabel = `${group.items.length} item${group.items.length === 1 ? "" : "s"}`;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(itemsLabel, PAGE_MARGIN, y + 2, { width: contentWidth, align: "right" });
  doc.y = y + 18;
  // Faint separator
  doc.save();
  doc
    .strokeColor(RULE)
    .lineWidth(0.5)
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + contentWidth, doc.y)
    .stroke();
  doc.restore();
  doc.fillColor(INK);
  doc.y += 6;
}

function drawCategoryHeading(ctx: PdfContext, label: string, count: number, project: Project, pageNumRef: { n: number }): void {
  ensureSpace(ctx, 22, project, pageNumRef);
  const { doc } = ctx;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(INK)
    .text(`${label}  (${count})`, PAGE_MARGIN, doc.y + 4, { characterSpacing: 1.0 });
  doc.y += 14;
  doc.fillColor(INK);
}

function drawLineItem(ctx: PdfContext, item: LineItem, img: Buffer | null, project: Project, pageNumRef: { n: number }): void {
  const ROW_H = 78;
  ensureSpace(ctx, ROW_H + 6, project, pageNumRef);
  const { doc, contentWidth } = ctx;
  const top = doc.y;
  const thumbW = 56;
  const thumbH = 56;
  const padding = 12;

  // Thumbnail
  if (item.imageInfo.kind === "url" && img) {
    try {
      doc.save();
      doc.rect(PAGE_MARGIN, top, thumbW, thumbH).clip();
      doc.image(img, PAGE_MARGIN, top, { fit: [thumbW, thumbH], align: "center", valign: "center" });
      doc.restore();
    } catch {
      // pdfkit can choke on weird image bytes — fall back to a neutral square.
      doc.save();
      doc.rect(PAGE_MARGIN, top, thumbW, thumbH).fill("#dcd5c2");
      doc.restore();
    }
  } else if (item.imageInfo.kind === "swatch" && item.imageInfo.swatch) {
    const swatch = item.imageInfo.swatch.startsWith("#") ? item.imageInfo.swatch : `#${item.imageInfo.swatch}`;
    doc.save();
    doc.rect(PAGE_MARGIN, top, thumbW, thumbH).fill(swatch);
    doc.restore();
  } else {
    doc.save();
    doc.rect(PAGE_MARGIN, top, thumbW, thumbH).fill("#e6dfcc");
    doc.restore();
  }
  // Thumbnail border
  doc.save();
  doc.strokeColor(RULE).lineWidth(0.5).rect(PAGE_MARGIN, top, thumbW, thumbH).stroke();
  doc.restore();

  const textX = PAGE_MARGIN + thumbW + padding;
  const rightColW = 110;
  const textW = contentWidth - thumbW - padding - rightColW - 8;

  // Name
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(item.name, textX, top, { width: textW, ellipsis: true });

  // Brand · sku
  const brandLine = [item.brand, item.sku].filter(Boolean).join(" · ");
  let cursorY = top + 14;
  if (brandLine) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(brandLine, textX, cursorY, { width: textW, ellipsis: true });
    cursorY += 12;
  }

  // Meta line(s) — finish, dimensions, lrv, etc.
  if (item.meta.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(item.meta.join(" · "), textX, cursorY, { width: textW, ellipsis: true });
    cursorY += 12;
  }

  // Vendor URL — strikethrough + amber tag if broken
  if (item.vendorUrl) {
    const broken = isLinkBroken(item.linkHealth);
    const url = item.vendorUrl;
    const display = url.length > 64 ? url.slice(0, 61) + "…" : url;
    if (broken) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(MUTED)
        .text(display, textX, cursorY, { width: textW, ellipsis: true });
      // Manual strikethrough — pdfkit text doesn't expose a strike option.
      const strikeY = cursorY + 4;
      doc.save();
      doc.strokeColor(MUTED).lineWidth(0.6)
        .moveTo(textX, strikeY)
        .lineTo(textX + Math.min(textW, doc.widthOfString(display)), strikeY)
        .stroke();
      doc.restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(AMBER)
        .text("[link broken]", textX, cursorY + 10, { characterSpacing: 0.6 });
      cursorY += 22;
    } else {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(SPRUCE)
        .text(display, textX, cursorY, { width: textW, ellipsis: true, link: url, underline: true });
      cursorY += 11;
    }
  }

  // Right column: qty + price + line total
  const rightX = PAGE_MARGIN + contentWidth - rightColW;
  doc.fillColor(INK);
  const qtyLabel = `Qty ${item.quantity}`;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(qtyLabel, rightX, top, { width: rightColW, align: "right" });

  if (item.unitPrice != null) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Unit ${cadFmt.format(item.unitPrice)}`, rightX, top + 12, { width: rightColW, align: "right" });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(INK)
      .text(cadFmt.format(item.lineTotal), rightX, top + 26, { width: rightColW, align: "right" });
  } else {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(MUTED)
      .text("Price TBD", rightX, top + 12, { width: rightColW, align: "right" });
  }

  doc.fillColor(INK);
  // Light separator under each row
  const bottom = top + ROW_H - 4;
  doc.save();
  doc.strokeColor(RULE).lineWidth(0.4)
    .moveTo(PAGE_MARGIN, bottom)
    .lineTo(PAGE_MARGIN + contentWidth, bottom)
    .stroke();
  doc.restore();

  doc.y = bottom + 4;
}

function drawRoomSubtotal(ctx: PdfContext, group: RoomGroup, project: Project, pageNumRef: { n: number }): void {
  ensureSpace(ctx, 22, project, pageNumRef);
  const { doc, contentWidth } = ctx;
  const y = doc.y + 4;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${group.room} subtotal`, PAGE_MARGIN, y, { width: contentWidth - 120 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK)
    .text(cadFmt.format(group.subtotal), PAGE_MARGIN, y - 1, { width: contentWidth, align: "right" });
  doc.y = y + 18;
}

function drawGrandTotal(ctx: PdfContext, total: number, project: Project, pageNumRef: { n: number }): void {
  ensureSpace(ctx, 60, project, pageNumRef);
  const { doc, contentWidth } = ctx;
  const y = doc.y + 12;
  doc.save();
  doc.strokeColor(SPRUCE).lineWidth(1.0)
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + contentWidth, y)
    .stroke();
  doc.restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(SPRUCE)
    .text("PROJECT GRAND TOTAL", PAGE_MARGIN, y + 8, { characterSpacing: 1.4 });
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(INK)
    .text(cadFmt.format(total), PAGE_MARGIN, y + 6, { width: contentWidth, align: "right" });

  const budget = typeof project.totalBudget === "number" ? project.totalBudget : 0;
  if (budget > 0) {
    const diff = budget - total;
    const over = diff < 0;
    const label = over
      ? `Over budget by ${cadFmt.format(Math.abs(diff))}`
      : `Under budget by ${cadFmt.format(diff)}`;
    const color = over ? AMBER : SPRUCE;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Budget: ${cadFmt.format(budget)}`, PAGE_MARGIN, y + 30, { width: contentWidth - 220 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(color)
      .text(label, PAGE_MARGIN, y + 30, { width: contentWidth, align: "right" });
  }

  doc.fillColor(INK);
  doc.y = y + 56;
}

function drawEmptyNotice(ctx: PdfContext): void {
  const { doc, contentWidth } = ctx;
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(MUTED)
    .text(
      "No items selected or ordered yet. Mark hardware, surfaces, and products as Selected or Ordered on the board to populate this sheet.",
      PAGE_MARGIN,
      doc.y + 24,
      { width: contentWidth, align: "left" },
    );
  doc.fillColor(INK);
}

export async function generateSpecSheetPdf(
  projectId: number,
  res: Response,
  options: { roomFilter?: string | null } = {},
): Promise<void> {
  const project = await storage.getProject(projectId);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  // Pull all canvas elements across every board on the project.
  const boards = await storage.getPlanningBoards(projectId);
  const allElements: CanvasElement[] = [];
  for (const b of boards) {
    const els = await storage.getCanvasElements(b.id);
    allElements.push(...els);
  }

  // Optional per-room scope. When provided, the resulting PDF includes only
  // items tagged to that room, the room name appears in the filename, and the
  // grand total is the room's total. Useful for handing one trade one room.
  const normalizedRoom = options.roomFilter && options.roomFilter.trim() ? options.roomFilter.trim() : null;
  const allItems = buildItems(allElements);
  const items = normalizedRoom
    ? allItems.filter((it) => (it.room || "").trim().toLowerCase() === normalizedRoom.toLowerCase())
    : allItems;
  const groups = groupByRoom(items);
  const grandTotal = items.reduce((acc, it) => acc + it.lineTotal, 0);

  // Pre-fetch all image buffers in parallel — keeps PDF rendering deterministic.
  const imageMap = new Map<number, Buffer | null>();
  await Promise.all(
    items
      .filter((it) => it.imageInfo.kind === "url" && it.imageInfo.url)
      .map(async (it) => {
        const buf = await loadImageBuffer(it.imageInfo.url!);
        imageMap.set(it.el.id, buf);
      }),
  );

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    info: {
      Title: normalizedRoom ? `Spec Sheet — ${project.name} — ${normalizedRoom}` : `Spec Sheet — ${project.name}`,
      Author: "Aster & Spruce Living",
      Subject: normalizedRoom ? `Spec sheet for ${normalizedRoom}` : "Project spec sheet for trades",
    },
  });

  const projectSafe = project.name.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "_") || "project";
  const roomSafe = normalizedRoom
    ? `_${normalizedRoom.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "_") || "room"}`
    : "";
  const filenameSafe = `${projectSafe}${roomSafe}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="spec-sheet-${filenameSafe}.pdf"`);
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const ctx: PdfContext = { doc, pageWidth, pageHeight, contentWidth };
  const pageNumRef = { n: 1 };

  paintBackground(doc, pageWidth, pageHeight);
  drawHeader(ctx, project);

  // Fetch the most recent completed render per room — added in PR-S.
  const visionRenders: Array<{ roomName: string; imageUrl: string }> = [];
  try {
    const { listRoomRendersForProject } = await import("./room-render/db");
    const rows = await listRoomRendersForProject(projectId, 50);
    const seenRooms = new Set<string>();
    for (const r of rows) {
      if (r.status !== "completed" || !r.imageUrl) continue;
      const key = (r.roomName || "").trim();
      if (!key || seenRooms.has(key)) continue;
      seenRooms.add(key);
      visionRenders.push({ roomName: key, imageUrl: r.imageUrl });
    }
  } catch (err) {
    console.warn("[spec-sheet] vision renders lookup failed:", (err as Error).message);
  }
  await drawVisionRenders(ctx, visionRenders, project, pageNumRef);

  if (groups.length === 0) {
    drawEmptyNotice(ctx);
  } else {
    for (const group of groups) {
      drawRoomHeading(ctx, group, project, pageNumRef);
      const order: Array<"Hardware" | "Surfaces" | "Products"> = ["Hardware", "Surfaces", "Products"];
      for (const cat of order) {
        const list = group.categories[cat];
        if (list.length === 0) continue;
        drawCategoryHeading(ctx, cat, list.length, project, pageNumRef);
        for (const item of list) {
          drawLineItem(ctx, item, imageMap.get(item.el.id) || null, project, pageNumRef);
        }
      }
      drawRoomSubtotal(ctx, group, project, pageNumRef);
    }
    drawGrandTotal(ctx, grandTotal, project, pageNumRef);
  }

  // Final page footer
  drawFooter(ctx, project, pageNumRef.n);

  doc.end();
}
