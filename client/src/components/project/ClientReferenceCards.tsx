import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

interface ProjectLike {
  id: number;
  name: string;
  clientId?: string | null;
}

interface UserLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
}

interface BudgetSummaryResponse {
  hidden: boolean;
  budget?: number;
  totalSpent?: number;
  status?: "no_budget" | "on_track" | "under_budget" | "over_budget";
  variancePercent?: number;
  budgetVisibleToClient?: boolean;
}

interface ClientReferenceCardsProps {
  project: ProjectLike;
  users: UserLike[] | undefined;
}

const MONO_LABEL_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
};

function formatNamesList(names: string[]): string {
  if (names.length === 0) return "—";
  if (names.length <= 3) return names.join(", ");
  const head = names.slice(0, 2).join(", ");
  return `${head} & ${names.length - 2} others`;
}

function CardShell({
  label,
  value,
  sub,
  bar,
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  bar?: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-5 min-h-[140px]"
      data-testid={testId}
    >
      <div
        className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
        style={MONO_LABEL_STYLE}
      >
        {label}
      </div>
      <div className="text-lg font-semibold tracking-tight text-foreground leading-tight">
        {value}
      </div>
      {bar}
      {sub ? (
        <div className="mt-auto text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

export function ClientReferenceCards({ project, users }: ClientReferenceCardsProps) {
  // Reuses the same endpoint as BudgetSnapshot so numbers agree. No new query types.
  const { data: budget } = useQuery<BudgetSummaryResponse>({
    queryKey: ["/api/projects", project.id, "budget-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/budget-summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch budget summary");
      return res.json();
    },
  });

  const budgetVisibleToClient = budget?.budgetVisibleToClient ?? false;
  const budgetAmount = budget?.budget ?? 0;
  const budgetSpent = budget?.totalSpent ?? 0;
  const budgetPercent =
    budgetAmount > 0 ? (budgetSpent / budgetAmount) * 100 : 0;
  const isOverBudget = budgetPercent > 100;
  const showBudgetCard = budgetVisibleToClient && budgetAmount > 0;

  // TODO(reference-cards): wire to checklist/decision data once exposed at the
  // page level. ProjectDetails currently only loads decisions inside nested
  // tab components, so the parent doesn't have the count to pass down.
  const decisionsAwaiting = null as number | null;
  const nextDecisionLabel = null as string | null;

  // TODO(reference-cards): wire to documents query once exposed at the page
  // level. ProjectDetails only loads documents inside the Documents tab.
  const documentsCount = null as number | null;
  const latestDocumentName = null as string | null;

  const team: UserLike[] = (() => {
    if (!users) return [];
    const roster = users.filter(
      (u) =>
        u.id !== project.clientId &&
        (u.role === "admin" || u.role === "crew"),
    );
    // Stable ordering: admins first (project lead bias), then crew, by first name.
    return [...roster].sort((a, b) => {
      const roleOrder = (r?: string | null) => (r === "admin" ? 0 : 1);
      const ra = roleOrder(a.role);
      const rb = roleOrder(b.role);
      if (ra !== rb) return ra - rb;
      return (a.firstName || "").localeCompare(b.firstName || "");
    });
  })();
  const teamFirstNames = team
    .map((u) => u.firstName?.trim())
    .filter((n): n is string => Boolean(n));
  const primaryContact = team[0];
  const primaryContactSub =
    primaryContact && primaryContact.firstName
      ? `${primaryContact.firstName} · ${
          primaryContact.role === "admin" ? "Lead designer" : "On the crew"
        }`
      : null;

  return (
    <section
      aria-label="Project reference"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      data-testid="client-reference-cards"
    >
      <CardShell
        testId="card-decisions-awaiting"
        label="Decisions awaiting"
        value={decisionsAwaiting !== null ? String(decisionsAwaiting) : "—"}
        sub={nextDecisionLabel}
      />

      {showBudgetCard ? (
        <CardShell
          testId="card-budget"
          label="Budget"
          value={
            <span style={MONO_LABEL_STYLE} className="tabular-nums">
              {Math.round(budgetPercent)}%
            </span>
          }
          bar={
            <div
              className="h-[3px] w-full overflow-hidden rounded-full bg-muted"
              data-testid="card-budget-bar"
            >
              <span
                className="block h-full"
                style={{
                  width: `${Math.min(budgetPercent, 100)}%`,
                  background: isOverBudget
                    ? "var(--destructive)"
                    : "var(--primary)",
                }}
              />
            </div>
          }
          sub={null}
        />
      ) : null}

      <CardShell
        testId="card-documents"
        label="Documents"
        value={documentsCount !== null ? String(documentsCount) : "—"}
        sub={
          latestDocumentName
            ? `Latest: ${latestDocumentName.length > 28 ? latestDocumentName.slice(0, 27) + "…" : latestDocumentName}`
            : null
        }
      />

      <CardShell
        testId="card-your-team"
        label="Your team"
        value={formatNamesList(teamFirstNames)}
        sub={primaryContactSub}
      />
    </section>
  );
}
