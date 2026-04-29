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
import {
  Plus,
  Loader2,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SiteVisitRecord = {
  id: number;
  projectId: number;
  visitedOn: string;
  visitType: string;
  attendees: string | null;
  summary: string;
  followUps: string | null;
  weather: string | null;
  archived: boolean | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  creator: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

const TYPE_OPTIONS = [
  { value: "walkthrough", label: "Walkthrough" },
  { value: "inspection", label: "Inspection" },
  { value: "milestone", label: "Milestone" },
  { value: "routine", label: "Routine" },
];

const TYPE_LABEL: Record<string, string> = TYPE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<string, string>,
);

interface SiteVisitsTabProps {
  projectId: number;
  userRole: string; // "admin" | "crew" | "client"
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  visitedOn: todayISO(),
  visitType: "routine",
  attendees: "",
  summary: "",
  followUps: "",
  weather: "",
};

export function SiteVisitsTab({ projectId, userRole }: SiteVisitsTabProps) {
  const { toast } = useToast();
  const canEdit = userRole === "admin" || userRole === "crew";

  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const { data: visits, isLoading } = useQuery<SiteVisitRecord[]>({
    queryKey: ["/api/projects", projectId, "site-visits", { includeArchived: canEdit }],
    queryFn: async () => {
      const params = canEdit ? "?includeArchived=1" : "";
      const res = await fetch(
        `/api/projects/${projectId}/site-visits${params}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const payload: Record<string, unknown> = {
        visitedOn: data.visitedOn,
        visitType: data.visitType,
        summary: data.summary.trim(),
      };
      if (data.attendees.trim()) payload.attendees = data.attendees.trim();
      if (data.followUps.trim()) payload.followUps = data.followUps.trim();
      if (data.weather.trim()) payload.weather = data.weather.trim();
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/site-visits`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Site visit logged",
        description: "Saved to the project's site visit log.",
      });
      setOpen(false);
      setShowMore(false);
      setForm({ ...EMPTY_FORM, visitedOn: todayISO() });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "site-visits"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save site visit",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const res = await apiRequest("PATCH", `/api/site-visits/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "site-visits"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update site visit",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const formValid =
    form.visitedOn.trim().length > 0 &&
    form.summary.trim().length > 0 &&
    !!form.visitType;

  // Sort: visitedOn desc, then id desc (server already does this; keep stable on client)
  const sorted = useMemo(() => {
    return (visits || []).slice().sort((a, b) => {
      const at = a.visitedOn || "";
      const bt = b.visitedOn || "";
      if (at !== bt) return bt.localeCompare(at);
      return b.id - a.id;
    });
  }, [visits]);

  return (
    <div className="space-y-5" data-testid="site-visits-tab">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Site visits</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            What happened on site, day by day. Walkthroughs, inspections,
            milestones, and routine check-ins. Visible to the client.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="button-add-site-visit"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Log a visit
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
            No site visits yet.
            {canEdit && (
              <span className="block mt-2">
                Log a visit after each time someone's on site. The client sees
                the same record as you do.
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="site-visits-list">
          {sorted.map((v) => {
            const who = v.creator
              ? `${v.creator.firstName || ""} ${v.creator.lastName || ""}`.trim()
              : null;
            return (
              <li key={v.id}>
                <Card
                  className={v.archived ? "opacity-60" : ""}
                  data-testid={`site-visit-card-${v.id}`}
                >
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] tracking-[0.14em] uppercase tabular-nums no-default-hover-elevate no-default-active-elevate"
                            data-testid={`badge-visit-date-${v.id}`}
                          >
                            {v.visitedOn}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                          >
                            {TYPE_LABEL[v.visitType] || v.visitType}
                          </Badge>
                          {v.archived && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        {v.attendees && (
                          <p className="text-xs text-muted-foreground mt-1">
                            With {v.attendees}
                          </p>
                        )}
                        <p className="text-sm mt-2 whitespace-pre-wrap">
                          {v.summary}
                        </p>
                        {v.followUps && (
                          <div className="mt-2">
                            <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                              Follow-ups
                            </div>
                            <p className="text-sm mt-0.5 whitespace-pre-wrap">
                              {v.followUps}
                            </p>
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Select
                            value={v.visitType}
                            onValueChange={(val) =>
                              updateMutation.mutate({
                                id: v.id,
                                patch: { visitType: val },
                              })
                            }
                            disabled={updateMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-7 w-[120px] text-xs"
                              data-testid={`select-visit-type-${v.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TYPE_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                >
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateMutation.mutate({
                                id: v.id,
                                patch: { archived: !v.archived },
                              })
                            }
                            disabled={updateMutation.isPending}
                            aria-label={
                              v.archived ? "Restore site visit" : "Archive site visit"
                            }
                            data-testid={`button-archive-visit-${v.id}`}
                          >
                            {v.archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-1">
                      {v.weather && <>{v.weather}</>}
                      {v.weather && who ? " · " : ""}
                      {who && `logged by ${who}`}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setShowMore(false);
              setForm({ ...EMPTY_FORM, visitedOn: todayISO() });
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log a site visit</DialogTitle>
              <DialogDescription>
                Date, who was there, what was covered. Anything else can wait.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="visit-date">Date</Label>
                  <Input
                    id="visit-date"
                    type="date"
                    value={form.visitedOn}
                    onChange={(e) =>
                      setForm({ ...form, visitedOn: e.target.value })
                    }
                    data-testid="input-visit-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visit-type">Type</Label>
                  <Select
                    value={form.visitType}
                    onValueChange={(val) =>
                      setForm({ ...form, visitType: val })
                    }
                  >
                    <SelectTrigger
                      id="visit-type"
                      data-testid="select-visit-form-type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit-attendees">Who was there</Label>
                <Input
                  id="visit-attendees"
                  placeholder="e.g. Claire, Theresa, Diego (electrician)"
                  value={form.attendees}
                  onChange={(e) =>
                    setForm({ ...form, attendees: e.target.value })
                  }
                  data-testid="input-visit-attendees"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit-summary">What we covered</Label>
                <Textarea
                  id="visit-summary"
                  placeholder="Walked the framing, confirmed window placement on the south wall."
                  rows={4}
                  value={form.summary}
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                  data-testid="input-visit-summary"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                className="flex items-center gap-1 text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors pt-1"
                data-testid="toggle-visit-more"
              >
                {showMore ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                More detail
              </button>

              {showMore && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="visit-followups">Follow-ups</Label>
                    <Textarea
                      id="visit-followups"
                      placeholder="Action items emerging from this visit."
                      rows={2}
                      value={form.followUps}
                      onChange={(e) =>
                        setForm({ ...form, followUps: e.target.value })
                      }
                      data-testid="input-visit-followups"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="visit-weather">Weather</Label>
                    <Input
                      id="visit-weather"
                      placeholder="e.g. clear, +12°C"
                      value={form.weather}
                      onChange={(e) =>
                        setForm({ ...form, weather: e.target.value })
                      }
                      data-testid="input-visit-weather"
                    />
                  </div>
                </div>
              )}
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
                data-testid="button-save-site-visit"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save visit"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
