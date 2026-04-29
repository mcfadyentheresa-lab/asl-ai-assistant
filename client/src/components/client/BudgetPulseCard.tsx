import { useQuery } from "@tanstack/react-query";

interface BudgetSummaryResponse {
  hidden: boolean;
  budget?: number;
  totalSpent?: number;
  approvedChangeOrders?: number;
  adjustedBudget?: number;
  status?: "no_budget" | "on_track" | "under_budget" | "over_budget";
  variancePercent?: number;
  budgetVisibleToClient?: boolean;
}

interface BudgetPulseCardProps {
  projectId: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Client-only budget overview on the Plan home.
 *
 * Renders nothing when:
 *  - the budget is hidden from the client (admin toggle)
 *  - there is no budget set yet
 *
 * Shows four figures: contract, approved change orders, spent, and
 * remaining (or over). "Remaining" is computed against the adjusted
 * budget (contract + approvedChangeOrders), so once the client signs
 * off on a change order the budget shifts here right away.
 *
 * Voice is calm and factual. No percentages, no warning colors — the
 * client sees the truth in dollars and decides for themselves how to
 * feel about it.
 */
export function BudgetPulseCard({ projectId }: BudgetPulseCardProps) {
  const { data, isLoading } = useQuery<BudgetSummaryResponse>({
    queryKey: ["/api/projects", projectId, "budget-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/budget-summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("budget-summary failed");
      return res.json();
    },
    enabled: !!projectId,
  });

  if (isLoading || !data) return null;
  if (data.hidden) return null;

  const budget = data.budget ?? 0;
  const totalSpent = data.totalSpent ?? 0;
  const approvedChangeOrders = data.approvedChangeOrders ?? 0;
  const adjustedBudget = data.adjustedBudget ?? budget + approvedChangeOrders;

  // No budget set — don't show a placeholder, just stay quiet.
  if (budget <= 0) return null;

  const remaining = adjustedBudget - totalSpent;
  const overBudget = remaining < 0;

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="budget-pulse-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Budget
        </h2>
        <span
          className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase"
          data-testid="budget-pulse-label"
        >
          Canadian dollars
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-md overflow-hidden bg-border/60 border border-border/60">
        <Figure label="Contract" value={formatCurrency(budget)} testId="budget-contract" />
        <Figure
          label="Change orders"
          value={
            approvedChangeOrders < 0
              ? `−${formatCurrency(Math.abs(approvedChangeOrders))}`
              : formatCurrency(approvedChangeOrders)
          }
          testId="budget-change-orders"
        />
        <Figure label="Spent" value={formatCurrency(totalSpent)} testId="budget-spent" />
        <Figure
          label={overBudget ? "Over" : "Remaining"}
          value={formatCurrency(Math.abs(remaining))}
          testId="budget-remaining"
        />
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="bg-card px-4 py-4">
      <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="font-mono text-2xl font-semibold tabular-nums tracking-tight mt-1"
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}
