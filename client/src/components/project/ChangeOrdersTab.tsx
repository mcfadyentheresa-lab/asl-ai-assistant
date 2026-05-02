import { useMemo, useRef, useState } from "react";
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
import { Plus, Loader2, Archive, ArchiveRestore, Paperclip, FileText, X } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ChangeOrderRecord = {
  id: number;
  projectId: number;
  number: number;
  title: string;
  description: string | null;
  amount: string;
  status: string;
  sentOn: string | null;
  decidedOn: string | null;
  decidedBy: string | null;
  notes: string | null;
  attachmentDocumentId: number | null;
  archived: boolean | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  creator: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  decider: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

// Sort: active workflow first (sent → draft → approved → declined)
const STATUS_ORDER: Record<string, number> = {
  sent: 0,
  draft: 1,
  approved: 2,
  declined: 3,
};

interface ChangeOrdersTabProps {
  projectId: number;
  userRole: string; // "admin" | "crew" | "client"
}

// Tracks an attachment that's either already in this project's documents library
// (existing) or a fresh File the user just picked (new — uploaded on save).
type FormAttachment =
  | { kind: "existing"; documentId: number; title: string; url: string }
  | { kind: "new"; file: File }
  | null;

const EMPTY_FORM = {
  title: "",
  description: "",
  amount: "",
  status: "draft",
  notes: "",
};

type ProjectDocument = {
  id: number;
  title: string;
  url: string;
  type: string;
};

function formatAmount(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−${formatted}` : formatted;
}

export function ChangeOrdersTab({ projectId, userRole }: ChangeOrdersTabProps) {
  const { toast } = useToast();
  const canEdit = userRole === "admin" || userRole === "crew";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [attachment, setAttachment] = useState<FormAttachment>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Project documents — used both to render attachment names on saved COs and
  // to power the "pick existing" picker in the form.
  const { data: projectDocs } = useQuery<ProjectDocument[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });
  const docById = useMemo(() => {
    const m = new Map<number, ProjectDocument>();
    (projectDocs || []).forEach((d) => m.set(d.id, d));
    return m;
  }, [projectDocs]);

  const { data: changeOrders, isLoading } = useQuery<ChangeOrderRecord[]>({
    queryKey: ["/api/projects", projectId, "change-orders", { includeDrafts: true, includeArchived: true }],
    queryFn: async () => {
      const params = canEdit ? "?includeDrafts=1&includeArchived=1" : "";
      const res = await fetch(`/api/projects/${projectId}/change-orders${params}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async ({
      data,
      attach,
    }: {
      data: typeof EMPTY_FORM;
      attach: FormAttachment;
    }) => {
      // If the user picked a fresh file, upload it to the project's documents
      // library first. The returned doc id becomes attachmentDocumentId.
      let attachmentDocumentId: number | null = null;
      if (attach?.kind === "existing") {
        attachmentDocumentId = attach.documentId;
      } else if (attach?.kind === "new") {
        const fd = new FormData();
        fd.append("file", attach.file);
        fd.append("title", attach.file.name);
        fd.append("type", "change-order");
        const upRes = await fetch(
          `/api/projects/${projectId}/documents/upload`,
          { method: "POST", body: fd, credentials: "include" },
        );
        if (!upRes.ok) {
          const errBody = await upRes.json().catch(() => ({}));
          throw new Error(errBody?.message || "Couldn't upload attachment");
        }
        const doc = await upRes.json();
        attachmentDocumentId = doc?.id ?? null;
        // Refresh the documents list so the picker / link rendering see it.
        qc.invalidateQueries({
          queryKey: ["/api/projects", projectId, "documents"],
        });
      }

      const payload: Record<string, unknown> = {
        title: data.title.trim(),
        amount: data.amount.trim(),
        status: data.status,
      };
      if (data.description.trim()) payload.description = data.description.trim();
      if (data.notes.trim()) payload.notes = data.notes.trim();
      if (attachmentDocumentId) payload.attachmentDocumentId = attachmentDocumentId;
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/change-orders`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Change order added",
        description: "Saved to the project's change orders.",
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      setAttachment(null);
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "change-orders"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "budget-summary"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save change order",
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
      const res = await apiRequest("PATCH", `/api/change-orders/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "change-orders"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/projects", projectId, "budget-summary"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update change order",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const formValid =
    form.title.trim().length > 0 &&
    form.amount.trim().length > 0 &&
    !Number.isNaN(Number(form.amount)) &&
    !!form.status;

  // Sort: by status weight (sent first), then by number desc
  const sorted = useMemo(() => {
    return (changeOrders || []).slice().sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return b.number - a.number;
    });
  }, [changeOrders]);

  return (
    <div className="space-y-5" data-testid="change-orders-tab">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Change orders</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Scope additions or credits. Drafts are internal; once sent, the
            client can approve or decline. Approved orders adjust the budget.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="button-add-change-order"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add change order
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
            No change orders yet.
            {canEdit && (
              <span className="block mt-2">
                Draft a change order when scope shifts. Mark it sent and the
                client can approve or decline from their Plan.
              </span>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="change-orders-list">
          {sorted.map((co) => {
            const who = co.creator
              ? `${co.creator.firstName || ""} ${co.creator.lastName || ""}`.trim()
              : null;
            const decider = co.decider
              ? `${co.decider.firstName || ""} ${co.decider.lastName || ""}`.trim()
              : null;
            const dates = [
              co.sentOn ? `sent ${co.sentOn}` : null,
              co.decidedOn
                ? `${co.status === "approved" ? "approved" : co.status === "declined" ? "declined" : "decided"} ${co.decidedOn}${decider ? ` by ${decider}` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={co.id}>
                <Card
                  className={co.archived ? "opacity-60" : ""}
                  data-testid={`change-order-card-${co.id}`}
                >
                  <CardContent className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] tracking-[0.14em] uppercase no-default-hover-elevate no-default-active-elevate"
                            data-testid={`badge-co-number-${co.id}`}
                          >
                            CO-{co.number}
                          </Badge>
                          <h3 className="text-sm font-semibold tracking-tight">
                            {co.title}
                          </h3>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                          >
                            {co.status}
                          </Badge>
                          {co.archived && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1 font-mono tabular-nums">
                          {formatAmount(co.amount)}
                        </p>
                        {co.description && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                            {co.description}
                          </p>
                        )}
                        {co.notes && (
                          <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                            {co.notes}
                          </p>
                        )}
                        {co.attachmentDocumentId && (() => {
                          const doc = docById.get(co.attachmentDocumentId!);
                          if (!doc) return null;
                          return (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-xs text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
                              data-testid={`link-co-attachment-${co.id}`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[260px]">{doc.title}</span>
                            </a>
                          );
                        })()}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Select
                            value={co.status}
                            onValueChange={(v) =>
                              updateMutation.mutate({
                                id: co.id,
                                patch: { status: v },
                              })
                            }
                            disabled={updateMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-7 w-[120px] text-xs"
                              data-testid={`select-co-status-${co.id}`}
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
                                id: co.id,
                                patch: { archived: !co.archived },
                              })
                            }
                            disabled={updateMutation.isPending}
                            aria-label={
                              co.archived
                                ? "Restore change order"
                                : "Archive change order"
                            }
                            data-testid={`button-archive-co-${co.id}`}
                          >
                            {co.archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    {(dates || who) && (
                      <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase pt-1">
                        {dates}
                        {dates && who ? " · " : ""}
                        {who && `by ${who}`}
                      </div>
                    )}
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
              setForm(EMPTY_FORM);
              setAttachment(null);
              setPickerOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a change order</DialogTitle>
              <DialogDescription>
                A scope change worth signing off on. Save as draft, then mark
                sent when ready for the client.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formValid || createMutation.isPending) return;
                createMutation.mutate({ data: form, attach: attachment });
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="co-title">Title</Label>
                <Input
                  id="co-title"
                  placeholder="e.g. Add powder room vanity"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  data-testid="input-co-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="co-amount">Amount (CAD)</Label>
                  <Input
                    id="co-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 2400 or -350"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    data-testid="input-co-amount"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger
                      id="co-status"
                      data-testid="select-co-form-status"
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
              <div className="space-y-1.5">
                <Label htmlFor="co-description">Description</Label>
                <Textarea
                  id="co-description"
                  placeholder="Scope of work — what's being added or removed."
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  data-testid="input-co-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-notes">Internal notes</Label>
                <Textarea
                  id="co-notes"
                  placeholder="Anything to keep with this entry."
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  data-testid="input-co-notes"
                />
              </div>

              {/* Attachment — upload a new file or pick one already in this project's docs.
                  Saved to documents library on submit; FK lives on the change order. */}
              <div className="space-y-1.5">
                <Label>Attachment <span className="text-muted-foreground font-normal">(optional)</span></Label>
                {attachment ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" data-testid="co-attachment-name">
                        {attachment.kind === "existing" ? attachment.title : attachment.file.name}
                      </span>
                      {attachment.kind === "new" && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider no-default-hover-elevate no-default-active-elevate shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                      data-testid="button-co-remove-attachment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-co-upload-attachment"
                    >
                      <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                      Upload file
                    </Button>
                    {(projectDocs?.length || 0) > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPickerOpen((v) => !v)}
                        data-testid="button-co-pick-existing"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        Pick from documents
                      </Button>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setAttachment({ kind: "new", file: f });
                    // reset so picking the same file twice still triggers change
                    e.target.value = "";
                  }}
                  data-testid="input-co-file"
                />
                {pickerOpen && !attachment && (projectDocs?.length || 0) > 0 && (
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-md border bg-popover">
                    <ul className="py-1">
                      {(projectDocs || []).map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setAttachment({
                                kind: "existing",
                                documentId: d.id,
                                title: d.title,
                                url: d.url,
                              });
                              setPickerOpen(false);
                            }}
                            data-testid={`button-co-pick-doc-${d.id}`}
                          >
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{d.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!formValid || createMutation.isPending}
                  data-testid="button-save-change-order"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save change order"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
