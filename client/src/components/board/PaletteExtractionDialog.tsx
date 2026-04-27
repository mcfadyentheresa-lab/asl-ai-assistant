import { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, Droplet, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CanvasElement } from "@shared/schema";

export type ExtractedColor = {
  hex: string;
  weight: number;
  match: {
    brand: string;
    name: string;
    code: string;
    hex: string;
    lrv?: number;
    colorFamily?: string;
    deltaE: number;
  } | null;
};

export type PaletteAddPayload = {
  rows: ExtractedColor[];
  room?: string;
  sourceImageUrl: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Existing image elements on the current board, for the "From board image" tab.
  boardImages: { id: number; url: string; caption?: string }[];
  // Suggested rooms (room_zone titles found on the board).
  roomSuggestions: string[];
  // Upload helper that returns a path/url usable by the server.
  uploadImage: (file: File) => Promise<{ url: string }>;
  // Adds the chosen palette rows to the board. Caller decides where to drop.
  onAdd: (payload: PaletteAddPayload) => void | Promise<void>;
  // Optional preset image URL — used by the image-element "Extract palette" action
  // to skip the picker step and go straight to results.
  presetImageUrl?: string | null;
}

export default function PaletteExtractionDialog({
  open,
  onOpenChange,
  boardImages,
  roomSuggestions,
  uploadImage,
  onAdd,
  presetImageUrl,
}: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"url" | "upload" | "board">("url");
  const [urlInput, setUrlInput] = useState("");
  const [k, setK] = useState(5);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<ExtractedColor[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [room, setRoom] = useState<string>("");
  const [activeImageUrl, setActiveImageUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cache extraction results in client memory keyed by `imageUrl|k` so re-opening
  // the dialog for the same image is instant.
  const cacheRef = useRef<Map<string, ExtractedColor[]>>(new Map());

  const reset = () => {
    setUrlInput("");
    setResults(null);
    setSelected(new Set());
    setActiveImageUrl("");
    setRoom("");
    setExtracting(false);
    setK(5);
  };

  const runExtraction = async (imageUrl: string) => {
    if (!imageUrl) return;
    const cacheKey = `${imageUrl}|${k}`;
    const cached = cacheRef.current.get(cacheKey);
    setActiveImageUrl(imageUrl);
    if (cached) {
      setResults(cached);
      setSelected(new Set(cached.map((_, i) => i)));
      return;
    }
    setExtracting(true);
    setResults(null);
    try {
      const res = await fetch("/api/board/extract-palette", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, k }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Couldn't extract palette",
          description: data?.message || "Try a different photo.",
          variant: "destructive",
        });
        setExtracting(false);
        return;
      }
      const extracted: ExtractedColor[] = data.extracted || [];
      if (extracted.length === 0) {
        toast({
          title: "No palette found",
          description: "Couldn't read enough color from that image. Try a different photo.",
          variant: "destructive",
        });
        setExtracting(false);
        return;
      }
      cacheRef.current.set(cacheKey, extracted);
      setResults(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
    } catch {
      toast({
        title: "Couldn't extract palette",
        description: "Try a different photo.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  // When dialog opens with presetImageUrl, run extraction immediately.
  useEffect(() => {
    if (!open) { reset(); return; }
    if (presetImageUrl) {
      runExtraction(presetImageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetImageUrl]);

  const handleUrlExtract = async () => {
    const url = urlInput.trim();
    if (!url) return;
    await runExtraction(url);
  };

  const handleUpload = async (file: File) => {
    setExtracting(true);
    try {
      const { url } = await uploadImage(file);
      await runExtraction(url);
    } catch {
      toast({ title: "Upload failed", description: "Try a different file.", variant: "destructive" });
      setExtracting(false);
    }
  };

  const toggleRow = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const submit = async (withRoom: boolean) => {
    if (!results) return;
    const rows = results.filter((_, i) => selected.has(i));
    if (rows.length === 0) {
      toast({ title: "Nothing to add", description: "Select at least one color.", variant: "destructive" });
      return;
    }
    await onAdd({ rows, room: withRoom ? room.trim() || undefined : undefined, sourceImageUrl: activeImageUrl });
    onOpenChange(false);
  };

  const showResultsView = !!results;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplet className="h-4 w-4" /> Extract palette from photo
          </DialogTitle>
          <DialogDescription>
            Pulls dominant colors from an image and snaps each to the nearest paint color in the catalogue.
          </DialogDescription>
        </DialogHeader>

        {!showResultsView && !presetImageUrl && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="url" data-testid="palette-tab-url">From URL</TabsTrigger>
              <TabsTrigger value="upload" data-testid="palette-tab-upload">From upload</TabsTrigger>
              <TabsTrigger value="board" data-testid="palette-tab-board">From board image</TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="space-y-2 mt-3">
              <Label className="text-xs">Image URL</Label>
              <div className="flex gap-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="text-xs"
                  data-testid="palette-input-url"
                />
                <Button onClick={handleUrlExtract} disabled={!urlInput.trim() || extracting} data-testid="palette-button-extract-url">
                  {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Extract"}
                </Button>
              </div>
              <KSelector k={k} onChange={setK} />
            </TabsContent>

            <TabsContent value="upload" className="space-y-2 mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                data-testid="palette-input-file"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-md p-6 flex flex-col items-center justify-center gap-2 hover:bg-muted/30 transition-colors"
                disabled={extracting}
                data-testid="palette-button-upload"
              >
                {extracting ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground">Click to upload an image</span>
                  </>
                )}
              </button>
              <KSelector k={k} onChange={setK} />
            </TabsContent>

            <TabsContent value="board" className="space-y-2 mt-3">
              {boardImages.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No images on this board yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                  {boardImages.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => runExtraction(img.url)}
                      className="aspect-square overflow-hidden rounded-md border border-border hover:border-primary transition-colors"
                      disabled={extracting}
                      data-testid={`palette-board-image-${img.id}`}
                    >
                      <img src={img.url} alt={img.caption || ""} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <KSelector k={k} onChange={setK} />
            </TabsContent>
          </Tabs>
        )}

        {showResultsView && (
          <ResultsList
            results={results!}
            selected={selected}
            onToggle={toggleRow}
            onSelectAll={() => setSelected(new Set(results!.map((_, i) => i)))}
            onSelectNone={() => setSelected(new Set())}
            sourceImageUrl={activeImageUrl}
          />
        )}

        {showResultsView && (
          <div className="border-t border-border pt-3 space-y-2">
            <Label className="text-xs">Room (optional, for "Add as room palette")</Label>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="Kitchen, Primary Bath..."
                className="text-xs h-8 flex-1 min-w-[140px]"
                list="palette-room-suggestions"
                data-testid="palette-input-room"
              />
              <datalist id="palette-room-suggestions">
                {roomSuggestions.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-row gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => { reset(); onOpenChange(false); }}
            data-testid="palette-button-cancel"
          >
            Cancel
          </Button>
          {showResultsView && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => submit(true)}
                disabled={!results || selected.size === 0 || !room.trim()}
                data-testid="palette-button-add-as-room"
              >
                Add as room palette
              </Button>
              <Button
                onClick={() => submit(false)}
                disabled={!results || selected.size === 0}
                data-testid="palette-button-add-all"
              >
                Add {selected.size} to board
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KSelector({ k, onChange }: { k: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Label className="text-xs text-muted-foreground">Colors to extract:</Label>
      <div className="flex gap-1">
        {[3, 4, 5, 6, 7, 8].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
              k === v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
            data-testid={`palette-k-${v}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsList({
  results,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  sourceImageUrl,
}: {
  results: ExtractedColor[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  sourceImageUrl: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {results.length} colors extracted · {selected.size} selected
        </p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-primary hover:underline"
            data-testid="palette-select-all"
          >
            All
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            onClick={onSelectNone}
            className="text-muted-foreground hover:underline"
            data-testid="palette-select-none"
          >
            None
          </button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {results.map((row, i) => (
          <div
            key={i}
            className={`flex items-stretch gap-2 rounded-md border p-2 cursor-pointer ${
              selected.has(i) ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card"
            }`}
            onClick={() => onToggle(i)}
            data-testid={`palette-row-${i}`}
          >
            <div className="flex items-center pl-1">
              <Checkbox
                checked={selected.has(i)}
                onCheckedChange={() => onToggle(i)}
                onClick={(e) => e.stopPropagation()}
                data-testid={`palette-row-check-${i}`}
              />
            </div>
            <div
              className="w-12 h-12 rounded-md shrink-0 border border-border/50"
              style={{ backgroundColor: row.hex }}
              title={row.hex}
            />
            <div className="flex items-center text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            {row.match ? (
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div
                  className="w-12 h-12 rounded-md shrink-0 border border-border/50"
                  style={{ backgroundColor: row.match.hex }}
                  title={row.match.hex}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{row.match.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {row.match.brand}{" "}
                    <span style={{ fontFamily: "var(--font-mono)" }}>{row.match.code}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    ΔE {row.match.deltaE}
                    {typeof row.match.lrv === "number" ? ` · LRV ${row.match.lrv}` : ""}
                    {" · "}
                    {Math.round(row.weight * 100)}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">No close match</div>
                <div className="text-[10px] text-muted-foreground">
                  Will be added as raw extracted color{" · "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(row.weight * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {sourceImageUrl && (
        <div className="text-[10px] text-muted-foreground truncate" style={{ fontFamily: "var(--font-mono)" }}>
          Source: {sourceImageUrl}
        </div>
      )}
    </div>
  );
}
