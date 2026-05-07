// PR N — White-label Phase 4 (display only).
//
// Admin-only Brand editor. Edits the seven user-facing brand fields stored on
// tenant_settings. The endpoint is /api/admin/tenant-settings/brand and is
// gated by role on the server.
//
// IMPORTANT: This page edits DISPLAY ONLY. There is still a single tenant
// row, no tenant_id FKs anywhere, and no data isolation. Do not give a
// second tenant production credentials based on this page.

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, ArrowLeft, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

interface TenantSettings {
  brandName: string | null;
  legalName: string | null;
  brandWebsite: string | null;
  supportEmail: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  appUrl: string | null;
}

const EMPTY_FORM = {
  brandName: "",
  legalName: "",
  brandWebsite: "",
  supportEmail: "",
  logoUrl: "",
  primaryColor: "",
  appUrl: "",
};

export default function AdminSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<TenantSettings | null>({
    queryKey: ["/api/admin/tenant-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenant-settings", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 403) return null;
        throw new Error("Failed to load settings");
      }
      return res.json();
    },
    enabled: !!user && user.role === "admin",
    staleTime: 0,
    retry: false,
  });

  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (settings) {
      setForm({
        brandName: settings.brandName ?? "",
        legalName: settings.legalName ?? "",
        brandWebsite: settings.brandWebsite ?? "",
        supportEmail: settings.supportEmail ?? "",
        logoUrl: settings.logoUrl ?? "",
        primaryColor: settings.primaryColor ?? "",
        appUrl: settings.appUrl ?? "",
      });
    }
  }, [settings?.brandName, settings?.legalName, settings?.brandWebsite, settings?.supportEmail, settings?.logoUrl, settings?.primaryColor, settings?.appUrl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Empty strings → null (so the server clears the field rather than
      // failing URL/email validation on an empty string).
      const payload: Record<string, string | null | undefined> = {};
      const trimOrNull = (v: string) => {
        const t = v.trim();
        return t === "" ? null : t;
      };
      // brandName must be non-empty when present; if blank, leave it off the payload
      // entirely so we don't violate the min(1) rule.
      const bn = form.brandName.trim();
      if (bn !== "") payload.brandName = bn;
      payload.legalName = trimOrNull(form.legalName);
      payload.brandWebsite = trimOrNull(form.brandWebsite);
      payload.supportEmail = trimOrNull(form.supportEmail);
      payload.logoUrl = trimOrNull(form.logoUrl);
      payload.primaryColor = trimOrNull(form.primaryColor);
      payload.appUrl = trimOrNull(form.appUrl);
      const res = await apiRequest("PATCH", "/api/admin/tenant-settings/brand", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Brand updated", description: "Changes will appear on next page load for other users." });
      qc.invalidateQueries({ queryKey: ["/api/admin/tenant-settings"] });
      // Public brand cache used across the app — refresh so the editor sees
      // their change reflected immediately.
      globalQueryClient.invalidateQueries({ queryKey: ["/api/tenant/brand"] });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Please check the field values and try again.",
        variant: "destructive",
      });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
          <h1 className="font-serif text-2xl font-bold">Admin only</h1>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const handleField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6" data-testid="page-admin-settings">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          data-testid="link-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="space-y-1">
          <h1 className="font-serif text-3xl font-bold" data-testid="text-settings-heading">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">Brand display fields used across the portal.</p>
        </div>

        {/* PR N safety note — visible in-product so a future admin doesn't
            mistake this surface for a multi-tenant control panel. */}
        <div
          className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex gap-3"
          data-testid="note-display-only"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/80 leading-relaxed">
            <strong className="font-semibold text-foreground">Display only.</strong> Editing these
            fields changes labels in the UI and AI prompt copy. It does <em>not</em> create a
            second tenant; the database still has one shared workspace. Keep production
            credentials limited to the primary organisation.
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field
              id="field-brand-name"
              label="Brand name"
              hint="Short display name shown in the header and footer (e.g. Aster & Spruce)."
              value={form.brandName}
              onChange={handleField("brandName")}
              required
            />
            <Field
              id="field-legal-name"
              label="Legal name"
              hint="Full legal company name used in copyright and small print (e.g. Aster & Spruce Living)."
              value={form.legalName}
              onChange={handleField("legalName")}
            />
            <Field
              id="field-brand-website"
              label="Marketing website"
              type="url"
              hint="The public marketing site (e.g. https://asterandspruceliving.ca)."
              value={form.brandWebsite}
              onChange={handleField("brandWebsite")}
            />
            <Field
              id="field-support-email"
              label="Support email"
              type="email"
              hint="Where clients can reach the team for help."
              value={form.supportEmail}
              onChange={handleField("supportEmail")}
            />
            <Field
              id="field-app-url"
              label="App URL"
              type="url"
              hint="Canonical portal URL (e.g. https://app.asl-portal.ca)."
              value={form.appUrl}
              onChange={handleField("appUrl")}
            />
            <Field
              id="field-logo-url"
              label="Logo URL"
              type="url"
              hint="Optional. URL to a header logo image."
              value={form.logoUrl}
              onChange={handleField("logoUrl")}
            />
            <Field
              id="field-primary-color"
              label="Primary colour"
              hint="Hex value like #1a3a2a. Used as a theming hook in future iterations."
              value={form.primaryColor}
              onChange={handleField("primaryColor")}
              placeholder="#1a3a2a"
            />

            <div className="pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || form.brandName.trim() === ""}
                data-testid="button-save-brand"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

function Field({ id, label, hint, value, onChange, type = "text", required, placeholder }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium block">
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={`input-${id}`}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
