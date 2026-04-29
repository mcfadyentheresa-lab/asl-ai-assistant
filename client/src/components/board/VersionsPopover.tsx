/**
 * VersionsPopover — Versions menu anchored to the toolbar Versions button.
 *
 * Surfaces snapshot save/restore/compare/delete on top of existing endpoints
 * (`server/routes.ts` board-snapshots). Admin/crew only at the call site.
 *
 * Restore safety net: before applying a snapshot we auto-save the current
 * board so nothing is ever silently lost.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Undo2, Trash2, GitCompareArrows, Pencil, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useBoardSnapshots,
  useCreateBoardSnapshot,
  useRestoreBoardSnapshot,
  useDeleteBoardSnapshot,
  useRenameBoardSnapshot,
} from "@/hooks/use-projects";
import type { CanvasElement } from "@shared/schema";

export interface VersionsPopoverProps {
  boardId: number;
  activeRoom?: string | null;
  liveElements: CanvasElement[];
  onAfterRestore: () => Promise<void> | void;
  onCompare: (snapshotId: number) => void;
  trigger: React.ReactNode;
  // Optional controlled open state — used when the popover is opened from a
  // sibling control (e.g., the toolbar "More" menu) rather than its own trigger.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SnapshotRow {
  id: number;
  name: string;
  createdAt: string | null;
  canvasData: unknown;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diffMs < min) return "just now";
  if (diffMs < hour) {
    const m = Math.round(diffMs / min);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.round(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 2 * day) {
    return `Yesterday at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffMs < 7 * day) {
    const days = Math.round(diffMs / day);
    return `${days} days ago`;
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function defaultSnapshotName(activeRoom?: string | null): string {
  const now = new Date();
  const datePart = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const timePart = now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
  if (activeRoom && activeRoom !== "__all__") {
    return `${datePart} — ${activeRoom} (${timePart})`;
  }
  return `${datePart} — ${timePart}`;
}

function elementSignature(el: any): string {
  return JSON.stringify({
    id: el.id, type: el.type, x: el.x, y: el.y, w: el.width, h: el.height, z: el.zIndex, content: el.content,
  });
}
function boardSignature(elements: any[]): string {
  return elements.map(elementSignature).sort().join("|");
}

export default function VersionsPopover({
  boardId,
  activeRoom,
  liveElements,
  onAfterRestore,
  onCompare,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: VersionsPopoverProps) {
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const [restoreTarget, setRestoreTarget] = useState<SnapshotRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SnapshotRow | null>(null);

  const { data: rawSnapshots = [], isLoading } = useBoardSnapshots(boardId);
  const snapshots = (rawSnapshots as SnapshotRow[]).slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const { mutateAsync: createSnapshot, isPending: isCreating } = useCreateBoardSnapshot();
  const { mutateAsync: restoreSnapshot } = useRestoreBoardSnapshot();
  const { mutateAsync: deleteSnapshot } = useDeleteBoardSnapshot();
  const { mutateAsync: renameSnapshot } = useRenameBoardSnapshot();
  const [restoring, setRestoring] = useState(false);

  const liveSig = useMemo(() => boardSignature(liveElements), [liveElements]);
  const newest = snapshots[0];
  const newestSig = useMemo(() => {
    if (!newest) return "";
    try {
      return boardSignature((newest.canvasData as any[]) ?? []);
    } catch {
      return "";
    }
  }, [newest]);
  const hasUnsavedChanges = !!newest && newestSig !== liveSig;

  useEffect(() => {
    if (naming) {
      const fallback = defaultSnapshotName(activeRoom);
      setDraftName(fallback);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    }
  }, [naming, activeRoom]);

  const handleSave = async () => {
    const name = draftName.trim() || defaultSnapshotName(activeRoom);
    try {
      await createSnapshot({ boardId, name });
      toast({ title: "Snapshot saved." });
      setNaming(false);
      setDraftName("");
    } catch {
      toast({ title: "Couldn't save snapshot", variant: "destructive" });
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const autoName = `Auto: before restoring "${restoreTarget.name}"`;
      try {
        await createSnapshot({ boardId, name: autoName });
      } catch {
        toast({ title: "Could not auto-save current state — restore cancelled", variant: "destructive" });
        setRestoring(false);
        return;
      }
      await restoreSnapshot({ id: restoreTarget.id, boardId });
      await onAfterRestore();
      toast({ title: "Restored. Your previous state was saved as a snapshot." });
      setRestoreTarget(null);
      setOpen(false);
    } catch {
      toast({ title: "Couldn't restore snapshot", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSnapshot({ id: deleteTarget.id, boardId });
      toast({ title: `Deleted "${deleteTarget.name}".` });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Couldn't delete snapshot", variant: "destructive" });
    }
  };

  const handleRenameCommit = async (snap: SnapshotRow) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === snap.name) {
      setEditingId(null);
      return;
    }
    try {
      await renameSnapshot({ id: snap.id, boardId, name: trimmed });
      toast({ title: "Renamed." });
    } catch {
      toast({ title: "Couldn't rename snapshot", variant: "destructive" });
    } finally {
      setEditingId(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          className="w-[360px] p-0"
          align="end"
          side="bottom"
          sideOffset={6}
          data-testid="versions-popover"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
            <div className="text-sm font-medium">Versions</div>
            {!naming ? (
              <Button
                size="sm"
                onClick={() => setNaming(true)}
                className="h-8 px-3 bg-[#2f4a3a] hover:bg-[#2f4a3a]/90 text-white"
                data-testid="button-versions-save"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save snapshot
              </Button>
            ) : null}
          </div>

          {naming && (
            <div className="px-3 py-2 border-b bg-muted/30">
              <div className="flex gap-2 items-center">
                <Input
                  ref={nameInputRef}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={defaultSnapshotName(activeRoom)}
                  className="h-9 text-sm"
                  data-testid="input-versions-name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSave();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setNaming(false);
                      setDraftName("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={isCreating}
                  onClick={handleSave}
                  className="h-9 px-3 bg-[#2f4a3a] hover:bg-[#2f4a3a]/90 text-white"
                  data-testid="button-versions-save-confirm"
                >
                  {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2"
                  onClick={() => { setNaming(false); setDraftName(""); }}
                  data-testid="button-versions-save-cancel"
                  aria-label="Cancel naming"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5">
                Default uses today's date {activeRoom && activeRoom !== "__all__" ? `and the ${activeRoom} room` : "and the current time"}.
              </div>
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading…
              </div>
            ) : snapshots.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <div className="text-sm text-foreground/80">No versions yet.</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Save a snapshot before exploring a new direction.
                </div>
                {!naming && (
                  <Button
                    size="sm"
                    onClick={() => setNaming(true)}
                    className="mt-3 h-9 px-3 bg-[#2f4a3a] hover:bg-[#2f4a3a]/90 text-white"
                    data-testid="button-versions-empty-save"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Save snapshot
                  </Button>
                )}
              </div>
            ) : (
              <ul className="py-1">
                {hasUnsavedChanges && (
                  <li className="px-3 py-2 mx-1 my-1 rounded-md border border-dashed border-[#2f4a3a]/40 bg-[#2f4a3a]/5">
                    <div className="text-[11px] uppercase tracking-wide text-[#2f4a3a]/80 font-medium">
                      Current (unsaved)
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Board has changed since "{newest!.name}". Save a snapshot to keep this state.
                    </div>
                  </li>
                )}
                {snapshots.map((snap) => {
                  const isEditing = editingId === snap.id;
                  return (
                    <li
                      key={snap.id}
                      className="group px-3 py-2 hover:bg-muted/40 transition-colors"
                      data-testid={`versions-row-${snap.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-7 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); void handleRenameCommit(snap); }
                                  else if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                                }}
                                data-testid={`versions-rename-input-${snap.id}`}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => void handleRenameCommit(snap)}
                                aria-label="Save name"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditingId(null)}
                                aria-label="Cancel rename"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div className="text-sm font-medium truncate" title={snap.name}>
                                {snap.name}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 -m-1 hover:bg-muted"
                                    onClick={() => { setEditingId(snap.id); setEditingName(snap.name); }}
                                    aria-label="Rename version"
                                    data-testid={`versions-rename-${snap.id}`}
                                  >
                                    <Pencil className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Rename</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {relativeTime(snap.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs min-w-[44px]"
                          onClick={() => setRestoreTarget(snap)}
                          data-testid={`versions-restore-${snap.id}`}
                        >
                          <Undo2 className="h-3 w-3 mr-1" /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs min-w-[44px]"
                          onClick={() => { onCompare(snap.id); setOpen(false); }}
                          data-testid={`versions-compare-${snap.id}`}
                        >
                          <GitCompareArrows className="h-3 w-3 mr-1" /> Compare
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-destructive hover:text-destructive min-w-[44px] ml-auto"
                          onClick={() => setDeleteTarget(snap)}
                          data-testid={`versions-delete-${snap.id}`}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!restoreTarget} onOpenChange={(v) => !v && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore "{restoreTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current board will become a snapshot first so nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleRestoreConfirm(); }}
              disabled={restoring}
              data-testid="versions-restore-confirm"
              className="bg-[#2f4a3a] hover:bg-[#2f4a3a]/90"
            >
              {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This snapshot will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDeleteConfirm(); }}
              data-testid="versions-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
