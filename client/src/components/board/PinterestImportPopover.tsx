/**
 * PinterestImportPopover — toolbar entry point for Pinterest.
 *
 * Two actions:
 *   1. Paste a Pinterest pin URL (or pin.it short link) and import its image
 *      onto the current board as a new image element.
 *   2. "Open Pinterest" button — opens pinterest.com in a new tab.
 *
 * Pinterest's public oEmbed endpoint only supports individual pin URLs.
 * Board URLs return a helpful error from the server.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Image as ImageIcon, ExternalLink, Loader2 } from "lucide-react";

interface PinterestImportPopoverProps {
  /** Called when a pin successfully resolves to an image URL. */
  onImport: (imageUrl: string, title?: string) => Promise<void> | void;
  /** Render mode — affects trigger button styling. */
  variant?: "desktop" | "mobile";
  /** Disable the import action (e.g. no board selected). */
  disabled?: boolean;
}

export function PinterestImportPopover({ onImport, variant = "desktop", disabled }: PinterestImportPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/pinterest/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Could not import that pin.");
        return;
      }
      await onImport(data.url, data.title);
      setUrl("");
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Could not import that pin.");
    } finally {
      setBusy(false);
    }
  };

  const trigger = variant === "mobile" ? (
    <button
      className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
      data-testid="mobile-pinterest"
      aria-label="Pinterest"
    >
      <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </button>
  ) : (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
      data-testid="button-pinterest"
      aria-label="Pinterest"
    >
      <ImageIcon className="h-4 w-4" />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "desktop" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Pinterest</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent className="w-80 p-3" align="end" side="bottom">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-foreground mb-1.5">Add a Pinterest pin</div>
            <p className="text-[11px] text-muted-foreground leading-snug mb-2">
              Paste a single pin URL (pin.it/… or pinterest.com/pin/…). Boards aren't supported — open the pin and copy its URL.
            </p>
            <div className="flex gap-1.5">
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder="https://pin.it/…"
                className="h-8 text-xs"
                disabled={busy || disabled}
                onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                data-testid="input-pinterest-url"
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleImport}
                disabled={busy || disabled || !url.trim()}
                data-testid="button-pinterest-add"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
              </Button>
            </div>
            {error && (
              <div className="text-[11px] text-destructive mt-1.5 leading-snug" data-testid="text-pinterest-error">
                {error}
              </div>
            )}
          </div>
          <div className="border-t border-border pt-2.5">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => window.open("https://www.pinterest.com", "_blank", "noopener,noreferrer")}
              data-testid="button-pinterest-open"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open Pinterest
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
