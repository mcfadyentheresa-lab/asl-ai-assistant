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
import { Plus, Loader2, Archive, ArchiveRestore, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SelectionRecord = {
  id: number;
  projectId: number;
  room: string | null;
  category: string | null;
  item: string;
  product: string | null;
  vendor: string | null;
  sku: string | null;
  quantity: string | null;
  status: string;
  leadTimeDays: number | null;
  orderedOn: string | null;
  expectedOn: string | null;
  installedOn: string | null;
  notes: string | null;
  attachmentPhotoId: number | null;
  relatedDecisionId: number | null;
  archived: boolean | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  creator: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

const STATUS_OPTIONS = [
  { value: "proposed", label: "Proposed" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
];

const CATEGORY_OPTIONS = [
  { value: "plumbing", label: "Plumbing" },
  { value: "hardware", label: "Hardware" },
  { value: "tile", label: "Tile" },
  { value: "lighting", label: "Lighting" },
  { value: "appliances", label: "Appliances" },
  { value: "millwork", label: "Millwork" },
  { value: "paint", label: "Paint" },
  { value: "flooring", label: "Flooring" },
  { value: "other", label: "Other" },
];

// Order used both for grouping and for the visual progress weight
const STATUS_ORDER: Record<string, number> = {
  proposed: 0,
  approved: 1,
  ordered: 2,
  installed: 3,
};

interface SelectionsTabProps {
  projectId: number;
  userRole: string; // "admin" | "crew" | "client"
}

const EMPTY_FORM = {
  room: "",
  category: "",
  item: "",
  product: "",
  vendor: "",
  sku: "",
  quantity: "",
  status: "proposed",
  leadTimeDays: "",
  orderedOn: "",
  expectedOn: "",
  installedOn: "",
  notes: "",
};

export function SelectionsTab({ projectId, userRole }: SelectionsTabProps) {
  const { toast } = useToast();
  const canEdit = userRole === "admin" || userRole === "crew";

  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const { data: selections, isLoading } = useQuery<SelectionRecord[]>({
    queryKey: ["/api/projects", projectId, "selections"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/selections`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const payload: Record<string, unknown> = {
        item: data.item.trim(),
        status: data.status,
      };
      if (data.room.trim()) payload.room = data.room.trim();
      if (data.category) payload.category = data.category;
      if (data.product.trim()) payload.product = data.product.trim();
      if (data.vendor.trim()) payload.vendor = data.vendor.trim();
      if (data.sku.trim()) payload.sku = data.sku.trim();
      if (data.quantity.trim()) payload.quantity = data.quantity.trim();
      if (data.leadTimeDays.trim()) {
        const n = Number(data.leadTimeDays);
        if (!Number.isNaN(n)) payload.leadTimeDays = n;
      }
      if (data.orderedOn) payload.orderedOn = data.orderedOn;
      if (data.expectedOn) payload.expectedOn = data.expectedOn;
      if (data.installedOn) payload.installedOn = data.installedOn;
      if (data.notes.trim()) payload.notes = data.notes.trim();
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/selections`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Selection added",
        description: "Saved to the project's selections ledger.",
      });
      setOpen(false);
      setShowMore(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "selections"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save selection",
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
      const res = await apiRequest("PATCH", `/api/selections/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "selections"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update selection",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const formValid = form.item.trim().length > 0 && !!form.status;

  // Sort: by status weight ASC (proposed first → installed last), then by updatedAt desc
  const sorted = useMemo(() => {
    return (selections || []).slice().sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    });
  }, [selections]);

  return (
    <div className="space-y-5" data-testid="selections-tab">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Selections</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Items being specified, ordered, and installed. Visible to the client.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="button-add-selection"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add selection
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
            No selections yet.
            {canEdit && (
              <span className="block mt-2">
                Add finishes, fixtures, and materials as they're chosen — the
                client sees the same list, with status as it progresses.
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="selections-list">
          {sorted.map((s) => {
            const who = s.creator
              ? `${s.creator.firstName || ""} ${s.creator.lastName || ""}`.trim()
              : null;
            const meta = [s.room, s.category]
              .filter(Boolean)
              .join(" · ");
            const dates = [
              s.orderedOn ? `ordered ${s.orderedOn}` : null,
              s.expectedOn ? `expected ${s.expectedOn}` : null,
              s.installedOn ? `installed ${s.installedOn}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={s.id}>
                <Card
                  className={s.archived ? "opacity-60" : ""}
                  data-testid={`selection-card-${s.id}`}
                >
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold tracking-tight">
                            {s.item}
                          </h3>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                          >
                            {s.status}
                          </Badge>
                          {s.archived && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        {(s.product || s.vendor) && (
                          <p className="text-sm mt-1">
                            {s.product}
                            {s.product && s.vendor ? " · " : ""}
                            {s.vendor && (
                              <span className="text-muted-foreground">
                                {s.vendor}
                              </span>
                            )}
                          </p>
                        )}
                        {(s.sku || s.quantity || s.leadTimeDays != null) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {[
                              s.sku ? `SKU ${s.sku}` : null,
                              s.quantity ? `Qty ${s.quantity}` : null,
                              s.leadTimeDays != null
                                ? `${s.leadTimeDays} day lead`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {s.notes && (
                          <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                            {s.notes}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Select
                            value={s.status}
                            onValueChange={(v) =>
                              updateMutation.mutate({
                                id: s.id,
                                patch: { status: v },
                              })
                            }
                            disabled={updateMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-7 w-[120px] text-xs"
                              data-testid={`select-status-${s.id}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
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
                                id: s.id,
                                patch: { archived: !s.archived },
                              })
                            }
                            disabled={updateMutation.isPending}
                            aria-label={
                              s.archived
                                ? "Restore selection"
                                : "Archive selection"
                            }
                            data-testid={`button-archive-selection-${s.id}`}
                          >
                            {s.archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-1">
                      {meta}
                      {meta && (dates || who) ? " · " : ""}
                      {dates}
                      {dates && who ? " · " : ""}
                      {who}
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
              setForm(EMPTY_FORM);
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a selection</DialogTitle>
              <DialogDescription>
                Item, vendor, status. Detail can be filled in later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sel-item">Item</Label>
                <Input
                  id="sel-item"
                  placeholder="e.g. Kitchen faucet"
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  data-testid="input-selection-item"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sel-room">Room</Label>
                  <Input
                    id="sel-room"
                    placeholder="e.g. Kitchen"
                    value={form.room}
                    onChange={(e) =>
                      setForm({ ...form, room: e.target.value })
                    }
                    data-testid="input-selection-room"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sel-category">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger
                      id="sel-category"
                      data-testid="select-selection-category"
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
              <div className="space-y-1.5">
                <Label htmlFor="sel-product">Product</Label>
                <Input
                  id="sel-product"
                  placeholder="e.g. Brizo Litze, matte black"
                  value={form.product}
                  onChange={(e) =>
                    setForm({ ...form, product: e.target.value })
                  }
                  data-testid="input-selection-product"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sel-vendor">Vendor</Label>
                  <Input
                    id="sel-vendor"
                    placeholder="e.g. Robinson Lighting & Bath"
                    value={form.vendor}
                    onChange={(e) =>
                      setForm({ ...form, vendor: e.target.value })
                    }
                    data-testid="input-selection-vendor"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sel-status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger
                      id="sel-status"
                      data-testid="select-selection-status"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="flex items-center gap-1 text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors pt-1"
                data-testid="toggle-selection-more"
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-sku">SKU</Label>
                      <Input
                        id="sel-sku"
                        value={form.sku}
                        onChange={(e) =>
                          setForm({ ...form, sku: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-qty">Quantity</Label>
                      <Input
                        id="sel-qty"
                        placeholder="e.g. 24"
                        value={form.quantity}
                        onChange={(e) =>
                          setForm({ ...form, quantity: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-lead">Lead time (days)</Label>
                      <Input
                        id="sel-lead"
                        type="number"
                        inputMode="numeric"
                        value={form.leadTimeDays}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            leadTimeDays: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-ordered">Ordered on</Label>
                      <Input
                        id="sel-ordered"
                        type="date"
                        value={form.orderedOn}
                        onChange={(e) =>
                          setForm({ ...form, orderedOn: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-expected">Expected</Label>
                      <Input
                        id="sel-expected"
                        type="date"
                        value={form.expectedOn}
                        onChange={(e) =>
                          setForm({ ...form, expectedOn: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-installed">Installed</Label>
                      <Input
                        id="sel-installed"
                        type="date"
                        value={form.installedOn}
                        onChange={(e) =>
                          setForm({ ...form, installedOn: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sel-notes">Notes</Label>
                    <Textarea
                      id="sel-notes"
                      placeholder="Anything worth keeping with this entry."
                      rows={2}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
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
                data-testid="button-save-selection"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save selection"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
