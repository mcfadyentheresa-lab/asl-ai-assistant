// Library mode "Covers" view — a curated visual showcase that replaces the
// spatial canvas + chip strip when viewing a library board.
//
// Two screens:
//   1. Home: grid of collection-cover cards (cover image + name + count).
//   2. Inside a collection: uniform 1:1 tile masonry of the collection's
//      items, with drag-to-reorder.
//
// Both screens are rendered on a warm-paper background. Single tap = select.
// Double-tap on a tile or cover opens the item / drills in. Long-press 300ms
// arms a tile drag to reorder (preserves canvas gesture rules).
//
// "Categories" are surfaced to the user as "Collections" — naming-only; the
// underlying field on each element's content is still `category`.

import { useMemo, useRef, useState } from "react";
import { Plus, ChevronLeft, Image as ImageIcon, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explicitCategory, orderRooms } from "@/lib/board-rooms";
import type { CanvasElement } from "@shared/schema";

type ItemImageInfo = {
  url: string | null;
  title: string;
  source: string;
};

// Pull a representative image url from any item type that can carry one.
function itemImage(el: CanvasElement): string | null {
  const c = (el.content as any) || {};
  if (el.type === "image" && typeof c.url === "string" && c.url.trim()) return c.url;
  if (el.type === "link" && typeof c.imageUrl === "string" && c.imageUrl.trim()) return c.imageUrl;
  if (typeof c.imageUrl === "string" && c.imageUrl.trim()) return c.imageUrl;
  if (typeof c.thumbnailUrl === "string" && c.thumbnailUrl.trim()) return c.thumbnailUrl;
  return null;
}

function itemTitle(el: CanvasElement): string {
  const c = (el.content as any) || {};
  return (
    (typeof c.name === "string" && c.name) ||
    (typeof c.title === "string" && c.title) ||
    (typeof c.caption === "string" && c.caption) ||
    (el.type ? String(el.type).replace(/_/g, " ") : "Item")
  );
}

function itemSource(el: CanvasElement): string {
  const c = (el.content as any) || {};
  return (
    (typeof c.supplier === "string" && c.supplier) ||
    (typeof c.brand === "string" && c.brand) ||
    (typeof c.siteName === "string" && c.siteName) ||
    (typeof c.source === "string" && c.source) ||
    ""
  );
}

function itemInfo(el: CanvasElement): ItemImageInfo {
  return { url: itemImage(el), title: itemTitle(el), source: itemSource(el) };
}

interface LibraryCollectionsViewProps {
  elements: CanvasElement[];
  savedCategoryOrder: string[];
  onPersistCategoryOrder: (order: string[]) => void;
  // Open the spec/edit experience for a tapped item. Implementation: switch
  // the board view back to "chips" and select the element on the canvas.
  onOpenItem: (elementId: number) => void;
  // Create a brand-new collection (named category lane).
  onCreateCollection: () => void;
  // Reorder items inside a collection. Items are persisted by zIndex; lower
  // zIndex appears earlier in the grid.
  onReorderItems: (orderedItemIds: number[]) => void;
  // Default `false`. When true, empty collections render in the home grid.
  showEmptyCollections: boolean;
  onToggleShowEmptyCollections: () => void;
}

export default function LibraryCollectionsView({
  elements,
  savedCategoryOrder,
  onPersistCategoryOrder,
  onOpenItem,
  onCreateCollection,
  onReorderItems,
  showEmptyCollections,
  onToggleShowEmptyCollections,
}: LibraryCollectionsViewProps) {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  // Group items by collection (category). Items with no category land in
  // an "Uncategorized" bucket, only shown if non-empty.
  const groups = useMemo(() => {
    const map = new Map<string, CanvasElement[]>();
    for (const el of elements) {
      if (el.type === "connector" || el.type === "draw" || el.type === "room_zone") continue;
      const cat = explicitCategory(el) || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(el);
    }
    // Stable item order inside each group: zIndex asc, then id.
    for (const [k, list] of map) {
      list.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0) || a.id - b.id);
      map.set(k, list);
    }
    return map;
  }, [elements]);

  const namedCollections = useMemo(() => {
    const names = Array.from(groups.keys()).filter((n) => n !== "Uncategorized");
    return orderRooms(names, savedCategoryOrder);
  }, [groups, savedCategoryOrder]);

  const collectionsForGrid = useMemo(() => {
    const list = namedCollections.map((name) => ({ name, items: groups.get(name) || [] }));
    // "Uncategorized" only ever shows when it has items.
    const uncat = groups.get("Uncategorized") || [];
    if (uncat.length > 0) list.push({ name: "Uncategorized", items: uncat });
    return showEmptyCollections ? list : list.filter((c) => c.items.length > 0);
  }, [namedCollections, groups, showEmptyCollections]);

  const totalCollections = namedCollections.length + (groups.get("Uncategorized")?.length ? 1 : 0);
  const hiddenEmpty = totalCollections - collectionsForGrid.length;

  if (activeCollection !== null) {
    const items = groups.get(activeCollection) || [];
    return (
      <CollectionTileGrid
        name={activeCollection}
        items={items}
        onBack={() => setActiveCollection(null)}
        onOpenItem={onOpenItem}
        onReorderItems={onReorderItems}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto canvas-paper px-5 md:px-8 py-6" data-testid="library-home">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground" data-testid="text-library-heading">Collections</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {collectionsForGrid.length === 0
                ? "No collections yet — create one to start curating."
                : `${collectionsForGrid.length} ${collectionsForGrid.length === 1 ? "collection" : "collections"}`}
              {hiddenEmpty > 0 && !showEmptyCollections && (
                <button
                  type="button"
                  onClick={onToggleShowEmptyCollections}
                  className="ml-2 text-primary hover:underline"
                  data-testid="button-show-empty-collections"
                >
                  · show {hiddenEmpty} empty
                </button>
              )}
              {showEmptyCollections && hiddenEmpty === 0 && namedCollections.some((n) => (groups.get(n) || []).length === 0) && (
                <button
                  type="button"
                  onClick={onToggleShowEmptyCollections}
                  className="ml-2 text-primary hover:underline"
                  data-testid="button-hide-empty-collections"
                >
                  · hide empty
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5" data-testid="library-collection-grid">
          {collectionsForGrid.map((c) => (
            <CollectionCoverCard
              key={c.name}
              name={c.name}
              items={c.items}
              onOpen={() => setActiveCollection(c.name)}
              onPersistCategoryOrder={onPersistCategoryOrder}
              savedCategoryOrder={savedCategoryOrder}
            />
          ))}
          <button
            type="button"
            onClick={onCreateCollection}
            className="aspect-[4/5] rounded-xl border-2 border-dashed border-border/70 bg-card/30 hover:bg-card/50 hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary min-h-11"
            data-testid="button-new-collection"
          >
            <Plus className="h-6 w-6" strokeWidth={1.5} />
            <span className="text-sm font-semibold">New Collection</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface CollectionCoverCardProps {
  name: string;
  items: CanvasElement[];
  onOpen: () => void;
  savedCategoryOrder: string[];
  onPersistCategoryOrder: (order: string[]) => void;
}

function CollectionCoverCard({ name, items, onOpen }: CollectionCoverCardProps) {
  // Cover = first item with an image. Falls back to a soft paper placeholder.
  const coverInfo = useMemo<ItemImageInfo | null>(() => {
    for (const el of items) {
      const url = itemImage(el);
      if (url) return itemInfo(el);
    }
    return null;
  }, [items]);
  const lastTapRef = useRef<number>(0);

  const handleClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      onOpen();
      return;
    }
    lastTapRef.current = now;
  };

  const cardClass = "board-card aspect-[4/5] rounded-xl bg-card overflow-hidden cursor-pointer min-h-11 flex flex-col";

  return (
    <button
      type="button"
      className={cardClass}
      onClick={handleClick}
      onDoubleClick={onOpen}
      data-testid={`collection-cover-${name}`}
    >
      <div className="relative flex-1 bg-muted/40 overflow-hidden">
        {coverInfo?.url ? (
          <img
            src={coverInfo.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.25} />
          </div>
        )}
      </div>
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
        <span className="font-sans font-semibold text-sm text-foreground truncate text-left">{name}</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
          {items.length}
        </span>
      </div>
    </button>
  );
}

interface CollectionTileGridProps {
  name: string;
  items: CanvasElement[];
  onBack: () => void;
  onOpenItem: (id: number) => void;
  onReorderItems: (orderedItemIds: number[]) => void;
}

function CollectionTileGrid({ name, items, onBack, onOpenItem, onReorderItems }: CollectionTileGridProps) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // 300ms long-press to arm drag — preserves PR #31's iPad gesture rule
  // (single tap selects/opens via double-tap, long-press arms move).
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armDrag = (id: number) => {
    longPressTimerRef.current = setTimeout(() => {
      setDragId(id);
    }, 300);
  };
  const cancelArm = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const moveTo = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorderItems(next);
  };

  return (
    <div className="flex-1 overflow-y-auto canvas-paper px-5 md:px-8 py-6" data-testid="library-collection">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-11 px-3 -ml-3 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            data-testid="button-collection-back"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="text-xs">Collections</span>
          </button>
          <span className="text-border/80">·</span>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground truncate" data-testid="text-collection-heading">{name}</h2>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{items.length}</span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center" data-testid="empty-collection">
            <p className="text-sm text-muted-foreground">No items in this collection yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Tag items with this category from the canvas to add them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="collection-tile-grid">
            {items.map((el) => {
              const info = itemInfo(el);
              const isDragging = dragId === el.id;
              const isOver = overId === el.id && dragId !== el.id;
              return (
                <div
                  key={el.id}
                  draggable
                  onDragStart={() => setDragId(el.id)}
                  onDragOver={(e) => { e.preventDefault(); setOverId(el.id); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDrop={(e) => { e.preventDefault(); moveTo(el.id); setDragId(null); setOverId(null); }}
                  onTouchStart={() => armDrag(el.id)}
                  onTouchMove={cancelArm}
                  onTouchEnd={cancelArm}
                  onTouchCancel={cancelArm}
                  className={`group relative aspect-square rounded-xl overflow-hidden bg-card cursor-pointer min-h-11 board-card ${isDragging ? "opacity-60" : ""} ${isOver ? "is-selected" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    // Double-tap detection via timestamp (works for both
                    // mouse + touch, complements PR #34's gesture rule).
                    const now = Date.now();
                    const last = (e.currentTarget as any).__lastTap || 0;
                    if (now - last < 350) {
                      onOpenItem(el.id);
                    }
                    (e.currentTarget as any).__lastTap = now;
                  }}
                  onDoubleClick={() => onOpenItem(el.id)}
                  data-testid={`collection-tile-${el.id}`}
                >
                  {info.url ? (
                    <img
                      src={info.url}
                      alt={info.title}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                      <ImageIcon className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.25} />
                    </div>
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/55 via-black/25 to-transparent text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 pointer-events-none"
                  >
                    <div className="font-sans font-semibold text-[14px] leading-tight line-clamp-1">{info.title}</div>
                    {info.source && (
                      <div className="text-[12px] leading-tight text-white/70 line-clamp-1 mt-0.5">{info.source}</div>
                    )}
                  </div>
                  {dragId !== null && (
                    <div className="absolute top-2 right-2 bg-card/90 backdrop-blur rounded-md p-1 text-muted-foreground pointer-events-none">
                      <GripVertical className="h-3 w-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
