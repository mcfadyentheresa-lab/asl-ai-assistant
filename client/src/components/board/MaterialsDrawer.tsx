import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlanningBoards } from "@/hooks/use-projects";
import { Loader2, Layers, Plus, Palette, Shapes, Wrench, Armchair } from "lucide-react";
import { Input } from "@/components/ui/input";

interface MaterialsDrawerProps {
  projectId: number;
  // Add an image URL to the canvas. Used as a fallback for items that have only an image,
  // not a structured kind. Structured kinds drag onto the canvas as their native card type.
  onAddImageUrl: (url: string) => void;
}

interface CanvasElement {
  id: number;
  boardId: number;
  type: string;
  content: any;
}

// All element types that should appear in the Library drawer. We intentionally include items
// from every board in the project (not just `mode === "library"`) so the user sees their
// saved finishes everywhere, not only items they manually moved into a Library board.
const LIBRARY_TYPES = new Set(["surface", "hardware", "product", "image", "color_swatch", "material"]);

// Top-level kind buckets shown as filter chips. Each maps to an element subset:
type KindBucket = "all" | "paint" | "material" | "hardware" | "product" | "photo";

function bucketFor(el: any): KindBucket {
  const c = el.content || {};
  if (el.type === "surface") {
    if (c.kind === "paint") return "paint";
    if (c.kind === "material") return "material";
  }
  if (el.type === "color_swatch") return "paint";
  if (el.type === "material") return "material";
  if (el.type === "hardware") return "hardware";
  if (el.type === "product") return "product";
  if (el.type === "image") return "photo";
  return "all";
}

const BUCKET_META: Record<Exclude<KindBucket, "all">, { label: string; icon: any }> = {
  paint: { label: "Paint", icon: Palette },
  material: { label: "Material", icon: Shapes },
  hardware: { label: "Hardware", icon: Wrench },
  product: { label: "Product", icon: Armchair },
  photo: { label: "Photos", icon: Layers },
};

function useAllProjectElements(boards: any[]) {
  const enabled = Array.isArray(boards) && boards.length > 0;
  return useQuery({
    queryKey: ["library-drawer", "all-elements", (boards || []).map((b: any) => b.id).sort().join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        (boards || []).map(async (b: any) => {
          const res = await fetch(`/api/planning-boards/${b.id}/elements`, { credentials: "include" });
          if (!res.ok) return [];
          const elements: CanvasElement[] = await res.json();
          return elements.map((el) => ({ ...el, boardName: b.name, boardMode: b.mode }));
        })
      );
      return results.flat();
    },
    enabled,
  });
}

export function MaterialsDrawer({ projectId, onAddImageUrl }: MaterialsDrawerProps) {
  const { data: boards, isLoading: loadingBoards } = usePlanningBoards(projectId);
  const allBoards = useMemo(() => boards || [], [boards]);
  const { data: elementsRaw, isLoading: loadingElements } = useAllProjectElements(allBoards);

  const items = useMemo(
    () => (elementsRaw || [])
      .filter((el: any) => LIBRARY_TYPES.has(el.type))
      // De-dupe by (kind, name+hex) so the same paint colour saved on five boards shows once.
      .reduce((acc: any[], el: any) => {
        const c = el.content || {};
        const key = `${bucketFor(el)}|${(c.name || c.title || "").toLowerCase()}|${(c.hex || c.color || c.imageUrl || c.url || "").toLowerCase()}`;
        if (!acc.find((x) => x._dedupeKey === key)) {
          acc.push({ ...el, _dedupeKey: key });
        }
        return acc;
      }, []),
    [elementsRaw]
  );

  const [activeBucket, setActiveBucket] = useState<KindBucket>("all");
  const [filter, setFilter] = useState("");

  const counts = useMemo(() => {
    const out: Record<KindBucket, number> = { all: items.length, paint: 0, material: 0, hardware: 0, product: 0, photo: 0 };
    items.forEach((el: any) => { out[bucketFor(el)] = (out[bucketFor(el)] || 0) + 1; });
    return out;
  }, [items]);

  const visible = useMemo(() => items.filter((el: any) => {
    if (activeBucket !== "all" && bucketFor(el) !== activeBucket) return false;
    if (filter.trim()) {
      const c = el.content || {};
      const hay = `${c.name || ""} ${c.title || ""} ${c.caption || ""} ${c.brand || ""} ${c.supplier || ""} ${c.code || ""} ${el.boardName || ""}`.toLowerCase();
      if (!hay.includes(filter.toLowerCase().trim())) return false;
    }
    return true;
  }), [items, activeBucket, filter]);

  const isLoading = loadingBoards || loadingElements;

  if (!isLoading && allBoards.length === 0) {
    return (
      <div className="flex flex-col h-full" data-testid="drawer-materials">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <Layers className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nothing in your library yet</p>
          <p className="text-xs text-muted-foreground max-w-[300px]">
            Add a paint swatch, material, hardware, or product card to any board in this project
            and it will show up here. Drag from this panel onto any board to reuse without typing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="drawer-materials">
      <div className="px-4 py-3 border-b border-border/60 space-y-2.5">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name, brand, code…"
          className="h-9 text-sm"
          data-testid="input-materials-filter"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveBucket("all")}
            className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 ${activeBucket === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            data-testid="materials-bucket-all"
          >
            All <span className="text-[10px] opacity-70 font-mono">({counts.all})</span>
          </button>
          {(["paint","material","hardware","product","photo"] as const).map((b) => {
            const meta = BUCKET_META[b];
            const Icon = meta.icon;
            const n = counts[b] || 0;
            if (n === 0) return null;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setActiveBucket(b)}
                className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 ${activeBucket === b ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                data-testid={`materials-bucket-${b}`}
              >
                <Icon className="h-3 w-3" /> {meta.label} <span className="text-[10px] opacity-70 font-mono">({n})</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <Layers className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No matches</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-[260px]">
              Add a paint, material, hardware, or product card to any board to see it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((el: any) => {
              const c = el.content || {};
              const url: string | undefined = c.imageUrl || c.url;
              const swatchColor = (el.type === "color_swatch" || (el.type === "surface" && c.kind === "paint")) ? (c.color || c.hex) : undefined;
              const label = c.name || c.title || c.caption || el.type;
              const sub = c.brand || c.supplier || c.code || el.boardName || "";
              const bucket = bucketFor(el);

              return (
                <button
                  key={el.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    // For paint swatches drag with full structured payload so SpatialCanvas can
                    // recreate a real paint card. For everything else, fall back to image-url drop.
                    if (swatchColor) {
                      e.dataTransfer.setData("tool-type", "surface-paint");
                      e.dataTransfer.setData("library-payload", JSON.stringify({
                        kind: "paint",
                        color: swatchColor,
                        hex: c.hex || swatchColor,
                        name: c.name || "",
                        code: c.code || "",
                        brand: c.brand || "",
                      }));
                    } else if (url) {
                      e.dataTransfer.setData("tool-type", "image");
                      e.dataTransfer.setData("image-url", url);
                    } else {
                      return;
                    }
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => { if (url) onAddImageUrl(url); }}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 hover:border-primary transition-colors bg-card text-left"
                  data-testid={`drawer-material-${el.id}`}
                >
                  {swatchColor ? (
                    <span className="block w-full h-full" style={{ backgroundColor: swatchColor }} />
                  ) : url ? (
                    <img src={url} alt={label} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center bg-muted text-muted-foreground text-[10px] font-mono uppercase tracking-[0.14em]">
                      {bucket}
                    </span>
                  )}
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm bg-card/85 backdrop-blur text-[9px] font-mono uppercase tracking-[0.12em] text-foreground/70">
                    {bucket}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/30 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="absolute bottom-0 inset-x-0 bg-card/90 backdrop-blur px-2 py-1 text-[10px] flex flex-col gap-0.5">
                    <span className="truncate font-medium">{label}</span>
                    {sub && <span className="truncate text-muted-foreground font-mono text-[9px] uppercase tracking-[0.1em]">{sub}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
