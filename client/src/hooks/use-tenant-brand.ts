// Public brand resolver. PR N — white-label Phase 4 (display only).
//
// Returns the tenant brand strings used across the UI. Falls back to the
// hard-coded Aster & Spruce values whenever the network call hasn't resolved
// or returns nothing — so behaviour is unchanged on a fresh DB or while the
// query is loading.
//
// IMPORTANT: This is display-only. Do not use brand fields for authorization
// or data scoping. There is still only one tenant row.

import { useQuery } from "@tanstack/react-query";

export type TenantBrand = {
  brandName: string;
  legalName: string;
  brandWebsite: string;
  supportEmail: string;
  appUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

export const BRAND_FALLBACK: TenantBrand = {
  brandName: "Aster & Spruce",
  legalName: "Aster & Spruce Living",
  brandWebsite: "https://asterandspruceliving.ca",
  supportEmail: "info@asterandspruceliving.ca",
  appUrl: null,
  logoUrl: null,
  primaryColor: null,
};

export function useTenantBrand(): TenantBrand {
  const { data } = useQuery<TenantBrand>({
    queryKey: ["/api/tenant/brand"],
    // Public endpoint — explicit fetch keeps this resilient to default
    // queryFn changes and avoids the global on401 "throw" behaviour.
    queryFn: async () => {
      try {
        const res = await fetch("/api/tenant/brand", { credentials: "include" });
        if (!res.ok) return BRAND_FALLBACK;
        const json = (await res.json()) as Partial<TenantBrand>;
        return { ...BRAND_FALLBACK, ...json };
      } catch {
        return BRAND_FALLBACK;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? BRAND_FALLBACK;
}
