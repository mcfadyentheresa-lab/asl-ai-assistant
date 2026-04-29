import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Plus, ImageIcon } from "lucide-react";
import { usePhotos, useCreatePhoto, useUploadImage } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

interface PhotosDrawerProps {
  projectId: number;
  // Add a photo URL to the canvas. Wraps SpatialCanvas's existing handleAddImageByUrl.
  onAddImageUrl: (url: string) => void;
}

export function PhotosDrawer({ projectId, onAddImageUrl }: PhotosDrawerProps) {
  const { data: photos, isLoading } = usePhotos(projectId);
  const { mutate: createPhoto } = useCreatePhoto();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");

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
          Upload photo
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
            <p className="text-sm text-muted-foreground">No photos yet</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-[220px]">
              Upload progress photos and add them to the board.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((p: any) => (
              <button
                key={p.id}
                type="button"
                draggable
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
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/30 transition-colors">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground">
                    <Plus className="h-4 w-4" />
                  </span>
                </span>
                {p.caption && (
                  <span className="absolute bottom-0 inset-x-0 bg-card/85 backdrop-blur px-2 py-0.5 text-[10px] truncate">
                    {p.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
