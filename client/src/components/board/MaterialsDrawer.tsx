import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlanningBoards } from "@/hooks/use-projects";
import { Loader2, Layers, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MaterialsDrawerProps {
  projectId: number;
  // Add an image URL to the canvas. Same handler used by PhotosDrawer.
  onAddImageUrl: (url: string) => void;
}

interface CanvasElement {
  id: number;
  boardId: number;
  type: string;
  content: any;
}

// Aggregate all canvas elements across this project's library boards. We want items
// that are visually material-like: image, color_swatch, hardware, material, product.
const MATERIAL_TYPES = new Set(["image", "color_swatch", "hardware", "material", "product", "surface"]);

function useLibraryBoardElements(libraryBoards: any[]) {
  const enabled = Array.isArray(libraryBoards) && libraryBoards.length > 0;
  return useQuery({
    queryKey: ["materials-drawer", "library-elements", (libraryBoards || []).map((b: any) => b.id).sort().join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        (libraryBoards || []).map(async (b: any) => {
          const res = await fetch(`/api/planning-boards/${b.id}/elements`, { credentials: "include" });
          if (!res.ok) return [];
          const elements: CanvasElement[] = await res.json();
          return elements.map((el) => ({ ...el, boardName: b.name }));
        })
      );
      return results.flat();
    },
    enabled,
  });
}

export function MaterialsDrawer({ projectId, onAddImageUrl }: MaterialsDrawerProps) {
  const { data: boards, isLoading: loadingBoards } = usePlanningBoards(projectId);
  const libraryBoards = useMemo(
    () => (boards || []).filter((b: any) => b.mode === "library"),
    [boards]
  );
  const { data: elementsRaw, isLoading: loadingElements } = useLibraryBoardElements(libraryBoards);

  const items = useMemo(
    () => (elementsRaw || []).filter((el: any) => MATERIAL_TYPES.has(el.type)),
    [elementsRaw]
  );

  const collectionNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((el: any) => {
      const c = el.content || {};
      if (c.category) set.add(c.category);
    });
    return Array.from(set).sort();
  }, [items]);

  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => items.filter((el: any) => {
    const c = el.content || {};
    if (activeCollection && c.category !== activeCollection) return false;
    if (filter.trim()) {
      const hay = `${c.name || ""} ${c.title || ""} ${c.caption || ""} ${el.boardName || ""}`.toLowerCase();
      if (!hay.includes(filter.toLowerCase().trim())) return false;
    }
    return true;
  }), [items, activeCollection, filter]);

  const isLoading = loadingBoards || loadingElements;

  if (!isLoading && libraryBoards.length === 0) {
    return (
      <div className="flex flex-col h-full" data-testid="drawer-materials">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <Layers className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No materials yet</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Build a Library board to populate your materials drawer. Library mode lets you
            curate finishes, hardware, and products you can drag onto any project board.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="drawer-materials">
      <div className="px-4 py-3 border-b border-border/60 space-y-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search materials…"
          className="h-9 text-sm"
          data-testid="input-materials-filter"
        />
        {collectionNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCollection(null)}
              className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${activeCollection === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
              data-testid="materials-collection-all"
            >
              All
            </button>
            {collectionNames.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCollection(c)}
                className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${activeCollection === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                data-testid={`materials-collection-${c}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
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
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((el: any) => {
              const c = el.content || {};
              const url: string | undefined = c.url || c.imageUrl;
              const label = c.name || c.title || c.caption || el.type;
              const swatchColor = el.type === "color_swatch" ? (c.color || c.hex) : undefined;
              return (
                <button
                  key={el.id}
                  type="button"
                  draggable={!!url}
                  onDragStart={(e) => {
                    if (!url) return;
                    e.dataTransfer.setData("tool-type", "image");
                    e.dataTransfer.setData("image-url", url);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => { if (url) onAddImageUrl(url); }}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 hover:border-primary transition-colors bg-card text-left"
                  data-testid={`drawer-material-${el.id}`}
                >
                  {url ? (
                    <img src={url} alt={label} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                  ) : swatchColor ? (
                    <span className="block w-full h-full" style={{ backgroundColor: swatchColor }} />
                  ) : (
                    <span className="flex w-full h-full items-center justify-center bg-muted text-muted-foreground text-[10px] font-mono uppercase tracking-[0.14em]">
                      {el.type}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/30 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="absolute bottom-0 inset-x-0 bg-card/90 backdrop-blur px-2 py-0.5 text-[10px] truncate flex items-center justify-between gap-1">
                    <span className="truncate">{label}</span>
                    {el.boardName && (
                      <span className="text-muted-foreground font-mono text-[9px] uppercase tracking-[0.1em] shrink-0 truncate max-w-[60px]">{el.boardName}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!isLoading && libraryBoards.length > 0 && items.length === 0 && (
          <div className="text-center py-12 px-6">
            <p className="text-xs text-muted-foreground">
              Your library boards have no material-like items yet. Add images, color swatches,
              materials, or hardware to a library board to see them here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
