import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, X, Check, Palette } from "lucide-react";
import type { PaintColor } from "@shared/schema";

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

const CATEGORY_TABS = [
  { label: "Off-Whites", families: ["White", "Neutral"] },
  { label: "Colors", families: ["Blue", "Green", "Yellow", "Orange", "Red", "Pink", "Purple"] },
  { label: "Muted Hues", families: ["Gray", "Brown", "Black"] },
];

const SUB_FAMILIES: Record<string, string[]> = {
  "Off-Whites": ["White", "Neutral"],
  "Colors": ["Blue", "Green", "Yellow", "Orange", "Red", "Pink", "Purple"],
  "Muted Hues": ["Gray", "Brown", "Black"],
};

const PAINT_BRANDS = [
  { id: "Benjamin Moore", short: "BM", color: "#0066B3", label: "Benjamin Moore" },
  { id: "Sherwin-Williams", short: "SW", color: "#EF4135", label: "Sherwin-Williams" },
  { id: "Farrow & Ball", short: "F&B", color: "#31353D", label: "Farrow & Ball" },
  { id: "Para Paints", short: "PP", color: "#CC0033", label: "Para Paints" },
];

interface ColorPalettePickerProps {
  selectedColorId: number | null;
  onSelect: (colorId: number | null, color?: PaintColor | null) => void;
  trigger?: React.ReactNode;
  useDialog?: boolean;
}

export function ColorPalettePicker({
  selectedColorId,
  onSelect,
  trigger,
  useDialog = false,
}: ColorPalettePickerProps) {
  const [open, setOpen] = useState(false);

  if (useDialog) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)} className="cursor-pointer">
          {trigger || <DefaultTrigger selectedColorId={selectedColorId} />}
        </div>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="font-serif text-lg">Colour Palette</DialogTitle>
            <DialogDescription>Select a paint colour to tag this item</DialogDescription>
          </DialogHeader>
          <PaletteContent
            selectedColorId={selectedColorId}
            onSelect={(id, color) => {
              onSelect(id, color);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || <DefaultTrigger selectedColorId={selectedColorId} />}
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0 max-h-[70vh] flex flex-col" align="start">
        <PaletteContent
          selectedColorId={selectedColorId}
          onSelect={(id, color) => {
            onSelect(id, color);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function DefaultTrigger({ selectedColorId }: { selectedColorId: number | null }) {
  const { data: color } = useQuery<PaintColor>({
    queryKey: ["/api/paint-colors", selectedColorId],
    queryFn: async () => {
      const res = await fetch(`/api/paint-colors/${selectedColorId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedColorId,
  });

  if (selectedColorId && color) {
    return (
      <Button variant="outline" className="gap-2" data-testid="button-color-tag-trigger">
        <div
          className="w-4 h-4 rounded-sm border border-border/60"
          style={{ backgroundColor: color.hex }}
        />
        <span className="text-xs">{color.code}</span>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="icon" data-testid="button-color-tag-trigger">
      <Palette className="w-4 h-4" />
    </Button>
  );
}

function PaletteContent({
  selectedColorId,
  onSelect,
}: {
  selectedColorId: number | null;
  onSelect: (colorId: number | null, color?: PaintColor | null) => void;
}) {
  const [activeTab, setActiveTab] = useState("Colors");
  const [activeSubFamily, setActiveSubFamily] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeBrand, setActiveBrand] = useState("Benjamin Moore");

  const { data: allColors, isLoading } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors", "all-for-picker", activeBrand],
    queryFn: async () => {
      const res = await fetch(`/api/paint-colors?brand=${encodeURIComponent(activeBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch colors");
      return res.json();
    },
  });

  const subFamilies = SUB_FAMILIES[activeTab] || [];
  const currentSubFamily = activeSubFamily && subFamilies.includes(activeSubFamily) ? activeSubFamily : null;

  const filteredColors = useMemo(() => {
    if (!allColors) return [];
    let filtered = allColors;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
      );
      return filtered;
    }

    const tabFamilies = CATEGORY_TABS.find((t) => t.label === activeTab)?.families || [];
    if (currentSubFamily) {
      filtered = filtered.filter((c) => c.colorFamily === currentSubFamily);
    } else {
      filtered = filtered.filter((c) => tabFamilies.includes(c.colorFamily));
    }

    return filtered;
  }, [allColors, activeTab, currentSubFamily, search]);

  return (
    <div className="flex flex-col min-h-0" data-testid="color-palette-picker">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
        {PAINT_BRANDS.map((brand) => {
          const isActive = activeBrand === brand.id;
          return (
            <button
              key={brand.id}
              onClick={() => setActiveBrand(brand.id)}
              className={`flex items-center justify-center rounded-full text-[8px] font-bold tracking-tight transition-colors px-1.5 py-1 ${
                isActive
                  ? "ring-2 ring-offset-1 ring-offset-background text-white"
                  : "opacity-50 hover:opacity-80 text-white"
              }`}
              style={{
                backgroundColor: brand.color,
                ...(isActive ? { boxShadow: `0 0 0 1px var(--background), 0 0 0 3px ${brand.color}` } : {}),
              }}
              title={brand.label}
              data-testid={`picker-brand-${brand.short.toLowerCase()}`}
            >
              {brand.short}
            </button>
          );
        })}
      </div>
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code..."
            className="pl-8 h-8 text-sm"
            data-testid="input-palette-search"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              data-testid="button-clear-palette-search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {!search.trim() && (
        <>
          <div className="flex border-b border-border px-3">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => {
                  setActiveTab(tab.label);
                  setActiveSubFamily(null);
                }}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.label
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground"
                }`}
                data-testid={`tab-${tab.label.replace(/\s/g, "-").toLowerCase()}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border">
            {subFamilies.map((fam) => (
              <button
                key={fam}
                onClick={() => setActiveSubFamily(currentSubFamily === fam ? null : fam)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-sm transition-colors ${
                  currentSubFamily === fam
                    ? "bg-foreground text-background"
                    : "text-muted-foreground"
                }`}
                data-testid={`filter-sub-${fam.toLowerCase()}`}
              >
                {fam}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        {selectedColorId && (
          <button
            onClick={() => onSelect(null, null)}
            className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground mb-2 hover-elevate rounded-sm px-2 py-1.5"
            data-testid="button-clear-color-tag"
          >
            <X className="w-3 h-3" />
            Remove colour tag
          </button>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filteredColors.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No colours found
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
            {filteredColors.map((color) => {
              const isSelected = selectedColorId === color.id;
              const textColor = getContrastColor(color.hex);
              return (
                <button
                  key={color.id}
                  onClick={() => onSelect(color.id, color)}
                  className="relative aspect-square rounded-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring group"
                  style={{ backgroundColor: color.hex }}
                  title={`${color.name} (${color.code})`}
                  data-testid={`palette-color-${color.id}`}
                >
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-4 h-4" style={{ color: textColor }} strokeWidth={3} />
                    </div>
                  )}
                  <div
                    className="absolute bottom-0 inset-x-0 text-[8px] leading-tight px-0.5 py-0.5 truncate opacity-80"
                    style={{ color: textColor }}
                  >
                    {color.code}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground text-center">
        {filteredColors.length} colours · {activeBrand}
      </div>
    </div>
  );
}

export function ColorTagDot({
  colorTagId,
  size = "sm",
}: {
  colorTagId: number | null | undefined;
  size?: "sm" | "md";
}) {
  const { data: color } = useQuery<PaintColor>({
    queryKey: ["/api/paint-colors", colorTagId],
    queryFn: async () => {
      const res = await fetch(`/api/paint-colors/${colorTagId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!colorTagId,
  });

  if (!colorTagId || !color) return null;

  const dim = size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";

  return (
    <div
      className={`${dim} rounded-full border border-border/60 shrink-0`}
      style={{ backgroundColor: color.hex }}
      title={`${color.name} (${color.code})`}
      data-testid={`color-tag-dot-${colorTagId}`}
    />
  );
}
