import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
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
        <CardContent className="p-5 flex justify-center">
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
  const isEmpty = budget === 0 && status === "no_budget";

  const usedPercent = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const barColor =
    status === "over_budget" ? "bg-destructive" :
    status === "under_budget" ? "bg-primary" :
    status === "on_track" ? "bg-primary" :
    "bg-muted-foreground";

  const renderVisibilityToggle = () => (
    userRole !== "admin" ? null : (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => toggleVisibility.mutate(!budgetVisibleToClient)}
            disabled={toggleVisibility.isPending}
            aria-pressed={budgetVisibleToClient}
            aria-label={budgetVisibleToClient ? "Hide budget from client" : "Show budget to client"}
            className={`inline-flex items-center justify-center h-11 w-11 -m-2 rounded-md transition-colors ${budgetVisibleToClient ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-foreground/[0.06]"}`}
            data-testid="button-budget-visibility"
          >
            {budgetVisibleToClient ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {budgetVisibleToClient ? "Visible to client — tap to hide" : "Hidden from client — tap to show"}
        </TooltipContent>
      </Tooltip>
    )
  );

  return (
    <Card data-testid="card-budget-snapshot">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-sans text-base font-semibold flex items-center gap-2" data-testid="text-budget-heading">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Budget
          </CardTitle>
          {renderVisibilityToggle()}
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-4">
        {isEmpty ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">No budget set yet.</p>
            {userRole === "admin" && (
              <Link href={`/project/${projectId}/estimate`}>
                <Button size="sm" variant="outline" className="h-11 px-3" data-testid="link-setup-budget">
                  Set budget
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Budget</p>
                <p className="font-mono text-lg font-semibold text-foreground tabular-nums" data-testid="text-budget-total">{formatCurrency(budget)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">Spent</p>
                <p className="font-mono text-lg font-semibold text-foreground tabular-nums" data-testid="text-budget-spent">{formatCurrency(totalSpent)}</p>
              </div>
            </div>
            {budget > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>Usage</span>
                  <span className="tabular-nums">{usedPercent.toFixed(0)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden" data-testid="progress-budget">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(usedPercent, 100)}%` }}
                  />
                </div>
                {status === "over_budget" && (
                  <p className="text-xs text-destructive font-medium" data-testid="text-over-budget-warning">
                    {formatCurrency(totalSpent - budget)} over
                  </p>
                )}
                {status === "under_budget" && (
                  <p className="text-xs text-primary" data-testid="text-under-budget-info">
                    {formatCurrency(budget - totalSpent)} remaining
                  </p>
                )}
              </div>
            )}
            {userRole === "admin" && (
              <Link href={`/project/${projectId}/estimate`}>
                <Button variant="ghost" size="sm" className="w-full justify-start h-11 px-2 text-xs text-muted-foreground hover:text-foreground" data-testid="link-view-cost-estimator">
                  Open cost estimator →
                </Button>
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
