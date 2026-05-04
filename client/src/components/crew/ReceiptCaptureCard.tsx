import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Receipt, Loader2, Camera, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

/**
 * Crew-facing "Log a purchase" form. Calls the existing
 * `POST /api/projects/:projectId/receipts` endpoint, which already permits
 * crew (denies clients) — so this surface only exposes a capability the
 * server already grants. Optional photo upload goes through
 * `POST /api/receipts/upload`, which returns a URL stored in `fileUrl`.
 *
 * Collapsed by default to keep the dashboard scannable; expands on tap.
 */
export function ReceiptCaptureCard({ projects }: { projects: Project[] | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  const [projectId, setProjectId] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usableProjects = (projects ?? []).filter(
    (p) => p.status === "planning" || p.status === "in_progress"
  );

  function reset() {
    setProjectId("");
    setVendor("");
    setAmount("");
    setDate(today);
    setDescription("");
    setFileUrl(null);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      const data = (await res.json()) as { url: string };
      setFileUrl(data.url);
      toast({ title: "Photo attached" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Couldn't attach photo", description: message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const createReceipt = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const pid = body.projectId as number;
      const res = await apiRequest("POST", `/api/projects/${pid}/receipts`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Receipt logged", description: "Saved to the project file." });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.includes("/receipts");
        },
      });
      reset();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save receipt",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleSubmit() {
    if (!projectId || !vendor.trim() || !amount.trim() || !date) {
      toast({
        title: "Missing fields",
        description: "Project, vendor, amount, and date are required.",
        variant: "destructive",
      });
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter the dollar amount as a positive number.",
        variant: "destructive",
      });
      return;
    }
    createReceipt.mutate({
      projectId: parseInt(projectId),
      vendor: vendor.trim(),
      amount: numericAmount.toFixed(2),
      date,
      description: description.trim() || null,
      fileUrl: fileUrl ?? null,
    });
  }

  if (!open) {
    return (
      <Card data-testid="receipt-capture-card">
        <CardContent className="py-4">
          <button
            onClick={() => setOpen(true)}
            className="w-full flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
            data-testid="button-open-receipt-form"
          >
            <Receipt className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Log a purchase</p>
              <p className="text-xs text-muted-foreground">
                Bought materials on site? Save the receipt here.
              </p>
            </div>
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="receipt-capture-card">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Log a Purchase
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            data-testid="button-close-receipt-form"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div>
          <Label htmlFor="receipt-project">
            Project <span className="text-destructive">*</span>
          </Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="receipt-project" className="mt-1.5" data-testid="select-receipt-project">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {usableProjects.length === 0 && (
                <SelectItem value="__none__" disabled>
                  No active projects
                </SelectItem>
              )}
              {usableProjects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="receipt-vendor">
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="receipt-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Muskoka Lumber"
              className="mt-1.5"
              data-testid="input-receipt-vendor"
            />
          </div>
          <div>
            <Label htmlFor="receipt-amount">
              Amount (CAD) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="receipt-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="200.00"
              className="mt-1.5"
              data-testid="input-receipt-amount"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="receipt-date">
            Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="receipt-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5"
            data-testid="input-receipt-date"
          />
        </div>

        <div>
          <Label htmlFor="receipt-description">What was it for?</Label>
          <Textarea
            id="receipt-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deck screws and pressure-treated 2x6"
            rows={2}
            className="mt-1.5 resize-none"
            data-testid="textarea-receipt-description"
          />
        </div>

        <div>
          <Label>Photo of receipt (optional)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handlePhotoUpload}
            data-testid="input-receipt-photo"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              data-testid="button-attach-receipt-photo"
            >
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {fileUrl ? "Replace photo" : "Attach photo"}
            </Button>
            {fileUrl && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-receipt-photo-attached">
                <Check className="h-3.5 w-3.5 text-green-600" />
                Attached
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            data-testid="button-cancel-receipt"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              createReceipt.isPending ||
              !projectId ||
              !vendor.trim() ||
              !amount.trim() ||
              !date
            }
            data-testid="button-submit-receipt"
          >
            {createReceipt.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save receipt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
