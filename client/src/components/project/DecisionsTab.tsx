import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Archive, ArchiveRestore } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DecisionRecord = {
  id: number;
  projectId: number;
  title: string;
  decision: string;
  context: string | null;
  decidedOn: string;
  decidedBy: string | null;
  category: string | null;
  relatedMilestoneId: number | null;
  attachmentPhotoId: number | null;
  archived: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  decidedByUser: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

const CATEGORY_OPTIONS = [
  { value: "finishes", label: "Finishes" },
  { value: "schedule", label: "Schedule" },
  { value: "scope", label: "Scope" },
  { value: "budget", label: "Budget" },
  { value: "materials", label: "Materials" },
  { value: "other", label: "Other" },
];

interface DecisionsTabProps {
  projectId: number;
  userRole: string; // "admin" | "crew" | "client"
}

export function DecisionsTab({ projectId, userRole }: DecisionsTabProps) {
  const { toast } = useToast();
  const canEdit = userRole === "admin" || userRole === "crew";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    decision: "",
    context: "",
    decidedOn: new Date().toISOString().slice(0, 10),
    category: "",
  });

  const { data: decisions, isLoading } = useQuery<DecisionRecord[]>({
    queryKey: ["/api/projects", projectId, "decisions"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/decisions`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload: Record<string, unknown> = {
        title: data.title.trim(),
        decision: data.decision.trim(),
        decidedOn: data.decidedOn,
      };
      if (data.context.trim()) payload.context = data.context.trim();
      if (data.category) payload.category = data.category;
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/decisions`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Decision recorded",
        description: "Saved to the project's decisions log.",
      });
      setOpen(false);
      setForm({
        title: "",
        decision: "",
        context: "",
        decidedOn: new Date().toISOString().slice(0, 10),
        category: "",
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "decisions"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save decision",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      const res = await apiRequest("PATCH", `/api/decisions/${id}`, {
        archived,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({
        title: vars.archived ? "Decision archived" : "Decision restored",
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "decisions"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update decision",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const formValid = form.title.trim().length > 0 && form.decision.trim().length > 0 && !!form.decidedOn;

  const sorted = useMemo(() => {
    return (decisions || []).slice().sort((a, b) => {
      const ad = a.decidedOn || "";
      const bd = b.decidedOn || "";
      return bd.localeCompare(ad);
    });
  }, [decisions]);

  return (
    <div className="space-y-5" data-testid="decisions-tab">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Decisions</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            A permanent record of choices made on this project. Most recent first.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="button-record-decision"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Record decision
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No decisions recorded yet.
            {canEdit && (
              <span className="block mt-2">
                When something is settled — finishes, scope, schedule — record it here so
                the project has a clean record.
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="decisions-list">
          {sorted.map((d) => {
            const who = d.decidedByUser
              ? `${d.decidedByUser.firstName || ""} ${d.decidedByUser.lastName || ""}`.trim()
              : null;
            return (
              <li key={d.id}>
                <Card
                  className={d.archived ? "opacity-60" : ""}
                  data-testid={`decision-card-${d.id}`}
                >
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold tracking-tight">
                            {d.title}
                          </h3>
                          {d.category && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                            >
                              {d.category}
                            </Badge>
                          )}
                          {d.archived && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">
                          {d.decision}
                        </p>
                        {d.context && (
                          <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                            {d.context}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() =>
                            archiveMutation.mutate({
                              id: d.id,
                              archived: !d.archived,
                            })
                          }
                          disabled={archiveMutation.isPending}
                          aria-label={d.archived ? "Restore decision" : "Archive decision"}
                          data-testid={`button-archive-decision-${d.id}`}
                        >
                          {d.archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-1">
                      {d.decidedOn}
                      {who ? ` · ${who}` : ""}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record a decision</DialogTitle>
              <DialogDescription>
                A short, permanent entry. Visible to the client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dec-title">Title</Label>
                <Input
                  id="dec-title"
                  placeholder="e.g. Cabinet hardware"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  data-testid="input-decision-title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dec-decision">Decision</Label>
                <Textarea
                  id="dec-decision"
                  placeholder="What was decided. Be specific."
                  rows={3}
                  value={form.decision}
                  onChange={(e) => setForm({ ...form, decision: e.target.value })}
                  data-testid="input-decision-text"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dec-context">Context (optional)</Label>
                <Textarea
                  id="dec-context"
                  placeholder="Why, where it came up, alternatives considered."
                  rows={2}
                  value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}
                  data-testid="input-decision-context"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dec-date">Decided on</Label>
                  <Input
                    id="dec-date"
                    type="date"
                    value={form.decidedOn}
                    onChange={(e) =>
                      setForm({ ...form, decidedOn: e.target.value })
                    }
                    data-testid="input-decision-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dec-category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger
                      id="dec-category"
                      data-testid="select-decision-category"
                    >
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!formValid || createMutation.isPending}
                data-testid="button-save-decision"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save decision"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
