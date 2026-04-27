// Secondary-axis chip row.
//
// Sits between the primary tab strip and the canvas. The axis is the *opposite*
// of the primary one:
//   - Project board (primary = rooms)    → chips are categories (Fabric, Stone…)
//   - Library board (primary = categories) → chips are rooms (often hidden)
//
// Multi-select. Tapping a chip filters the canvas to cards that match BOTH the
// active primary tab AND any selected chip. Counts are scoped to the active
// primary tab so the user sees what's actually visible.
//
// Active accent uses spruce (#2f4a3a) on warm paper (#f7f1e7) inactive — the
// same vocabulary as the primary tab strip.

import { X as XIcon } from "lucide-react";

export type ChipAxis = "category" | "room";

interface SecondaryAxisChipsProps {
  axis: ChipAxis;
  options: string[];
  counts: Record<string, number>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}

export default function SecondaryAxisChips({
  axis,
  options,
  counts,
  selected,
  onToggle,
  onClear,
}: SecondaryAxisChipsProps) {
  if (options.length === 0) return null;
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto bg-card border-b border-border/40 hide-scrollbar"
      style={{ scrollbarWidth: "none" }}
      data-testid="secondary-axis-chips"
      data-axis={axis}
    >
      {options.map((opt) => {
        const active = selected.has(opt);
        const count = counts[opt] || 0;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-full text-[11px] uppercase tracking-wider border transition-colors whitespace-nowrap ${
              active
                ? "bg-[#2f4a3a] text-white border-[#2f4a3a]"
                : "bg-[#f7f1e7] text-foreground/80 border-transparent hover:border-[#2f4a3a]/40"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
            data-testid={`secondary-chip-${opt}`}
            aria-pressed={active}
          >
            <span className={active ? "" : "text-foreground"}>{opt}</span>
            <span className={`text-[10px] ${active ? "text-white/80" : "text-foreground/40"}`}>• {count}</span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
          data-testid="secondary-chip-clear"
        >
          <XIcon className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
