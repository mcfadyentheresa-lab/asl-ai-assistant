import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ProjectEstimate, EstimateItem, CostCategory } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

/**
 * Client-facing read-only estimates view (PR G).
 *
 * Surfaces only estimates the admin has marked `approved` or `sent`. Drafts
 * stay invisible to clients — the server filters too, but the client also
 * defends in depth so a malformed response can't show drafts.
 *
 * Pricing display: shows the same line totals the admin sees, including
 * markup if `markupEnabled` is true. We do NOT split out unit cost vs.
 * markup — clients see the all-in number. Internal cost categories like
 * crew rates and subcontractor names are NOT shown.
 */

interface Props {
  projectId: number;
}

const CAD = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

function statusBadge(status: string | null | undefined) {
  if (status === "sent") {
    return <Badge variant="default">Sent</Badge>;
  }
  if (status === "approved") {
    return <Badge variant="secondary">Approved</Badge>;
  }
  // Defence in depth: if the server somehow returns something else,
  // don't blow up — just show the raw status.
  return <Badge variant="outline">{status ?? "—"}</Badge>;
}

function lineTotal(item: EstimateItem, markupRate: number, markupEnabled: boolean): number {
  const qty = parseFloat(item.quantity || "0") || 0;
  const unitCost = parseFloat(item.unitCost || "0") || 0;
  const materialCost = parseFloat(item.materialCost || "0") || 0;
  const base = qty * unitCost;
  const markup = markupEnabled ? materialCost * markupRate : 0;
  return base + markup;
}

export function ClientEstimatesTab({ projectId }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const {
    data: estimates,
    isLoading: loadingList,
    error: listError,
  } = useQuery<ProjectEstimate[]>({
    queryKey: [`/api/client/projects/${projectId}/estimates`],
    enabled: Number.isFinite(projectId) && projectId > 0,
  });

  // Categories are admin-curated labels (e.g. "Flooring — Hardwood"). Safe
  // to share with clients; this is the same list shown on the planning board.
  const { data: categories } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  if (loadingList) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="client-estimates-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (listError) {
    return (
      <Card data-testid="client-estimates-error">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          We couldn&apos;t load your estimates right now. Please try again in a minute.
        </CardContent>
      </Card>
    );
  }

  const visible = (estimates ?? []).filter(
    (e) => e.status === "approved" || e.status === "sent"
  );

  if (visible.length === 0) {
    return (
      <Card data-testid="client-estimates-empty">
        <CardContent className="py-12 flex flex-col items-center justify-center text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No estimates yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Once your project manager shares an estimate with you, it will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (selectedId != null) {
    return (
      <ClientEstimateDetail
        estimateId={selectedId}
        categories={categories ?? []}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="client-estimates-list">
      {visible.map((est) => (
        <Card
          key={est.id}
          className="cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setSelectedId(est.id)}
          data-testid={`client-estimate-card-${est.id}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm font-medium truncate">
                  {est.name || `Estimate #${est.id}`}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {est.sentAt
                    ? `Sent ${new Date(est.sentAt).toLocaleDateString("en-CA")}`
                    : est.approvedAt
                    ? `Approved ${new Date(est.approvedAt).toLocaleDateString("en-CA")}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(est.status)}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

interface DetailProps {
  estimateId: number;
  categories: CostCategory[];
  onBack: () => void;
}

function ClientEstimateDetail({ estimateId, categories, onBack }: DetailProps) {
  const { data: estimate, isLoading: loadingEst, error: estError } = useQuery<ProjectEstimate>({
    queryKey: [`/api/client/estimates/${estimateId}`],
  });
  const { data: items, isLoading: loadingItems } = useQuery<EstimateItem[]>({
    queryKey: [`/api/client/estimates/${estimateId}/items`],
    enabled: !!estimate,
  });

  if (loadingEst || loadingItems) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="client-estimate-detail-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (estError || !estimate) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-3">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <p>This estimate is no longer available.</p>
        </CardContent>
      </Card>
    );
  }

  const markupEnabled = !!estimate.markupEnabled;
  const markupRate = parseFloat(estimate.markupPercent || "25") / 100;
  const list = items ?? [];

  // Group by room when present, otherwise by category name. Same grouping
  // logic as the admin view, but read-only and without internal cost split.
  const groups = new Map<string, EstimateItem[]>();
  for (const item of list) {
    const cat = categories.find((c) => c.id === item.categoryId);
    const groupKey = item.room?.trim() || cat?.name || item.customCategory || "Other";
    const arr = groups.get(groupKey) ?? [];
    arr.push(item);
    groups.set(groupKey, arr);
  }

  let runningTotal = 0;
  for (const item of list) runningTotal += lineTotal(item, markupRate, markupEnabled);

  const contingencyPct = parseFloat(estimate.contingencyPercent || "0") || 0;
  const contingency = runningTotal * (contingencyPct / 100);
  const mgmtEnabled = !!estimate.managementFeeEnabled;
  const mgmtPct = parseFloat(estimate.managementFeePercent || "0") || 0;
  const mgmtFee = mgmtEnabled ? runningTotal * (mgmtPct / 100) : 0;
  const grandTotal = runningTotal + contingency + mgmtFee;

  return (
    <div className="space-y-4" data-testid="client-estimate-detail">
      <Button variant="ghost" size="sm" onClick={onBack} data-testid="client-estimate-back">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to estimates
      </Button>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold truncate">
                {estimate.name || `Estimate #${estimate.id}`}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {estimate.sentAt
                  ? `Sent ${new Date(estimate.sentAt).toLocaleDateString("en-CA")}`
                  : estimate.approvedAt
                  ? `Approved ${new Date(estimate.approvedAt).toLocaleDateString("en-CA")}`
                  : ""}
              </p>
            </div>
            {statusBadge(estimate.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...groups.entries()].map(([groupName, groupItems]) => {
            const groupSubtotal = groupItems.reduce(
              (acc, it) => acc + lineTotal(it, markupRate, markupEnabled),
              0
            );
            return (
              <ClientEstimateGroup
                key={groupName}
                name={groupName}
                items={groupItems}
                subtotal={groupSubtotal}
                categories={categories}
                markupRate={markupRate}
                markupEnabled={markupEnabled}
              />
            );
          })}

          <div className="border-t pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span data-testid="client-estimate-subtotal">{CAD(runningTotal)}</span>
            </div>
            {contingencyPct > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Contingency ({contingencyPct}%)</span>
                <span>{CAD(contingency)}</span>
              </div>
            )}
            {mgmtEnabled && mgmtPct > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Project management ({mgmtPct}%)</span>
                <span>{CAD(mgmtFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base pt-1 border-t">
              <span>Total (CAD)</span>
              <span data-testid="client-estimate-total">{CAD(grandTotal)}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground pt-2">
            All amounts in Canadian dollars. Estimate only — final invoice may vary
            based on selections, change orders, and actual material pricing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface GroupProps {
  name: string;
  items: EstimateItem[];
  subtotal: number;
  categories: CostCategory[];
  markupRate: number;
  markupEnabled: boolean;
}

function ClientEstimateGroup({ name, items, subtotal, categories, markupRate, markupEnabled }: GroupProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg" data-testid={`client-estimate-group-${name}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {name}
        </span>
        <span className="text-muted-foreground tabular-nums">{CAD(subtotal)}</span>
      </button>
      {open && (
        <div className="divide-y border-t">
          {items.map((it) => {
            const cat = categories.find((c) => c.id === it.categoryId);
            const label = cat?.name || it.customCategory || "Item";
            const total = lineTotal(it, markupRate, markupEnabled);
            return (
              <div
                key={it.id}
                className="px-3 py-2 flex items-start justify-between gap-3 text-sm"
                data-testid={`client-estimate-line-${it.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.quantity} {it.unitType}
                    {it.notes ? ` · ${it.notes}` : ""}
                  </p>
                </div>
                <div className="tabular-nums shrink-0">{CAD(total)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
