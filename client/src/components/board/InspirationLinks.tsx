/**
 * InspirationLinks — toolbar quick-launch buttons for Pinterest and Houzz.
 *
 * Two icon buttons that open pinterest.com and houzz.com in a new tab.
 * Replaces the old paste-a-pin-URL workflow in PinterestImportPopover —
 * users browse the source site directly, then drag/save images back into
 * the Assets drawer the normal way (upload, paste, etc.).
 */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InspirationLinksProps {
  /** Render mode — affects trigger button styling. */
  variant?: "desktop" | "mobile";
}

const PINTEREST_URL = "https://www.pinterest.com";
const HOUZZ_URL = "https://www.houzz.com";

const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export function InspirationLinks({ variant = "desktop" }: InspirationLinksProps) {
  if (variant === "mobile") {
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); open(PINTEREST_URL); }}
          className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
          data-testid="mobile-pinterest"
          aria-label="Open Pinterest"
        >
          <span
            className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: "#E60023" }}
            aria-hidden="true"
          >P</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); open(HOUZZ_URL); }}
          className="h-11 w-11 flex items-center justify-center rounded-full text-foreground/60 active:bg-foreground/10 shrink-0"
          data-testid="mobile-houzz"
          aria-label="Open Houzz"
        >
          <span
            className="h-6 w-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: "#4DBC15" }}
            aria-hidden="true"
          >h</span>
        </button>
      </>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 hover:bg-primary/10"
            onClick={() => open(PINTEREST_URL)}
            data-testid="button-pinterest"
            aria-label="Open Pinterest"
          >
            <span
              className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: "#E60023" }}
              aria-hidden="true"
            >P</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Open Pinterest</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 hover:bg-primary/10"
            onClick={() => open(HOUZZ_URL)}
            data-testid="button-houzz"
            aria-label="Open Houzz"
          >
            <span
              className="h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: "#4DBC15" }}
              aria-hidden="true"
            >h</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Open Houzz</TooltipContent>
      </Tooltip>
    </>
  );
}
