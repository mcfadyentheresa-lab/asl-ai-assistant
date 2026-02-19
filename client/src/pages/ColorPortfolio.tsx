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
import { Search, ArrowLeft, Copy, Check, Star, Palette } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { PaintColor } from "@shared/schema";

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

function ColorSwatch({ color, onClick }: { color: PaintColor; onClick: () => void }) {
  const textColor = getContrastColor(color.hex);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <button
        onClick={onClick}
        className="w-full text-left rounded-md overflow-visible hover-elevate active-elevate-2 transition-shadow group focus:outline-none focus:ring-2 focus:ring-ring"
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
        </div>
      </button>
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
            label="Color Family"
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
            <span>Popular color</span>
          </div>
        )}
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

const FAMILY_ORDER = [
  "White", "Neutral", "Gray", "Blue", "Green",
  "Brown", "Yellow", "Orange", "Red", "Pink", "Purple", "Black",
];

export default function ColorPortfolio() {
  const [search, setSearch] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [showPopularOnly, setShowPopularOnly] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);

  const { data: families } = useQuery<string[]>({
    queryKey: ["/api/paint-colors/families"],
  });

  const queryParams = new URLSearchParams();
  queryParams.set("brand", "Benjamin Moore");
  if (selectedFamily) queryParams.set("colorFamily", selectedFamily);
  if (search.trim()) queryParams.set("search", search.trim());
  if (showPopularOnly) queryParams.set("popular", "true");

  const { data: colors, isLoading } = useQuery<PaintColor[]>({
    queryKey: ["/api/paint-colors", selectedFamily, search, showPopularOnly],
    queryFn: async () => {
      const res = await fetch(`/api/paint-colors?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch colors");
      return res.json();
    },
  });

  const sortedFamilies = useMemo(() => {
    if (!families) return [];
    return [...families].sort(
      (a, b) => (FAMILY_ORDER.indexOf(a) === -1 ? 99 : FAMILY_ORDER.indexOf(a)) -
                (FAMILY_ORDER.indexOf(b) === -1 ? 99 : FAMILY_ORDER.indexOf(b))
    );
  }, [families]);

  const groupedColors = useMemo(() => {
    if (!colors || selectedFamily || search.trim()) return null;
    const groups: Record<string, PaintColor[]> = {};
    for (const c of colors) {
      if (!groups[c.colorFamily]) groups[c.colorFamily] = [];
      groups[c.colorFamily].push(c);
    }
    return groups;
  }, [colors, selectedFamily, search]);

  return (
    <div className="min-h-screen bg-background" data-testid="color-portfolio-page">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <h1 className="font-serif text-2xl font-bold text-foreground" data-testid="text-page-title">
              Color Portfolio
            </h1>
          </div>
          <Badge variant="secondary" className="ml-auto">
            Benjamin Moore
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="pl-9"
              data-testid="input-search-colors"
            />
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

        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={selectedFamily === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedFamily(null)}
            data-testid="filter-family-all"
          >
            All
          </Badge>
          {sortedFamilies.map((f) => (
            <Badge
              key={f}
              variant={selectedFamily === f ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedFamily(selectedFamily === f ? null : f)}
              data-testid={`filter-family-${f.toLowerCase()}`}
            >
              {f}
            </Badge>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : colors && colors.length === 0 ? (
          <Card className="p-8 text-center">
            <Palette className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No colors found matching your search.</p>
          </Card>
        ) : groupedColors && !showPopularOnly ? (
          <div className="space-y-8">
            {FAMILY_ORDER.filter((f) => groupedColors[f]).map((family) => (
              <section key={family}>
                <h2 className="font-serif text-lg font-semibold text-foreground mb-3" data-testid={`section-${family.toLowerCase()}`}>
                  {family}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({groupedColors[family].length})
                  </span>
                </h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
                  <AnimatePresence>
                    {groupedColors[family].map((color) => (
                      <ColorSwatch
                        key={color.id}
                        color={color}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            <AnimatePresence>
              {colors?.map((color) => (
                <ColorSwatch
                  key={color.id}
                  color={color}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground pt-4 pb-8">
          {colors && (
            <span data-testid="text-color-count">{colors.length} colors</span>
          )}
          {" · "}Benjamin Moore is a registered trademark. Colors shown are approximate digital representations.
        </div>
      </div>

      <Dialog open={!!selectedColor} onOpenChange={(open) => !open && setSelectedColor(null)}>
        {selectedColor && (
          <ColorDetail color={selectedColor} onClose={() => setSelectedColor(null)} />
        )}
      </Dialog>
    </div>
  );
}
