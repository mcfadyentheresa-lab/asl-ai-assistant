import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlanningBoards, usePhotos, useCreatePhoto, useDeletePhoto, useUploadImage } from "@/hooks/use-projects";
import { Loader2, Layers, Plus, Palette, Shapes, Wrench, Armchair, Trash2, RefreshCw, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MaterialsDrawerProps {
  projectId: number;
  // Add an image URL to the canvas. Used as a fallback for items that have only an image,
  // not a structured kind. Structured kinds drag onto the canvas as their native card type.
  onAddImageUrl: (url: string) => void;
  // Step 6 — cross-board filter by active room/category. When the user is
  // focused on a room tab (e.g. Kitchen), they can toggle a chip that hides
  // every library item whose tagged room/category doesn't match. This is the
  // payoff for the user's tagging investment: tag a card to a room, then see
  // only that room's stuff across every board.
  activeRoom?: string | null;
  // Label shown on the room scope chip. "Room" for project boards,
  // "Category" for library boards. Falls back to "Tag" if not given.
  activeRoomLabel?: string;
}

interface CanvasElement {
  id: number;
  boardId: number;
  type: string;
  content: any;
}

// All element types that should appear in the Assets drawer. We intentionally include items
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

export function MaterialsDrawer({ projectId, onAddImageUrl, activeRoom, activeRoomLabel }: MaterialsDrawerProps) {
  const { data: boards, isLoading: loadingBoards } = usePlanningBoards(projectId);
  const allBoards = useMemo(() => boards || [], [boards]);
  const { data: elementsRaw, isLoading: loadingElements } = useAllProjectElements(allBoards);
  // Project-level photo uploads. We surface these in the same Assets grid so
  // users don't need a separate "Photos" drawer just to find raw uploads —
  // every reference image lives in one place. Photos are represented as
  // virtual image elements with _photoId set; Remove routes to /api/photos.
  const { data: photos, isLoading: loadingPhotos } = usePhotos(projectId);
  const { mutate: createPhoto } = useCreatePhoto();
  const { mutateAsync: deletePhoto } = useDeletePhoto();
  const { mutateAsync: uploadImage, isPending: isUploadingPhoto } = useUploadImage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  // Hidden input for the "Upload" button at the top of the drawer.
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  // Per-tile pending state: which dedupe-group is currently mutating, and what kind of op.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Hidden file input for the Replace flow. We share a single input across the
  // grid, with the active dedupe key tracked in a ref so onChange knows which
  // tile to patch when the user picks a file.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<{ key: string; ids: number[] } | null>(null);

  // Confirmation dialog state for Remove. We use Radix AlertDialog instead of
  // window.confirm because (a) some browsers/contexts can suppress the native
  // confirm, and (b) it gives a much better UX matching the rest of the app.
  const [pendingRemove, setPendingRemove] = useState<{
    key: string;
    canvasElementIds: number[];
    photoIds: number[];
    label: string;
  } | null>(null);

  const invalidateLibrary = async () => {
    // Force-refetch every query that produces Assets data. Prefix matching is
    // the default but we use refetchType:'all' so even inactive queries are
    // refetched — the badge counts and grid both depend on this returning fresh.
    await queryClient.invalidateQueries({
      queryKey: ["library-drawer", "all-elements"],
      refetchType: "all",
    });
    // Photos query — raw uploads now appear in the same grid, so deletes /
    // uploads need to refresh both lists.
    await queryClient.invalidateQueries({ queryKey: ["/api/projects/:projectId/photos", projectId], refetchType: "all" });
    // The per-board elements queries used by SpatialCanvas also need to drop
    // their cache so the deleted/replaced element disappears from canvases.
    await Promise.all((allBoards || []).map((b: any) =>
      queryClient.invalidateQueries({ queryKey: [`/api/planning-boards/${b.id}/elements`], refetchType: "all" })
    ));
  };

  // Upload-from-disk handler for the new "Upload" button at the top of the
  // drawer. Replaces the old PhotosDrawer's upload flow — same hook, same
  // backend route, just lives in the merged drawer now. Multiple files are
  // uploaded sequentially; on success they appear as photo tiles in the grid.
  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImage(file);
        createPhoto(
          { projectId, url, caption: file.name },
          {
            onError: (err: any) => toast({ title: "Upload failed", description: err?.message || file.name, variant: "destructive" }),
          }
        );
      } catch (err: any) {
        toast({ title: "Upload failed", description: err?.message || file.name, variant: "destructive" });
      }
    }
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    // Force a refresh once the createPhoto mutations resolve. Their hook
    // already invalidates the photos query — invalidateLibrary makes sure the
    // unified grid here also re-renders.
    setTimeout(() => { invalidateLibrary(); }, 100);
  };

  // Project-level photos surfaced as virtual image elements so they slot
  // straight into the existing dedupe + filter pipeline. id is namespaced
  // with the photo: prefix so it can never collide with a real canvas
  // element id, and _photoId carries the real photo id for delete routing.
  const photoElements = useMemo(() => {
    return (photos || []).map((p: any) => ({
      id: `photo:${p.id}`,
      _photoId: p.id,
      boardId: -1,
      boardName: "Uploads",
      boardMode: "uploads",
      type: "image",
      content: { imageUrl: p.url, url: p.url, caption: p.caption, name: p.caption },
    }));
  }, [photos]);

  const items = useMemo(
    () => [...(elementsRaw || []), ...photoElements]
      .filter((el: any) => LIBRARY_TYPES.has(el.type))
      // De-dupe by (kind, name+hex) so the same paint colour saved on five boards shows once.
      .reduce((acc: any[], el: any) => {
        const c = el.content || {};
        const key = `${bucketFor(el)}|${(c.name || c.title || "").toLowerCase()}|${(c.hex || c.color || c.imageUrl || c.url || "").toLowerCase()}`;
        const existing = acc.find((x) => x._dedupeKey === key);
        if (!existing) {
          acc.push({ ...el, _dedupeKey: key });
        } else if (el._photoId && !existing._photoId) {
          // If a duplicate exists where one is a raw photo upload and the other
          // is a board element, prefer keeping the photo upload reference so
          // Remove can clean up the source photo. The board element is still
          // discoverable through the same key.
          existing._photoId = el._photoId;
        }
        return acc;
      }, []),
    [elementsRaw, photoElements]
  );

  const [activeBucket, setActiveBucket] = useState<KindBucket>("all");
  const [filter, setFilter] = useState("");
  // When a room is active in the parent canvas, the user can opt-in to scope
  // the library to just that room/category. Defaults to off so first-open
  // behaviour is unchanged.
  const [scopeToRoom, setScopeToRoom] = useState(false);
  // If the active room is cleared, drop scope so the chip never strands on a
  // value that's no longer focused.
  useEffect(() => { if (!activeRoom) setScopeToRoom(false); }, [activeRoom]);

  const counts = useMemo(() => {
    const out: Record<KindBucket, number> = { all: items.length, paint: 0, material: 0, hardware: 0, product: 0, photo: 0 };
    items.forEach((el: any) => { out[bucketFor(el)] = (out[bucketFor(el)] || 0) + 1; });
    return out;
  }, [items]);

  const visible = useMemo(() => items.filter((el: any) => {
    if (activeBucket !== "all" && bucketFor(el) !== activeBucket) return false;
    if (scopeToRoom && activeRoom) {
      const c = el.content || {};
      const tagged = String(c.room || c.category || "").trim().toLowerCase();
      if (tagged !== activeRoom.trim().toLowerCase()) return false;
    }
    if (filter.trim()) {
      const c = el.content || {};
      const hay = `${c.name || ""} ${c.title || ""} ${c.caption || ""} ${c.brand || ""} ${c.supplier || ""} ${c.code || ""} ${el.boardName || ""}`.toLowerCase();
      if (!hay.includes(filter.toLowerCase().trim())) return false;
    }
    return true;
  }), [items, activeBucket, filter, scopeToRoom, activeRoom]);

  // Map of dedupe-key -> { canvasElementIds, photoIds } so Remove can purge
  // every copy across boards AND the underlying source photo upload(s) (if
  // any), otherwise the de-duped tile would reappear after one delete.
  const idsByDedupeKey = useMemo(() => {
    const map = new Map<string, { canvasElementIds: number[]; photoIds: number[] }>();
    const push = (key: string, type: "el" | "photo", id: number) => {
      const cur = map.get(key) || { canvasElementIds: [], photoIds: [] };
      if (type === "el") cur.canvasElementIds.push(id);
      else cur.photoIds.push(id);
      map.set(key, cur);
    };
    (elementsRaw || []).forEach((el: any) => {
      if (!LIBRARY_TYPES.has(el.type)) return;
      const c = el.content || {};
      const key = `${bucketFor(el)}|${(c.name || c.title || "").toLowerCase()}|${(c.hex || c.color || c.imageUrl || c.url || "").toLowerCase()}`;
      push(key, "el", el.id);
    });
    photoElements.forEach((el: any) => {
      const c = el.content || {};
      const key = `${bucketFor(el)}|${(c.name || c.title || "").toLowerCase()}|${(c.hex || c.color || c.imageUrl || c.url || "").toLowerCase()}`;
      push(key, "photo", el._photoId);
    });
    return map;
  }, [elementsRaw, photoElements]);

  // Confirmation state now also tracks photo ids so the dialog can describe
  // the cleanup accurately and the confirm handler can fire both deletes.
  type PendingRemove = {
    key: string;
    canvasElementIds: number[];
    photoIds: number[];
    label: string;
  };

  const requestRemove = (el: any) => {
    const key: string = el._dedupeKey;
    const group = idsByDedupeKey.get(key) || { canvasElementIds: [], photoIds: [] };
    const label = el.content?.name || el.content?.title || el.content?.caption || "this item";
    if (group.canvasElementIds.length === 0 && group.photoIds.length === 0) {
      // Defensive: nothing to delete — happens if the grouping map drifted from
      // the rendered tile (race during refetch). Just silently no-op.
      return;
    }
    setPendingRemove({
      key,
      canvasElementIds: group.canvasElementIds,
      photoIds: group.photoIds,
      label,
    });
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const { key, canvasElementIds, photoIds } = pendingRemove;
    setPendingRemove(null);
    setBusyKey(key);
    try {
      // Delete every canvas element in the dedupe group + every source photo
      // upload that fed into it. Both are needed: skip the photo and the tile
      // reappears on next refresh; skip the elements and the saved cards on
      // boards stay (which is fine for replace flows but not remove).
      const elResults = await Promise.all(canvasElementIds.map((id) =>
        fetch(`/api/canvas-elements/${id}`, { method: "DELETE", credentials: "include" })
      ));
      const photoResults = await Promise.allSettled(photoIds.map((id) => deletePhoto({ id, projectId })));
      const elFailed = elResults.filter((r) => !r.ok).length;
      const photoFailed = photoResults.filter((r) => r.status === "rejected").length;
      const total = canvasElementIds.length + photoIds.length;
      const failed = elFailed + photoFailed;
      if (failed > 0) {
        toast({ title: "Some copies couldn't be removed", description: `${failed} of ${total} failed. Try again.`, variant: "destructive" });
      } else {
        const parts: string[] = [];
        if (canvasElementIds.length) parts.push(`${canvasElementIds.length} board ${canvasElementIds.length === 1 ? "card" : "cards"}`);
        if (photoIds.length) parts.push(`${photoIds.length} ${photoIds.length === 1 ? "upload" : "uploads"}`);
        toast({ title: "Removed", description: parts.join(" + ") });
      }
      await invalidateLibrary();
    } catch (e: any) {
      toast({ title: "Remove failed", description: e?.message || "Network error", variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleReplaceClick = (el: any) => {
    const key: string = el._dedupeKey;
    // Replace only operates on real canvas elements — raw photo uploads have
    // no PATCH endpoint. Fall back to the tile's own id only when it's a
    // numeric canvas element (not a `photo:NN` virtual id).
    const group = idsByDedupeKey.get(key);
    const ids = group?.canvasElementIds.length
      ? group.canvasElementIds
      : (typeof el.id === "number" ? [el.id] : []);
    if (ids.length === 0) {
      toast({ title: "Can't replace", description: "This is a raw upload — remove and re-upload instead." });
      return;
    }
    replaceTargetRef.current = { key, ids };
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    setBusyKey(target.key);
    try {
      const result = await uploadFile(file);
      if (!result) throw new Error("Upload failed");
      const newUrl = result.objectPath;
      // PATCH every element in the dedupe group so all copies stay in sync.
      // Look the existing content up in the already-loaded elementsRaw cache —
      // there's no single-element GET endpoint, but we have the full list here.
      const patchResults = await Promise.all(target.ids.map(async (id) => {
        const existing = (elementsRaw || []).find((x: any) => x.id === id);
        const nextContent = { ...(existing?.content || {}), imageUrl: newUrl, url: newUrl };
        const res = await fetch(`/api/canvas-elements/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: nextContent }),
        });
        return res.ok;
      }));
      const failed = patchResults.filter((ok) => !ok).length;
      if (failed > 0) {
        toast({ title: "Replace partially failed", description: `${failed} of ${target.ids.length} copies didn't update.`, variant: "destructive" });
      } else {
        toast({ title: "Image replaced", description: `${target.ids.length} ${target.ids.length === 1 ? "copy" : "copies"} updated.` });
      }
      await invalidateLibrary();
    } catch (err: any) {
      toast({ title: "Replace failed", description: err?.message || "Upload error", variant: "destructive" });
    } finally {
      setBusyKey(null);
      replaceTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isLoading = loadingBoards || loadingElements || loadingPhotos;

  if (!isLoading && allBoards.length === 0) {
    return (
      <div className="flex flex-col h-full" data-testid="drawer-materials">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <Layers className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nothing in your assets yet</p>
          <p className="text-xs text-muted-foreground max-w-[300px]">
            Upload a photo with the button above, or add a paint swatch, material, hardware, or
            product card to any board in this project. Everything you save here can be dragged
            onto any board.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="drawer-materials">
      <div className="px-4 py-3 border-b border-border/60 space-y-2.5">
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, brand, code…"
            className="h-9 text-sm flex-1"
            data-testid="input-materials-filter"
          />
          {/* Hidden input + button: drop a photo into the project from inside
              the merged Assets drawer. Replaces the standalone PhotosDrawer. */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUploadFiles}
            data-testid="materials-upload-input"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 gap-1.5 shrink-0"
            onClick={() => uploadInputRef.current?.click()}
            disabled={isUploadingPhoto}
            data-testid="button-materials-upload"
          >
            {isUploadingPhoto ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">Upload</span>
          </Button>
        </div>
        {activeRoom && (
          <button
            type="button"
            onClick={() => setScopeToRoom((v) => !v)}
            className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 ${scopeToRoom ? "bg-[#2f4a3a] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            data-testid="materials-scope-room"
            aria-pressed={scopeToRoom}
            title={scopeToRoom ? `Showing items tagged to ${activeRoom}` : `Show only items tagged to ${activeRoom}`}
          >
            {scopeToRoom ? `✓ ${activeRoomLabel || "Tag"}: ${activeRoom}` : `Filter to ${activeRoomLabel || "Tag"}: ${activeRoom}`}
          </button>
        )}
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
            {/* Shared hidden file input for the Replace flow. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReplaceFile}
              data-testid="library-replace-file-input"
            />
            {visible.map((el: any) => {
              const c = el.content || {};
              const url: string | undefined = c.imageUrl || c.url;
              const swatchColor = (el.type === "color_swatch" || (el.type === "surface" && c.kind === "paint")) ? (c.color || c.hex) : undefined;
              const label = c.name || c.title || c.caption || el.type;
              const sub = c.brand || c.supplier || c.code || el.boardName || "";
              const bucket = bucketFor(el);
              const isBusy = busyKey === el._dedupeKey;
              const _group = idsByDedupeKey.get(el._dedupeKey);
              const groupSize = (_group ? _group.canvasElementIds.length + _group.photoIds.length : 0) || 1;

              return (
                <button
                  key={el.id}
                  type="button"
                  draggable={!isBusy}
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
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/30 transition-colors pointer-events-none">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4" />
                    </span>
                  </span>
                  {/* Hover affordances: Replace (image kinds only) and Remove. */}
                  <span
                    className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!swatchColor && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Replace image"
                        title="Replace image"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!isBusy) handleReplaceClick(el); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); if (!isBusy) handleReplaceClick(el); } }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        className={`inline-flex items-center justify-center h-6 w-6 rounded-md bg-card/95 backdrop-blur border border-border/60 text-foreground/80 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors ${isBusy ? "pointer-events-none opacity-50" : ""}`}
                        data-testid={`library-replace-${el.id}`}
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={groupSize > 1 ? `Remove from library (${groupSize} copies)` : "Remove from library"}
                      title={groupSize > 1 ? `Remove from library — deletes ${groupSize} copies across boards` : "Remove from library"}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (!isBusy) requestRemove(el); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); if (!isBusy) requestRemove(el); } }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded-md bg-card/95 backdrop-blur border border-border/60 text-foreground/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors ${isBusy ? "pointer-events-none opacity-50" : ""}`}
                      data-testid={`library-remove-${el.id}`}
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
      <AlertDialog open={!!pendingRemove} onOpenChange={(v) => { if (!v) setPendingRemove(null); }}>
        <AlertDialogContent data-testid="library-remove-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{pendingRemove?.label}” from your assets?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!pendingRemove) return null;
                const cards = pendingRemove.canvasElementIds.length;
                const uploads = pendingRemove.photoIds.length;
                const parts: string[] = [];
                if (cards) parts.push(`${cards} board ${cards === 1 ? "card" : "cards"}`);
                if (uploads) parts.push(`${uploads} ${uploads === 1 ? "upload" : "uploads"}`);
                if (parts.length === 0) return `This deletes it. You can't undo this.`;
                return `This deletes ${parts.join(" and ")} across this project. You can't undo this.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="library-remove-confirm-action"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
