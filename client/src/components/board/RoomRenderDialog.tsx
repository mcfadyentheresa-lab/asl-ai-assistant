// Room render dialog (PR-S). Admin/crew only — gating is enforced server-side
// at every endpoint and at the trigger that opens this. Two modes: re-style a
// source photo or imagine from scratch. Polls every 2s while a job is running.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2, Download, Share2, Sparkles, Wand2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type RenderMode = "restyle" | "imagine";

export interface RoomRenderRecord {
  id: number;
  projectId: number;
  boardId: number | null;
  roomName: string;
  mode: RenderMode;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  prompt: string;
  status: "queued" | "rendering" | "completed" | "failed";
  errorMessage: string | null;
  costEstimateCents: number | null;
  createdAt: string | null;
  createdBy: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: number;
  boardId: number;
  roomName: string;
  // The room_zone element backing this room (so we can patch its sourcePhoto).
  roomZoneElementId: number | null;
  initialSourcePhotoUrl: string | null;
  onSourcePhotoUpdated: (url: string | null) => void;
}

const ESTIMATED_COST_CENTS = 4;

function fmtCents(c: number | null | undefined): string {
  const n = c ?? ESTIMATED_COST_CENTS;
  return `$${(n / 100).toFixed(2)}`;
}

export default function RoomRenderDialog({
  open,
  onOpenChange,
  projectId,
  boardId,
  roomName,
  roomZoneElementId,
  initialSourcePhotoUrl,
  onSourcePhotoUpdated,
}: Props) {
  const { toast } = useToast();
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(initialSourcePhotoUrl);
  const [mode, setMode] = useState<RenderMode>(initialSourcePhotoUrl ? "restyle" : "imagine");
  const [activeJob, setActiveJob] = useState<RoomRenderRecord | null>(null);
  const [history, setHistory] = useState<RoomRenderRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSourcePhotoUrl(initialSourcePhotoUrl);
  }, [initialSourcePhotoUrl]);

  useEffect(() => {
    if (!open) return;
    setMode(sourcePhotoUrl ? "restyle" : "imagine");
    void refreshHistory();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const refreshHistory = async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/room-renders?room=${encodeURIComponent(roomName)}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const data: RoomRenderRecord[] = await res.json();
      setHistory(data);
    } catch {
      // best-effort
    }
  };

  const persistSourcePhoto = async (url: string | null) => {
    if (!roomZoneElementId) {
      toast({
        title: "No room zone",
        description: "This room doesn't have a zone element yet — open the canvas first.",
        variant: "destructive",
      });
      return;
    }
    const res = await fetch(`/api/board/element/${roomZoneElementId}/source-photo`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePhotoUrl: url }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Couldn't save photo", description: data.message || "Try again.", variant: "destructive" });
      return;
    }
    setSourcePhotoUrl(url);
    onSourcePhotoUpdated(url);
  };

  const onUpload = async (file: File) => {
    if (!roomZoneElementId) {
      toast({ title: "No room zone", description: "Save the room first.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/board/element/${roomZoneElementId}/source-photo/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Upload failed", description: data.message || "Try a smaller file.", variant: "destructive" });
        return;
      }
      await persistSourcePhoto(data.url);
      setMode("restyle");
    } finally {
      setUploading(false);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (jobId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/render/${jobId}`, { credentials: "include" });
        if (!res.ok) return;
        const row: RoomRenderRecord = await res.json();
        setActiveJob(row);
        if (row.status === "rendering") setProgressStage("Rendering…");
        else if (row.status === "queued") setProgressStage("Building prompt…");
        if (row.status === "completed" || row.status === "failed") {
          stopPolling();
          void refreshHistory();
          if (row.status === "failed") {
            toast({
              title: "Render failed",
              description: row.errorMessage || "Try again.",
              variant: "destructive",
            });
          }
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const submit = async () => {
    if (mode === "restyle" && !sourcePhotoUrl) {
      toast({ title: "Add a source photo", description: "Re-style needs a photo of the room.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setProgressStage("Reading room…");
    try {
      const res = await fetch(`/api/rooms/render`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, boardId, roomName, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't start render", description: data.message || "Try again.", variant: "destructive" });
        setProgressStage("");
        return;
      }
      const initial: RoomRenderRecord = {
        id: data.jobId,
        projectId,
        boardId,
        roomName,
        mode,
        imageUrl: null,
        thumbnailUrl: null,
        prompt: "",
        status: data.status || "queued",
        errorMessage: null,
        costEstimateCents: null,
        createdAt: null,
        createdBy: null,
      };
      setActiveJob(initial);
      startPolling(data.jobId);
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (jobId: number) => {
    const res = await fetch(`/api/rooms/render/${jobId}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      toast({ title: "Couldn't delete", variant: "destructive" });
      return;
    }
    if (activeJob?.id === jobId) setActiveJob(null);
    void refreshHistory();
  };

  const completed = activeJob?.status === "completed";
  const inProgress = activeJob && (activeJob.status === "queued" || activeJob.status === "rendering");

  const stage = useMemo(() => {
    if (!activeJob) return progressStage;
    if (activeJob.status === "queued") return "Building prompt…";
    if (activeJob.status === "rendering") return "Rendering…";
    return progressStage;
  }, [activeJob, progressStage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" data-testid="room-render-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#2f4a3a]" /> Render {roomName}
          </DialogTitle>
          <DialogDescription>
            Generate a photorealistic vision for this room from your selected paint, materials, and hardware.
          </DialogDescription>
        </DialogHeader>

        {/* Section 1 — Source photo */}
        <section className="mt-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2"
            style={{ fontFamily: "var(--font-mono)" }}>
            Source photo
          </div>
          {sourcePhotoUrl ? (
            <div className="flex items-start gap-3">
              <img
                src={sourcePhotoUrl}
                alt="Source"
                className="h-28 w-28 object-cover rounded border border-border"
                data-testid="room-render-source-thumb"
              />
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px]"
                  data-testid="room-render-change-photo"
                >
                  <Upload className="h-4 w-4 mr-1" /> Change photo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => persistSourcePhoto(null)}
                  className="min-h-[44px] text-red-700"
                  data-testid="room-render-remove-photo"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="min-h-[44px]"
              data-testid="room-render-add-photo"
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Add a photo of this room (optional)
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onUpload(f);
            }}
          />
        </section>

        {/* Section 2 — Mode toggle */}
        <section className="mt-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2"
            style={{ fontFamily: "var(--font-mono)" }}>
            Mode
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!sourcePhotoUrl}
              onClick={() => setMode("restyle")}
              className={`min-h-[80px] rounded-md border p-3 text-left transition-colors ${
                mode === "restyle"
                  ? "bg-[#2f4a3a] text-white border-[#2f4a3a]"
                  : "bg-[#f7f1e7] border-border hover:border-[#2f4a3a]/40"
              } ${!sourcePhotoUrl ? "opacity-40 cursor-not-allowed" : ""}`}
              data-testid="room-render-mode-restyle"
            >
              <div className="flex items-center gap-2 font-medium">
                <RefreshCw className="h-4 w-4" /> Re-style this room
              </div>
              <div className="text-xs mt-1 opacity-80">Keep the architecture, swap finishes.</div>
            </button>
            <button
              type="button"
              onClick={() => setMode("imagine")}
              className={`min-h-[80px] rounded-md border p-3 text-left transition-colors ${
                mode === "imagine"
                  ? "bg-[#2f4a3a] text-white border-[#2f4a3a]"
                  : "bg-[#f7f1e7] border-border hover:border-[#2f4a3a]/40"
              }`}
              data-testid="room-render-mode-imagine"
            >
              <div className="flex items-center gap-2 font-medium">
                <Wand2 className="h-4 w-4" /> Imagine from scratch
              </div>
              <div className="text-xs mt-1 opacity-80">AI invents a room from selections.</div>
            </button>
          </div>
        </section>

        {/* Section 3 — Render */}
        <section className="mt-5">
          <Button
            onClick={submit}
            disabled={submitting || !!inProgress}
            className="w-full min-h-[48px] bg-[#2f4a3a] hover:bg-[#26402f]"
            data-testid="room-render-submit"
          >
            {submitting || inProgress ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Render now • est. {fmtCents(ESTIMATED_COST_CENTS)}
          </Button>

          {(inProgress || stage) && (
            <div className="mt-3 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }} data-testid="room-render-progress">
              {stage || "Working…"}
            </div>
          )}

          {activeJob?.status === "failed" && activeJob.errorMessage && (
            <div className="mt-3 text-xs text-red-700">
              {activeJob.errorMessage}
            </div>
          )}

          {completed && activeJob?.imageUrl && (
            <div className="mt-4 space-y-2" data-testid="room-render-result">
              <img
                src={activeJob.imageUrl}
                alt={`${roomName} render`}
                className="w-full rounded border border-border"
              />
              <div className="flex items-center gap-2">
                <a
                  href={activeJob.imageUrl}
                  download={`${roomName.replace(/\s+/g, "-")}-render.jpg`}
                  className="inline-flex items-center min-h-[44px] px-3 rounded-md border border-border bg-[#f7f1e7] text-sm hover:border-[#2f4a3a]/40"
                  data-testid="room-render-download"
                >
                  <Download className="h-4 w-4 mr-1" /> Download
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeJob.imageUrl) return;
                    const url = window.location.origin + activeJob.imageUrl;
                    void navigator.clipboard?.writeText(url);
                    toast({ title: "Link copied", description: "7-day signed share is coming soon." });
                  }}
                  className="inline-flex items-center min-h-[44px] px-3 rounded-md border border-border bg-[#f7f1e7] text-sm hover:border-[#2f4a3a]/40"
                  data-testid="room-render-share"
                >
                  <Share2 className="h-4 w-4 mr-1" /> Share
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(activeJob.id)}
                  className="inline-flex items-center min-h-[44px] px-3 rounded-md border border-border bg-card text-sm text-red-700 hover:border-red-300"
                  data-testid="room-render-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </button>
              </div>
            </div>
          )}
        </section>

        {/* History strip */}
        {history.length > 0 && (
          <section className="mt-5 pt-4 border-t border-border">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2"
              style={{ fontFamily: "var(--font-mono)" }}>
              Past renders
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {history.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveJob(r)}
                  className={`shrink-0 h-20 w-16 rounded border overflow-hidden bg-[#f7f1e7] ${
                    activeJob?.id === r.id ? "border-[#2f4a3a]" : "border-border"
                  }`}
                  title={`${r.mode} • ${r.status}`}
                  data-testid={`room-render-history-${r.id}`}
                >
                  {r.thumbnailUrl ? (
                    <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                      {r.status}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
