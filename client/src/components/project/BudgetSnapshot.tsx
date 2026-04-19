import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, DollarSign, Check, TrendingDown, TrendingUp, Minus, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(amount);
}

interface BudgetSummaryResponse {
  hidden: boolean;
  budget?: number;
  totalSpent?: number;
  status?: "no_budget" | "on_track" | "under_budget" | "over_budget";
  variancePercent?: number;
  budgetVisibleToClient?: boolean;
}

interface BudgetSnapshotProps {
  projectId: number;
  userRole: string;
}

export function BudgetSnapshot({ projectId, userRole }: BudgetSnapshotProps) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<BudgetSummaryResponse>({
    queryKey: ["/api/projects", projectId, "budget-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/budget-summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget summary");
      return res.json();
    },
  });

  const toggleVisibility = useMutation({
    mutationFn: async (visible: boolean) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}/budget-visibility`, { visible });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget-summary"] });
      toast({ title: data?.budgetVisibleToClient ? "Budget hidden from client" : "Budget visible to client" });
    },
    onError: () => toast({ title: "Failed to toggle visibility", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" data-testid="loader-budget" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (userRole === "crew") return null;

  const budgetVisibleToClient = data.budgetVisibleToClient ?? false;
  if (userRole === "client" && !budgetVisibleToClient) return null;

  const budget = data.budget ?? 0;
  const totalSpent = data.totalSpent ?? 0;
  const status = data.status ?? "no_budget";
  const variancePercent = data.variancePercent ?? 0;

  if (budget === 0 && status === "no_budget") {
    return (
      <Card data-testid="card-budget-snapshot-empty">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg flex items-center gap-2" data-testid="text-budget-heading">
            <DollarSign className="h-4 w-4" /> Budget Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">No budget set yet.</p>
          {userRole === "admin" && (
            <Link href={`/project/${projectId}/estimate`}>
              <Button variant="link" size="sm" className="px-0 mt-1" data-testid="link-setup-budget">
                Set up in Cost Estimator
              </Button>
            </Link>
          )}
          {userRole === "admin" && (
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <label htmlFor="budget-visibility-toggle-empty" className="text-xs text-muted-foreground flex items-center gap-1.5">
                {budgetVisibleToClient ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Visible to client
              </label>
              <Switch
                id="budget-visibility-toggle-empty"
                checked={budgetVisibleToClient}
                onCheckedChange={(checked) => toggleVisibility.mutate(checked)}
                disabled={toggleVisibility.isPending}
                data-testid="switch-budget-visibility-empty"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const usedPercent = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;

  const statusConfig: Record<string, { label: string; color: string; icon: typeof Check; barColor: string }> = {
    on_track: { label: "On Track", color: "text-green-600", icon: Check, barColor: "bg-green-500" },
    under_budget: { label: "Under Budget", color: "text-green-600", icon: TrendingDown, barColor: "bg-green-500" },
    over_budget: { label: "Over Budget", color: "text-red-600", icon: TrendingUp, barColor: "bg-red-500" },
    no_budget: { label: "No Budget Set", color: "text-muted-foreground", icon: Minus, barColor: "bg-muted-foreground" },
  };
  const sc = statusConfig[status] || statusConfig.no_budget;
  const StatusIcon = sc.icon;

  return (
    <Card data-testid="card-budget-snapshot">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-serif text-lg flex items-center gap-2" data-testid="text-budget-heading">
            <DollarSign className="h-4 w-4" /> Budget Snapshot
          </CardTitle>
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border ${budgetVisibleToClient ? "bg-sky-500/15 text-sky-700 border-sky-500/30" : sc.color}`} data-testid="badge-budget-status">
            <StatusIcon className="h-3.5 w-3.5" />
            {sc.label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Budget</p>
            <p className="text-lg font-semibold tabular-nums" data-testid="text-budget-total">{formatCurrency(budget)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Spent</p>
            <p className="text-lg font-semibold tabular-nums" data-testid="text-budget-spent">{formatCurrency(totalSpent)}</p>
          </div>
        </div>

        {budget > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Budget usage</span>
              <span className="tabular-nums">{usedPercent.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden" data-testid="progress-budget">
              <div
                className={`h-full rounded-full transition-all duration-500 ${sc.barColor}`}
                style={{ width: `${Math.min(usedPercent, 100)}%` }}
              />
            </div>
            {status === "over_budget" && (
              <p className="text-xs text-red-600 font-medium" data-testid="text-over-budget-warning">
                {Math.abs(variancePercent).toFixed(1)}% over budget ({formatCurrency(totalSpent - budget)} over)
              </p>
            )}
            {status === "under_budget" && (
              <p className="text-xs text-green-600" data-testid="text-under-budget-info">
                {formatCurrency(budget - totalSpent)} remaining
              </p>
            )}
          </div>
        )}

        {userRole === "admin" && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <label htmlFor="budget-visibility-toggle" className="text-xs text-muted-foreground flex items-center gap-1.5">
              {budgetVisibleToClient ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Visible to client
            </label>
            <Switch
              id="budget-visibility-toggle"
              checked={budgetVisibleToClient}
              onCheckedChange={(checked) => toggleVisibility.mutate(checked)}
              disabled={toggleVisibility.isPending}
              data-testid="switch-budget-visibility"
            />
          </div>
        )}

        {userRole === "admin" && (
          <Link href={`/project/${projectId}/estimate`}>
            <Button variant="outline" size="sm" className="w-full gap-1.5" data-testid="link-view-cost-estimator">
              <ExternalLink className="h-3.5 w-3.5" />
              View in Cost Estimator
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
