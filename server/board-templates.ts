/**
 * Board templates — DB-backed.
 *
 * The previous version of this file shipped a curated catalogue of
 * faux-content sample boards (kitchen, bathroom, cottage, moodboards, etc.)
 * baked into source. Those were removed in favour of user-saved templates:
 * a designer clicks "Save as template" on any real board and that board
 * becomes a reusable starting point.
 *
 * Public surface kept identical so route handlers don't change shape:
 *   getTemplateCatalogue() → list (id, name, description, icon, image)
 *   getTemplateCanvasData(id) → cloned canvasData JSON
 *
 * Both now read from the board_templates table via storage.
 */
import { storage } from "./storage";

export interface BoardTemplateView {
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
}

export async function getTemplateCatalogue(): Promise<BoardTemplateView[]> {
  const rows = await storage.listBoardTemplates();
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    description: row.description ?? "",
    // User templates don't ship with a brand icon — keep one neutral icon
    // and let the picker render a uniform tile.
    icon: "LayoutPanelLeft",
    // No preview image is shipped with user templates yet; the picker has a
    // graceful fallback when this is empty.
    image: "",
  }));
}

export async function getTemplateCanvasData(templateId: string): Promise<any | null> {
  const id = Number(templateId);
  if (!Number.isFinite(id)) return null;
  const row = await storage.getBoardTemplate(id);
  if (!row) return null;
  // Deep clone so callers can mutate freely without poisoning the row.
  return JSON.parse(JSON.stringify(row.canvasData));
}
