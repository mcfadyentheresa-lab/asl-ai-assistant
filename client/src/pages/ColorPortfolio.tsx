import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, ArrowLeft, Copy, Check, Star, X, MoreHorizontal, Clipboard, Palette } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { PaintColor } from "@shared/schema";

const LAST_BOARD_KEY = "aster-spruce:last-planning-board";

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

const CATEGORY_TABS = [
  { label: "Off-Whites", families: ["White", "Neutral"] },
  { label: "Colours", families: ["Blue", "Green", "Yellow", "Orange", "Red", "Pink", "Purple"] },
  { label: "Muted Hues", families: ["Gray", "Brown", "Black"] },
];

const SUB_FAMILIES: Record<string, string[]> = {
  "Off-Whites": ["White", "Neutral"],
  "Colours": ["Blue", "Green", "Yellow", "Orange", "Red", "Pink", "Purple"],
  "Muted Hues": ["Gray", "Brown", "Black"],
};

const PAINT_BRANDS = [
  { id: "Benjamin Moore", short: "BM", color: "#0066B3", label: "Benjamin Moore" },
  { id: "Sherwin-Williams", short: "SW", color: "#EF4135", label: "Sherwin-Williams" },
  { id: "Farrow & Ball", short: "F&B", color: "#31353D", label: "Farrow & Ball" },
  { id: "Para Paints", short: "PP", color: "#CC0033", label: "Para Paints" },
];

function ColorSwatch({
  color,
  onClick,
  onCopyHex,
  onCopyInfo,
}: {
  color: PaintColor;
  onClick: () => void;
  onCopyHex: () => void;
  onCopyInfo: () => void;
}) {
  const textColor = getContrastColor(color.hex);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
    >
      <button
        onClick={onClick}
        className="w-full text-left rounded-md overflow-visible hover-elevate active-elevate-2 transition-shadow focus:outline-none focus:ring-2 focus:ring-ring"
        data-testid={`color-swatch-${color.id}`}
      >
        <div
          className="aspect-square rounded-t-md relative"
          style={{ backgroundColor: color.hex }}
        >
          {color.isPopular && (
            <div className="absolute top-1.5 right-1.5">
              <Star className="w-3.5 h-3.5" style={{ color: textColor, opacity: 0.7 }} fill="currentColor" />
            </div>
          )}
        </div>
        <div className="px-2 py-1.5 bg-card rounded-b-md border border-t-0 border-border/60">
          <p className="text-xs font-medium text-foreground truncate" data-testid={`color-name-${color.id}`}>
            {color.name}
          </p>
          <p className="text-[10px] text-muted-foreground">{color.code}</p>
          <span className="sr-only">{`${color.brand} ${color.name} ${color.code}`}</span>
        </div>
      </button>
      <div className="absolute top-1 left-1 z-10" style={{ visibility: "hidden" }} data-swatch-actions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="h-6 w-6 rounded-sm"
              onClick={(e) => e.stopPropagation()}
              data-testid={`button-swatch-actions-${color.id}`}
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyHex(); }} data-testid={`menu-copy-hex-${color.id}`}>
              <Clipboard className="mr-2 h-4 w-4" />
              Copy Hex ({color.hex})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyInfo(); }} data-testid={`menu-copy-info-${color.id}`}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Name & Code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }} data-testid={`menu-view-detail-${color.id}`}>
              <Palette className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function ColorDetail({ color, onClose }: { color: PaintColor; onClose: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const textColor = getContrastColor(color.hex);

  const r = parseInt(color.hex.slice(1, 3), 16);
  const g = parseInt(color.hex.slice(3, 5), 16);
  const b = parseInt(color.hex.slice(5, 7), 16);

  const copyValue = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-serif">{color.name}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div
          className="w-full h-40 rounded-md border border-border/40 flex items-end p-4"
          style={{ backgroundColor: color.hex }}
          data-testid="color-detail-swatch"
        >
          <div style={{ color: textColor }}>
            <p className="font-serif text-lg font-semibold">{color.name}</p>
            <p className="text-sm opacity-80">{color.code}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoRow
            label="Brand"
            value={color.brand}
            onCopy={() => copyValue("Brand", color.brand)}
            copied={copied === "Brand"}
          />
          <InfoRow
            label="Code"
            value={color.code}
            onCopy={() => copyValue("Code", color.code)}
            copied={copied === "Code"}
          />
          <InfoRow
            label="Hex"
            value={color.hex}
            onCopy={() => copyValue("Hex", color.hex)}
            copied={copied === "Hex"}
          />
          <InfoRow
            label="RGB"
            value={`${r}, ${g}, ${b}`}
            onCopy={() => copyValue("RGB", `rgb(${r}, ${g}, ${b})`)}
            copied={copied === "RGB"}
          />
          <InfoRow
            label="Colour Family"
            value={color.colorFamily}
          />
          {color.lrv != null && (
            <InfoRow
              label="LRV"
              value={String(color.lrv)}
            />
          )}
        </div>

        {color.isPopular && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="w-3.5 h-3.5 text-accent" fill="currentColor" />
            <span>Popular colour</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => copyValue("Colour info", `${color.name} (${color.code}) - ${color.hex}`)}
            data-testid="button-copy-color-info"
          >
            <Copy className="w-4 h-4" />
            Copy Info
          </Button>
        </div>

        <div className="text-[10px] text-muted-foreground pt-2 border-t border-border">
          {color.brand}<sup>&reg;</sup>. All colour names, codes, and formulations are trademarks of {color.brand}. Colours shown are approximate digital representations.
        </div>
      </div>
    </DialogContent>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {onCopy && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy();
                }}
                data-testid={`button-copy-${label.toLowerCase()}`}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy {label}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function ColorPortfolio() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Off-Whites");
  const [activeSubFamily, setActiveSubFamily] = useState<string | null>(null);
  const [showPopularOnly, setShowPopularOnly] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [activeBrand, setActiveBrand] = useState("Benjamin Moore");
  const { toast } = useToast();

  const { data: allColors, isLoading } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors", "all-portfolio", activeBrand],
    queryFn: async () => {
      const res = await fetch(`/api/paint-colors?brand=${encodeURIComponent(activeBrand)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch colours");
      return res.json();
    },
  });

  const subFamilies = SUB_FAMILIES[activeTab] || [];
  const currentSubFamily = activeSubFamily && subFamilies.includes(activeSubFamily) ? activeSubFamily : null;

  const filteredColors = useMemo(() => {
    if (!allColors) return [];
    let filtered = allColors;

    if (showPopularOnly) {
      filtered = filtered.filter((c) => c.isPopular);
    }

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
  }, [allColors, activeTab, currentSubFamily, search, showPopularOnly]);

  const groupedByFamily = useMemo(() => {
    if (search.trim() || currentSubFamily) return null;
    const groups: Record<string, PaintColor[]> = {};
    for (const c of filteredColors) {
      if (!groups[c.colorFamily]) groups[c.colorFamily] = [];
      groups[c.colorFamily].push(c);
    }
    return groups;
  }, [filteredColors, search, currentSubFamily]);

  const handleCopyHex = (color: PaintColor) => {
    navigator.clipboard.writeText(color.hex);
    toast({ title: "Copied", description: `${color.hex} copied to clipboard` });
  };

  const handleCopyInfo = (color: PaintColor) => {
    navigator.clipboard.writeText(`${color.name} (${color.code}) - ${color.hex}`);
    toast({ title: "Copied", description: `${color.name} info copied to clipboard` });
  };

  const handleBack = () => {
    const lastBoardId = window.sessionStorage.getItem(LAST_BOARD_KEY);
    if (lastBoardId) {
      window.location.href = `/project/${lastBoardId}?tab=board`;
      return;
    }
    window.location.href = "/";
  };

  const renderSwatch = (color: PaintColor) => (
    <ColorSwatch
      key={color.id}
      color={color}
      onClick={() => setSelectedColor(color)}
      onCopyHex={() => handleCopyHex(color)}
      onCopyInfo={() => handleCopyInfo(color)}
    />
  );

  return (
    <div className="min-h-screen bg-background" data-testid="color-portfolio-page">
      <style>{`
        .group:hover [data-swatch-actions] {
          visibility: visible !important;
        }
      `}</style>
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-6 space-y-4 sm:space-y-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={handleBack} data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight" data-testid="text-page-title">
              Colour Portfolio
            </h1>
            <div className="flex items-center gap-2 mt-1.5 sm:mt-2">
              {PAINT_BRANDS.map((brand) => {
                const isActive = activeBrand === brand.id;
                return (
                  <button
                    key={brand.id}
                    onClick={() => setActiveBrand(brand.id)}
                    className={`relative flex items-center justify-center rounded-full text-[10px] sm:text-[11px] font-bold tracking-tight transition-colors px-2.5 py-1.5 sm:px-3 sm:py-2 ${
                      isActive
                        ? "ring-2 ring-offset-2 ring-offset-background text-white shadow-md"
                        : "opacity-60 hover:opacity-90 text-white"
                    }`}
                    style={{
                      backgroundColor: brand.color,
                      ringColor: isActive ? brand.color : undefined,
                      ...(isActive ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${brand.color}` } : {}),
                    }}
                    title={brand.label}
                    data-testid={`brand-selector-${brand.short.toLowerCase()}`}
                  >
                    {brand.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="pl-9"
              data-testid="input-search-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={showPopularOnly ? "default" : "outline"}
            onClick={() => setShowPopularOnly(!showPopularOnly)}
            className="gap-1.5"
            data-testid="button-toggle-popular"
          >
            <Star className="w-3.5 h-3.5" />
            Popular
          </Button>
        </div>

        {!search.trim() && (
          <>
            <div className="flex border-b border-border overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => {
                    setActiveTab(tab.label);
                    setActiveSubFamily(null);
                  }}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

            <div className="flex flex-wrap gap-1.5">
              {subFamilies.map((fam) => (
                <Badge
                  key={fam}
                  variant={currentSubFamily === fam ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setActiveSubFamily(currentSubFamily === fam ? null : fam)}
                  title={fam}
                  data-testid={`filter-sub-${fam.toLowerCase()}`}
                >
                  {fam}
                </Badge>
              ))}
            </div>
          </>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredColors.length === 0 ? (
          <Card className="p-8 text-center">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No colours found matching your search.</p>
          </Card>
        ) : groupedByFamily ? (
          <div className="space-y-8">
            {Object.entries(groupedByFamily).map(([family, familyColors]) => (
              <section key={family}>
                <h2 className="font-serif text-lg font-semibold text-foreground mb-3" data-testid={`section-${family.toLowerCase()}`}>
                  {family}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({familyColors.length})
                  </span>
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-12 gap-2 sm:gap-2.5">
                  <AnimatePresence>
                    {familyColors.map(renderSwatch)}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-12 gap-2 sm:gap-2.5">
            <AnimatePresence>
              {filteredColors.map(renderSwatch)}
            </AnimatePresence>
          </div>
        )}

        <div className="text-center pt-6 sm:pt-8 pb-8 sm:pb-12 space-y-2 border-t border-border/60">
          {filteredColors.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-color-count">
              {filteredColors.length} colours
            </p>
          )}
          <p className="text-[10px] sm:text-xs text-muted-foreground/70 max-w-md mx-auto leading-relaxed">
            {activeBrand === "Benjamin Moore" && <>Benjamin Moore<sup>&reg;</sup> and all colour names are registered trademarks of Benjamin Moore & Co.</>}
            {activeBrand === "Sherwin-Williams" && <>Sherwin-Williams<sup>&reg;</sup> and all colour names are registered trademarks of The Sherwin-Williams Company.</>}
            {activeBrand === "Farrow & Ball" && <>Farrow & Ball<sup>&reg;</sup> and all colour names are registered trademarks of Farrow & Ball Ltd.</>}
            {activeBrand === "Para Paints" && <>Para Paints<sup>&reg;</sup> and all colour names are registered trademarks of Para Paints.</>}
            {" "}Colours shown are approximate digital representations.
          </p>
        </div>
      </div>

      <Dialog open={!!selectedColor} onOpenChange={(open) => !open && setSelectedColor(null)}>
        {selectedColor && (
          <ColorDetail
            color={selectedColor}
            onClose={() => setSelectedColor(null)}
          />
        )}
      </Dialog>

    </div>
  );
}
