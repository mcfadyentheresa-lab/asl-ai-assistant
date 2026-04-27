// Vendor link health checker. Re-checks vendor URLs on hardware/link/product
// elements and stores the result on element.content.linkHealth so the board
// can show "link broken" chips and the spec sheet can strike through dead URLs.

import { db } from "./db";
import { canvasElements } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { storage } from "./storage";
import { log } from "./index";

export type LinkHealthStatus = "healthy" | "unhealthy" | "unreachable";

export interface LinkHealth {
  status: LinkHealthStatus;
  checkedAt: string;
  code?: number;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; AsterSpruceLinkHealth/1.0; +https://asterandspruceliving.ca)";
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const SKIP_IF_FRESHER_THAN_MS = 12 * 60 * 60 * 1000; // 12h

// Pull the URL field that "is" the vendor link for a given element type.
export function urlForElement(el: { type: string; content: any }): string | null {
  const c = el.content || {};
  if (el.type === "hardware") return typeof c.vendorUrl === "string" ? c.vendorUrl : null;
  if (el.type === "link") return typeof c.url === "string" ? c.url : null;
  if (el.type === "product") return typeof c.url === "string" ? c.url : null;
  return null;
}

function isFresh(linkHealth: LinkHealth | undefined): boolean {
  if (!linkHealth?.checkedAt) return false;
  const ts = Date.parse(linkHealth.checkedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SKIP_IF_FRESHER_THAN_MS;
}

// Check a single URL with HEAD (falling back to a 1-byte GET Range for servers
// that 405 HEAD). Returns a LinkHealth ready to persist.
export async function checkUrl(url: string): Promise<LinkHealth> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { status: "unreachable", checkedAt: new Date().toISOString() };
  }

  const tryFetch = async (method: "HEAD" | "GET"): Promise<LinkHealth | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        // Node's fetch follows redirects by default; we cap with `redirect: "follow"`
        // and a manual hop-count by re-issuing if needed. Node 20+ doesn't expose a
        // direct max-redirects knob, but in practice well-behaved sites stay under 3.
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          // Tiny range so servers that ignore HEAD return fast on GET fallback.
          ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
        },
      });
      const code = res.status;
      // 2xx and 3xx (after redirect follow this should be the final status) → healthy.
      // 206 from Range request → also healthy.
      if (code >= 200 && code < 400) {
        return { status: "healthy", checkedAt: new Date().toISOString(), code };
      }
      return { status: "unhealthy", checkedAt: new Date().toISOString(), code };
    } catch {
      return null; // signal "try the other method"
    } finally {
      clearTimeout(timer);
    }
  };

  // HEAD first (cheap), GET Range fallback when HEAD itself errored or returned
  // 405/501. This matches the spec: "HEAD only (fallback to GET Range)".
  const headResult = await tryFetch("HEAD");
  if (headResult && headResult.status === "healthy") return headResult;
  if (headResult && headResult.code && headResult.code !== 405 && headResult.code !== 501) {
    return headResult;
  }
  const getResult = await tryFetch("GET");
  if (getResult) return getResult;
  // Both attempts threw (timeout, DNS, TLS, etc.).
  return { status: "unreachable", checkedAt: new Date().toISOString() };
}

// Re-check every vendor URL across the project's boards. Skips URLs whose
// last check was < 12h ago. Persists linkHealth on element.content.
export async function recheckAllVendorLinks(opts?: { force?: boolean }): Promise<{
  checked: number;
  skipped: number;
  unhealthy: number;
  unreachable: number;
}> {
  const force = opts?.force === true;
  const rows = await db
    .select()
    .from(canvasElements)
    .where(inArray(canvasElements.type, ["hardware", "link", "product"]));

  let checked = 0;
  let skipped = 0;
  let unhealthy = 0;
  let unreachable = 0;

  for (const row of rows) {
    const url = urlForElement(row as any);
    if (!url) continue;
    const c = (row.content as any) || {};
    if (!force && isFresh(c.linkHealth as LinkHealth | undefined)) {
      skipped++;
      continue;
    }
    try {
      const result = await checkUrl(url);
      const nextContent = { ...c, linkHealth: result };
      await db
        .update(canvasElements)
        .set({ content: nextContent, updatedAt: new Date() })
        .where(eq(canvasElements.id, row.id));
      checked++;
      if (result.status === "unhealthy") unhealthy++;
      if (result.status === "unreachable") unreachable++;
    } catch (err: any) {
      // Don't let one bad URL kill the whole sweep.
      console.error(`Link health check failed for element ${row.id}:`, err?.message || err);
    }
  }

  return { checked, skipped, unhealthy, unreachable };
}

// Re-check a single element by id, regardless of freshness. Returns the new
// linkHealth, or null if the element has no URL.
export async function recheckElementLink(elementId: number): Promise<LinkHealth | null> {
  const el = await storage.getCanvasElement(elementId);
  if (!el) return null;
  const url = urlForElement(el as any);
  if (!url) return null;
  const result = await checkUrl(url);
  const nextContent = { ...((el.content as any) || {}), linkHealth: result };
  await storage.updateCanvasElement(elementId, { content: nextContent });
  return result;
}

// Schedule a daily background sweep. Runs once on boot (after a 30s warmup so
// startup isn't blocked) and then every 24h.
export function startLinkHealthJob(): void {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const run = async () => {
    try {
      const stats = await recheckAllVendorLinks();
      log(
        `link-health: checked=${stats.checked} skipped=${stats.skipped} unhealthy=${stats.unhealthy} unreachable=${stats.unreachable}`,
        "link-health",
      );
    } catch (err: any) {
      console.error("link-health sweep failed:", err?.message || err);
    }
  };
  setTimeout(run, 30_000);
  setInterval(run, ONE_DAY_MS);
}
