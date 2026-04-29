import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ChangeOrder = {
  id: number;
  number: number;
  title: string;
  description: string | null;
  amount: string;
  status: string; // sent | approved | declined (no drafts for clients)
  sentOn: string | null;
  decidedOn: string | null;
};

interface ChangeOrdersInboxCardProps {
  projectId: number;
}

function formatAmount(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return n < 0 ? `−${formatted}` : formatted;
}

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting decision",
  approved: "Approved",
  declined: "Declined",
};

// Sort: awaiting decision first, then most-recently decided.
const STATUS_ORDER: Record<string, number> = {
  sent: 0,
  approved: 1,
  declined: 2,
};

/**
 * Client-facing change orders inbox on the Plan home.
 *
 * Shows scope changes the client needs to approve or decline, plus a short
 * trail of what they've already decided. Renders nothing when there are
 * no change orders at all — the page stays calm for projects that haven't
 * had any.
 *
 * Approve/Decline actions are inline; the API only allows the client to
 * change status from `sent` → `approved`|`declined` on their own project.
 * Server fills decidedBy and decidedOn.
 */
export function ChangeOrdersInboxCard({ projectId }: ChangeOrdersInboxCardProps) {
  const { toast } = useToast();

  const { data: changeOrders, isLoading } = useQuery<ChangeOrder[]>({
    queryKey: ["/api/projects", projectId, "change-orders"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/change-orders`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const decideMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: number;
      status: "approved" | "declined";
    }) => {
      const res = await apiRequest("PATCH", `/api/change-orders/${id}`, {
        status,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({
        title: vars.status === "approved" ? "Change order approved" : "Change order declined",
        description:
          vars.status === "approved"
            ? "Your approval is recorded and the budget is updated."
            : "Your decision is recorded.",
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "change-orders"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "budget-summary"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't record your decision",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return null;
  const all = changeOrders || [];
  if (all.length === 0) return null;

  // Sort: sent first, then approved/declined by decidedOn desc, then by number desc.
  const sorted = all.slice().sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.decidedOn && b.decidedOn) return b.decidedOn.localeCompare(a.decidedOn);
    return b.number - a.number;
  });

  const awaitingCount = sorted.filter((co) => co.status === "sent").length;

  return (
    <section
      className="px-4 md:px-8 lg:px-12 py-6"
      data-testid="change-orders-inbox-card"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold tracking-tight uppercase">
          Change orders
          {awaitingCount > 0 && (
            <span
              className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase ml-2"
              data-testid="change-orders-awaiting-count"
            >
              · {awaitingCount} awaiting you
            </span>
          )}
        </h2>
        <Link
          href={`/project/${projectId}?tab=change-orders`}
          className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground transition-colors"
          data-testid="link-all-change-orders"
        >
          View all
        </Link>
      </div>

      <ul className="divide-y divide-border/60 border-y border-border/60">
        {sorted.map((co) => {
          const awaiting = co.status === "sent";
          const isPending = decideMutation.isPending && decideMutation.variables?.id === co.id;
          return (
            <li
              key={co.id}
              className="py-3 flex items-start gap-4"
              data-testid={`change-order-row-${co.id}`}
            >
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-0.5 shrink-0 w-16">
                CO-{co.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight">
                  {co.title}
                  <span
                    className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase ml-2 tabular-nums"
                    data-testid={`change-order-amount-${co.id}`}
                  >
                    · {formatAmount(co.amount)}
                  </span>
                </div>
                {co.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {co.description}
                  </p>
                )}
                <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mt-1">
                  {STATUS_LABEL[co.status] || co.status}
                  {co.decidedOn && ` · ${co.decidedOn}`}
                  {!co.decidedOn && co.sentOn && ` · sent ${co.sentOn}`}
                </div>
              </div>
              {awaiting && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    onClick={() =>
                      decideMutation.mutate({ id: co.id, status: "approved" })
                    }
                    disabled={isPending}
                    className="h-7 px-3"
                    data-testid={`button-approve-co-${co.id}`}
                  >
                    {isPending && decideMutation.variables?.status === "approved" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      decideMutation.mutate({ id: co.id, status: "declined" })
                    }
                    disabled={isPending}
                    className="h-7 px-3"
                    data-testid={`button-decline-co-${co.id}`}
                  >
                    {isPending && decideMutation.variables?.status === "declined" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5 mr-1" />
                        Decline
                      </>
                    )}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
