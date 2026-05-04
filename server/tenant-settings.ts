// Tenant settings access — shared between SMS, AI prompts, and admin endpoints.
//
// Single-row global config for the current single-tenant deployment. The cache
// is short-lived (5 minutes) so an admin edit becomes visible quickly without
// requiring a server restart. See docs/PRODUCT_PHILOSOPHY.md.
//
// PR N (demo-safe white-label): adds the helper used by AI prompts and the new
// admin Brand UI. Not data isolation — there is still only one row.

import { db } from "./db";
import { eq } from "drizzle-orm";
import { tenantSettings, type TenantSettings } from "@shared/schema";

let cachedSettings: TenantSettings | null = null;
let cachedSettingsAt = 0;
const SETTINGS_CACHE_MS = 5 * 60 * 1000;

export async function getTenantSettings(): Promise<TenantSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettingsAt < SETTINGS_CACHE_MS) {
    return cachedSettings;
  }
  try {
    const rows = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantKey, "default"))
      .limit(1);
    cachedSettings = rows[0] ?? null;
    cachedSettingsAt = now;
    return cachedSettings;
  } catch (err: any) {
    // Table may not exist yet on a fresh DB — fail safe (no settings).
    console.warn("tenant_settings unavailable:", err.message || err);
    return null;
  }
}

export function invalidateTenantSettingsCache(): void {
  cachedSettings = null;
  cachedSettingsAt = 0;
}

// Hard-coded fallbacks used when the DB row is missing. Mirrors the schema
// defaults so behaviour is unchanged on a fresh DB.
export const BRAND_FALLBACKS = {
  brandName: "Aster & Spruce",
  legalName: "Aster & Spruce Living",
  brandWebsite: "https://asterandspruceliving.ca",
  supportEmail: "info@asterandspruceliving.ca",
  appUrl: null as string | null,
  logoUrl: null as string | null,
  primaryColor: null as string | null,
};

/**
 * Returns the brand-display fields, falling back to hard-coded defaults when
 * the DB row is missing or partially populated. Always safe to call.
 */
export async function getBrand(): Promise<{
  brandName: string;
  legalName: string;
  brandWebsite: string;
  supportEmail: string;
  appUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}> {
  const s = await getTenantSettings();
  return {
    brandName: s?.brandName || BRAND_FALLBACKS.brandName,
    legalName: s?.legalName || BRAND_FALLBACKS.legalName,
    brandWebsite: s?.brandWebsite || BRAND_FALLBACKS.brandWebsite,
    supportEmail: s?.supportEmail || BRAND_FALLBACKS.supportEmail,
    appUrl: s?.appUrl || BRAND_FALLBACKS.appUrl,
    logoUrl: s?.logoUrl || BRAND_FALLBACKS.logoUrl,
    primaryColor: s?.primaryColor || BRAND_FALLBACKS.primaryColor,
  };
}
