import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type HardwareCategory = "knob" | "pull" | "faucet" | "hinge" | "sconce" | "pendant" | "handle" | "other";
export type HardwareStatus = "idea" | "shortlist" | "selected" | "ordered";

export interface HardwareDraft {
  category: HardwareCategory;
  name: string;
  brand?: string;
  sku?: string;
  finish?: string;
  dimensions?: string;
  price?: number;
  currency?: "CAD" | "USD";
  vendorUrl?: string;
  imageUrl?: string;
  room?: string;
  status?: HardwareStatus;
  notes?: string;
}

const CATEGORIES: HardwareCategory[] = ["knob", "pull", "faucet", "hinge", "sconce", "pendant", "handle", "other"];
const STATUSES: HardwareStatus[] = ["idea", "shortlist", "selected", "ordered"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (draft: HardwareDraft) => void | Promise<void>;
}

export default function HardwarePickerDialog({ open, onOpenChange, onSubmit }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"url" | "manual">("url");
  const [urlInput, setUrlInput] = useState("");
  const [unfurling, setUnfurling] = useState(false);
  const [draft, setDraft] = useState<HardwareDraft>({
    category: "pull",
    name: "",
    status: "idea",
    currency: "CAD",
  });
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUrlInput("");
    setDraft({ category: "pull", name: "", status: "idea", currency: "CAD" });
    setTab("url");
  };

  const handleUnfurl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUnfurling(true);
    try {
      const res = await fetch("/api/board/unfurl-vendor", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't read that page", description: data?.message || "Try manual entry.", variant: "destructive" });
        setTab("manual");
        setDraft((d) => ({ ...d, vendorUrl: url }));
        return;
      }
      setDraft((d) => ({
        ...d,
        name: data.title || d.name,
        brand: data.siteName || d.brand,
        imageUrl: data.image || d.imageUrl,
        price: typeof data.price === "number" ? data.price : d.price,
        currency: data.currency === "USD" ? "USD" : "CAD",
        vendorUrl: data.sourceUrl || url,
      }));
      setTab("manual");
    } catch {
      toast({ title: "Network error", description: "Try again or use manual entry.", variant: "destructive" });
      setTab("manual");
      setDraft((d) => ({ ...d, vendorUrl: url }));
    } finally {
      setUnfurling(false);
    }
  };

  const canSave = draft.name.trim().length > 0 && !!draft.category && !!draft.room;

  const handleSave = async () => {
    if (!canSave) {
      toast({ title: "Missing fields", description: "Name, category, and room are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        brand: draft.brand?.trim() || undefined,
        sku: draft.sku?.trim() || undefined,
        finish: draft.finish?.trim() || undefined,
        dimensions: draft.dimensions?.trim() || undefined,
        vendorUrl: draft.vendorUrl?.trim() || undefined,
        imageUrl: draft.imageUrl?.trim() || undefined,
        room: draft.room?.trim() || undefined,
        notes: draft.notes?.trim() || undefined,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md" data-testid="dialog-hardware-picker">
        <DialogHeader>
          <DialogTitle>Add hardware</DialogTitle>
          <DialogDescription>Pull from a vendor URL, or enter the details by hand.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "url" | "manual")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="url" data-testid="tab-hardware-url">From URL</TabsTrigger>
            <TabsTrigger value="manual" data-testid="tab-hardware-manual">Manual entry</TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hardware-url">Vendor URL</Label>
              <div className="flex gap-2">
                <Input
                  id="hardware-url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://schoolhouse.com/products/..."
                  data-testid="input-hardware-url"
                />
                <Button onClick={handleUnfurl} disabled={!urlInput.trim() || unfurling} data-testid="button-hardware-unfurl">
                  {unfurling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">We'll pre-fill name, image, brand, and price where we can. You can edit anything before adding.</p>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="hardware-category">Category *</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v as HardwareCategory }))}>
                  <SelectTrigger id="hardware-category" data-testid="select-hardware-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} data-testid={`option-hardware-category-${c}`}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hardware-room">Room *</Label>
                <Input
                  id="hardware-room"
                  value={draft.room || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
                  placeholder="Kitchen"
                  data-testid="input-hardware-room"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hardware-name">Name *</Label>
              <Input
                id="hardware-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Brushed brass cup pull"
                data-testid="input-hardware-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="hardware-brand">Brand</Label>
                <Input
                  id="hardware-brand"
                  value={draft.brand || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                  placeholder="Schoolhouse"
                  data-testid="input-hardware-brand"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hardware-sku">SKU</Label>
                <Input
                  id="hardware-sku"
                  value={draft.sku || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
                  placeholder="P-1234"
                  className="font-mono text-xs"
                  data-testid="input-hardware-sku"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="hardware-finish">Finish</Label>
                <Input
                  id="hardware-finish"
                  value={draft.finish || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, finish: e.target.value }))}
                  placeholder="Brushed brass"
                  data-testid="input-hardware-finish"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hardware-dimensions">Dimensions</Label>
                <Input
                  id="hardware-dimensions"
                  value={draft.dimensions || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, dimensions: e.target.value }))}
                  placeholder="4 in CTC"
                  className="font-mono text-xs"
                  data-testid="input-hardware-dimensions"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="hardware-price">Price</Label>
                <Input
                  id="hardware-price"
                  type="number"
                  step="0.01"
                  value={draft.price ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value === "" ? undefined : Number(e.target.value) }))}
                  placeholder="24.00"
                  className="font-mono text-xs"
                  data-testid="input-hardware-price"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hardware-currency">Currency</Label>
                <Select value={draft.currency || "CAD"} onValueChange={(v) => setDraft((d) => ({ ...d, currency: v as "CAD" | "USD" }))}>
                  <SelectTrigger id="hardware-currency" data-testid="select-hardware-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hardware-image">Image URL</Label>
              <Input
                id="hardware-image"
                value={draft.imageUrl || ""}
                onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                placeholder="https://..."
                data-testid="input-hardware-image"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hardware-vendor-url">Vendor URL</Label>
              <Input
                id="hardware-vendor-url"
                value={draft.vendorUrl || ""}
                onChange={(e) => setDraft((d) => ({ ...d, vendorUrl: e.target.value }))}
                placeholder="https://..."
                data-testid="input-hardware-vendor-url"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hardware-status">Status</Label>
              <Select value={draft.status || "idea"} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as HardwareStatus }))}>
                <SelectTrigger id="hardware-status" data-testid="select-hardware-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`option-hardware-status-${s}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hardware-notes">Notes</Label>
              <Textarea
                id="hardware-notes"
                value={draft.notes || ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                rows={2}
                data-testid="input-hardware-notes"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-hardware-cancel">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || submitting} data-testid="button-hardware-save">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add to board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
