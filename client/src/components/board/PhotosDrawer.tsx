import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Plus, ImageIcon, Trash2 } from "lucide-react";
import { usePhotos, useCreatePhoto, useUploadImage, useDeletePhoto } from "@/hooks/use-projects";
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

interface PhotosDrawerProps {
  projectId: number;
  // Add a photo URL to the canvas. Wraps SpatialCanvas's existing handleAddImageByUrl.
  onAddImageUrl: (url: string) => void;
}

export function PhotosDrawer({ projectId, onAddImageUrl }: PhotosDrawerProps) {
  const { data: photos, isLoading } = usePhotos(projectId);
  const { mutate: createPhoto } = useCreatePhoto();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();
  const { mutateAsync: deletePhoto } = useDeletePhoto();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  // Delete confirmation state. Same Radix AlertDialog pattern as the Library
  // drawer (see PR #107) — native confirm() can be suppressed in some browser
  // contexts, and an in-app dialog matches the rest of the app's UX.
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImage(file);
        createPhoto(
          { projectId, url, caption: file.name },
          {
            onSuccess: () => toast({ title: "Uploaded", description: file.name }),
            onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
          }
        );
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const visible = (photos || []).filter((p: any) => {
    if (!filter.trim()) return true;
    return (p.caption || "").toLowerCase().includes(filter.toLowerCase().trim());
  });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    setBusyId(id);
    try {
      await deletePhoto({ id, projectId });
      toast({ title: "Asset removed" });
    } catch (e: any) {
      toast({ title: "Couldn't remove asset", description: e?.message || "Network error", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="drawer-photos">
      <div className="px-4 py-3 border-b border-border/60 space-y-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search captions…"
          className="h-9 text-sm"
          data-testid="input-photos-filter"
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full h-11 gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid="button-upload-photo"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload asset
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-photos-file"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No assets yet</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-[220px]">
              Upload images and add them to the board.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((p: any) => {
              const isBusy = busyId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  draggable={!isBusy}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("tool-type", "image");
                    e.dataTransfer.setData("image-url", p.url);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAddImageUrl(p.url)}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 hover:border-primary transition-colors bg-card"
                  data-testid={`drawer-photo-${p.id}`}
                >
                  <img
                    src={p.url}
                    alt={p.caption || ""}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/30 transition-colors pointer-events-none">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4" />
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Remove asset"
                    title="Remove asset"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!isBusy) setPendingDelete({ id: p.id, label: p.caption || "this asset" });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!isBusy) setPendingDelete({ id: p.id, label: p.caption || "this asset" });
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center h-6 w-6 rounded-md bg-card/95 backdrop-blur border border-border/60 text-foreground/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors opacity-0 group-hover:opacity-100 focus-within:opacity-100 ${isBusy ? "pointer-events-none opacity-50" : ""}`}
                    data-testid={`asset-remove-${p.id}`}
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </span>
                  {p.caption && (
                    <span className="absolute bottom-0 inset-x-0 bg-card/85 backdrop-blur px-2 py-0.5 text-[10px] truncate">
                      {p.caption}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent data-testid="asset-remove-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{pendingDelete?.label}” from your assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the upload from this project. Cards on boards that already use this image will keep displaying it, but you won't be able to drag this asset onto new boards. You can't undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="asset-remove-confirm-action"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
