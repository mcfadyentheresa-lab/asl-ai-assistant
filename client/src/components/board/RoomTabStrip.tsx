// Mode-aware board tab strip.
//
// The primary axis depends on the board's `mode`:
//   - 'project' (default): tabs are rooms — Kitchen, Powder, Primary Bath…
//   - 'library':           tabs are categories — Fabric, Stone, Hardware…
//
// Lives directly above the canvas. Tabs are reorderable (drag), renameable
// inline, and a trailing "+ Room" / "+ Category" tab opens a small dialog to
// add a new lane.
//
// On project boards the new lane drops a `room_zone` element onto the canvas
// (existing behavior). On library boards the new lane is a metadata-only
// addition: an empty Category isn't pinned anywhere until a card carries it.
//
// Active tab is persisted per board in localStorage. Status filter pills sit
// just below the tabs and are multi-select. A budget rollup pill is rendered
// at the right end of the active tab's strip.
//
// iPad-first: 44pt min height, swipe-scroll horizontally.

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Check, X as XIcon, AlertTriangle, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  ROOM_STATUSES,
  type RoomStatus,
  computeRoomBudget,
  countByStatus,
  formatCad,
  isRoomable,
  resolveRoomFor,
} from "@/lib/board-rooms";
import type { CanvasElement, Project } from "@shared/schema";

export type BoardMode = "project" | "library";

interface RoomTabStripProps {
  mode: BoardMode;
  // Primary tab labels (rooms when mode='project', categories when mode='library').
  tabs: string[];
  activeTab: string | null; // null = "All"
  statusFilters: Set<RoomStatus>;
  elements: CanvasElement[];
  project: Project | undefined;
  isLocked: boolean;
  onSelectTab: (tab: string | null) => void;
  onReorderTabs: (orderedTabNames: string[]) => void;
  onRenameTab: (oldName: string, newName: string) => void;
  // Project-mode payload includes optional dimensions for the new room_zone.
  // Library-mode payload uses only `name`.
  onCreateTab: (payload: { name: string; widthFt?: number; widthIn?: number; depthFt?: number; depthIn?: number }) => void;
  // Delete a tab (room or category). Implementations should remove the
  // scaffolding element on project boards and clear the saved order/active
  // selection. Items previously assigned to the tab become unassigned.
  onDeleteTab?: (tabName: string) => void;
  onToggleStatusFilter: (s: RoomStatus) => void;
  // PR-S — admin/crew only. When provided AND mode='project' AND a specific
  // room is active, the budget rollup row shows a small "Render" sparkle button
  // that calls this with the active room name.
  onRenderRoom?: (roomName: string) => void;
}

const STATUS_PILL_CLASS: Record<RoomStatus, { dot: string; label: string }> = {
  idea: { dot: "bg-stone-400", label: "Idea" },
  shortlist: { dot: "bg-[#7a9bb5]", label: "Shortlist" },
  selected: { dot: "bg-[#2f4a3a]", label: "Selected" },
  ordered: { dot: "bg-[#2f4a3a]", label: "Ordered" },
};

export default function RoomTabStrip({
  mode,
  tabs,
  activeTab,
  statusFilters,
  elements,
  project,
  isLocked,
  onSelectTab,
  onReorderTabs,
  onRenameTab,
  onCreateTab,
  onDeleteTab,
  onToggleStatusFilter,
  onRenderRoom,
}: RoomTabStripProps) {
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragTab, setDragTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingTab, setDeletingTab] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingTab && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTab]);

  // Status pills + budget rollup are scoped to the active room when in project
  // mode. In library mode there's no inherent room scope on the primary axis,
  // so status counts are computed across the whole board (the user can still
  // narrow by category via the active tab).
  const scopedRoomForStatus = mode === "project" ? activeTab : null;
  const counts = useMemo(() => countByStatus(elements, scopedRoomForStatus), [elements, scopedRoomForStatus]);
  const hasStatusBearingElements = useMemo(() => {
    for (const el of elements) {
      if (!isRoomable(el)) continue;
      if (scopedRoomForStatus != null && resolveRoomFor(el, elements) !== scopedRoomForStatus) continue;
      return true;
    }
    return false;
  }, [elements, scopedRoomForStatus]);
  const budget = useMemo(() => computeRoomBudget(elements, scopedRoomForStatus), [elements, scopedRoomForStatus]);
  const totalBudget = project?.totalBudget ?? 0;
  const overBy = budget.total - totalBudget;

  const beginRename = (tab: string) => {
    if (isLocked) return;
    setRenamingTab(tab);
    setRenameDraft(tab);
  };

  const commitRename = () => {
    if (!renamingTab) return;
    const next = renameDraft.trim();
    if (next && next !== renamingTab) {
      onRenameTab(renamingTab, next);
    }
    setRenamingTab(null);
    setRenameDraft("");
  };

  const handleDragStart = (tab: string) => (e: React.DragEvent) => {
    if (isLocked) return;
    setDragTab(tab);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tab);
  };

  const handleDragOver = (tab: string) => (e: React.DragEvent) => {
    if (!dragTab || dragTab === tab) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTab(tab);
  };

  const handleDrop = (tab: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragTab || dragTab === tab) {
      setDragTab(null);
      setDragOverTab(null);
      return;
    }
    const fromIdx = tabs.indexOf(dragTab);
    const toIdx = tabs.indexOf(tab);
    if (fromIdx < 0 || toIdx < 0) {
      setDragTab(null);
      setDragOverTab(null);
      return;
    }
    const next = tabs.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorderTabs(next);
    setDragTab(null);
    setDragOverTab(null);
  };

  const handleDragEnd = () => {
    setDragTab(null);
    setDragOverTab(null);
  };

  const tabBase = "min-h-[44px] px-4 inline-flex items-center gap-2 text-sm whitespace-nowrap rounded-t-md transition-colors select-none";
  const addLabel = mode === "library" ? "Collection" : "Room";

  return (
    <div className="shrink-0 bg-card border-b border-border relative z-10" data-testid="room-tab-strip" data-mode={mode}>
      <div
        className="flex items-end gap-1 overflow-x-auto px-2 pt-1 hide-scrollbar"
        style={{ scrollbarWidth: "none" }}
        data-testid="room-tab-row"
      >
        <button
          type="button"
          className={`${tabBase} ${activeTab === null ? "bg-[#2f4a3a] text-white" : "bg-[#f7f1e7] text-foreground/80 hover:bg-[#f0e8d6]"}`}
          style={{ fontFamily: "Inter Tight, Inter, sans-serif", fontWeight: 500 }}
          onClick={() => onSelectTab(null)}
          data-testid="room-tab-all"
        >
          All
        </button>

        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const isRenaming = tab === renamingTab;
          const isDragOver = tab === dragOverTab;
          return (
            <div
              key={tab}
              draggable={!isLocked && !isRenaming}
              onDragStart={handleDragStart(tab)}
              onDragOver={handleDragOver(tab)}
              onDrop={handleDrop(tab)}
              onDragEnd={handleDragEnd}
              className={`relative ${isDragOver ? "ring-2 ring-[#2f4a3a]/40 rounded-t-md" : ""}`}
              data-testid={`room-tab-wrap-${tab}`}
            >
              {isRenaming ? (
                <div className={`${tabBase} bg-white border border-[#2f4a3a]/40`}>
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        setRenamingTab(null);
                        setRenameDraft("");
                      }
                    }}
                    onBlur={commitRename}
                    className="h-6 w-32 bg-transparent border-none text-sm outline-none"
                    style={{ fontFamily: "Inter Tight, Inter, sans-serif" }}
                    data-testid={`room-tab-rename-input-${tab}`}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={`${tabBase} ${isActive ? "bg-[#2f4a3a] text-white" : "bg-[#f7f1e7] text-foreground/80 hover:bg-[#f0e8d6]"}`}
                  style={{ fontFamily: "Inter Tight, Inter, sans-serif", fontWeight: 500 }}
                  onClick={() => onSelectTab(tab)}
                  onDoubleClick={() => beginRename(tab)}
                  data-testid={`room-tab-${tab}`}
                  title="Double-tap to rename"
                >
                  {tab}
                  {isActive && !isLocked && (
                    <>
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          beginRename(tab);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            beginRename(tab);
                          }
                        }}
                        aria-label={`Rename ${tab}`}
                        data-testid={`room-tab-rename-${tab}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </span>
                      {onDeleteTab && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/15"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingTab(tab);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              setDeletingTab(tab);
                            }
                          }}
                          aria-label={`Delete ${tab}`}
                          data-testid={`room-tab-delete-${tab}`}
                          title={`Delete ${tab}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}

        {/* Compact icon-only "+" affordance — matches tab height but reads as
            an action, not a tab. Tooltip-style hover label keeps discoverability. */}
        <button
          type="button"
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-[#2f4a3a] hover:bg-[#f0e8d6]/60 transition-colors"
          onClick={() => setDialogOpen(true)}
          data-testid="room-tab-add"
          aria-label={`Add ${addLabel}`}
          title={`Add ${addLabel.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* Budget rollup pill — sits at the right end of the strip. Only renders when
            there is something to say (at least one selected/ordered card OR a target budget). */}
        {mode === "project" && activeTab !== null && onRenderRoom && (
          <button
            type="button"
            onClick={() => onRenderRoom(activeTab)}
            className="ml-auto mr-1 pb-0.5 inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-md text-[11px] uppercase tracking-wider bg-[#2f4a3a]/10 text-[#2f4a3a] hover:bg-[#2f4a3a]/15 transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
            data-testid="room-render-trigger"
            title={`Render ${activeTab}`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Render
          </button>
        )}

        {(budget.total > 0 || (activeTab !== null && totalBudget > 0)) && (
          <div className={`${mode === "project" && activeTab !== null && onRenderRoom ? "" : "ml-auto"} pr-1 pb-0.5 flex items-center gap-1.5`}>
            {budget.hasMixedCurrency && (
              <span
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200"
                style={{ fontFamily: "var(--font-mono)" }}
                title="Some cards use a non-CAD currency and weren't summed"
                data-testid="budget-mixed-warning"
              >
                <AlertTriangle className="h-3 w-3" /> Mixed currency
              </span>
            )}
            {(budget.selected > 0 || budget.ordered > 0) && (
              <span
                className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-md bg-[#f7f1e7] text-foreground/80"
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid="budget-rollup-pill"
              >
                <span>Selected: {formatCad(budget.selected)}</span>
                <span className="text-border">•</span>
                <span>Ordered: {formatCad(budget.ordered)}</span>
              </span>
            )}
            {activeTab === null && totalBudget > 0 && budget.total > 0 && (
              <span
                className={`inline-flex items-center text-[11px] px-2 py-1 rounded-md ${overBy > 0 ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-[#2f4a3a]/10 text-[#2f4a3a]"}`}
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid="budget-vs-target-pill"
              >
                {overBy > 0
                  ? `${formatCad(overBy)} over budget`
                  : `${formatCad(budget.total)} of ${formatCad(totalBudget)} budget`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status filter pills — multi-select, with counts. Only renders pills whose
          count > 0 (or that are currently active so the user can still toggle off).
          The whole row is hidden when no scope card has any status — a row of zero
          counts plus a "Clear" button is just noise on an empty board. */}
      {hasStatusBearingElements && (() => {
        const visibleStatuses = ROOM_STATUSES.filter((s) => (counts[s] || 0) > 0 || statusFilters.has(s));
        if (visibleStatuses.length === 0 && statusFilters.size === 0) return null;
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto" data-testid="status-filter-row">
            {visibleStatuses.map((s) => {
              const count = counts[s] || 0;
              const active = statusFilters.has(s);
              const meta = STATUS_PILL_CLASS[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggleStatusFilter(s)}
                  className={`min-h-[32px] inline-flex items-center gap-1.5 px-2.5 rounded-full text-[11px] uppercase tracking-wider border transition-colors ${
                    active
                      ? "bg-[#2f4a3a] text-white border-[#2f4a3a]"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-[#2f4a3a]/40"
                  }`}
                  style={{ fontFamily: "var(--font-mono)" }}
                  data-testid={`status-filter-${s}`}
                  aria-pressed={active}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : meta.dot}`} />
                  {meta.label}
                  <span className={`text-[10px] ${active ? "text-white/80" : "text-foreground/40"}`}>{count}</span>
                </button>
              );
            })}
            {statusFilters.size > 0 && (
              <button
                type="button"
                onClick={() => ROOM_STATUSES.forEach((s) => statusFilters.has(s) && onToggleStatusFilter(s))}
                className="ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground"
                style={{ fontFamily: "var(--font-mono)" }}
                data-testid="status-filter-clear"
              >
                <XIcon className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        );
      })()}

      <NewTabDialog
        mode={mode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={onCreateTab}
      />

      <Dialog open={!!deletingTab} onOpenChange={(v) => !v && setDeletingTab(null)}>
        <DialogContent className="sm:max-w-md" data-testid="delete-tab-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif">
              Delete {mode === "library" ? "collection" : "room"} “{deletingTab}”?
            </DialogTitle>
            <DialogDescription>
              {mode === "library"
                ? "Items tagged with this collection will become uncategorised — they won’t be deleted."
                : "The room lane will be removed from the canvas. Items previously assigned to this room will become unassigned — they won’t be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setDeletingTab(null)} data-testid="delete-tab-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingTab && onDeleteTab) onDeleteTab(deletingTab);
                setDeletingTab(null);
              }}
              data-testid="delete-tab-confirm"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewTabDialog({
  mode,
  open,
  onOpenChange,
  onCreate,
}: {
  mode: BoardMode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: RoomTabStripProps["onCreateTab"];
}) {
  const [name, setName] = useState("");
  const [wFt, setWFt] = useState("");
  const [wIn, setWIn] = useState("");
  const [dFt, setDFt] = useState("");
  const [dIn, setDIn] = useState("");

  useEffect(() => {
    if (!open) {
      setName(""); setWFt(""); setWIn(""); setDFt(""); setDIn("");
    }
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const num = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    onCreate({
      name: trimmed,
      widthFt: num(wFt),
      widthIn: num(wIn),
      depthFt: num(dFt),
      depthIn: num(dIn),
    });
    onOpenChange(false);
  };

  const isLibrary = mode === "library";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="new-room-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif">{isLibrary ? "New collection" : "New room"}</DialogTitle>
          <DialogDescription>
            {isLibrary
              ? "Add a collection lane. Items tagged with this collection will appear here."
              : "Add a room lane. Dimensions are optional — useful for scale planning later."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs" htmlFor="new-room-name">Name</Label>
            <Input
              id="new-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isLibrary ? "Fabrics, Stone, Hardware…" : "Kitchen, Primary Bath…"}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              data-testid="new-room-name"
            />
          </div>
          {!isLibrary && (
            <>
              <div>
                <Label className="text-xs">Width <span className="text-muted-foreground">(optional)</span></Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={wFt} onChange={(e) => setWFt(e.target.value)} placeholder="ft" inputMode="numeric" data-testid="new-room-w-ft" />
                  <Input value={wIn} onChange={(e) => setWIn(e.target.value)} placeholder="in" inputMode="numeric" data-testid="new-room-w-in" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Depth <span className="text-muted-foreground">(optional)</span></Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={dFt} onChange={(e) => setDFt(e.target.value)} placeholder="ft" inputMode="numeric" data-testid="new-room-d-ft" />
                  <Input value={dIn} onChange={(e) => setDIn(e.target.value)} placeholder="in" inputMode="numeric" data-testid="new-room-d-in" />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="new-room-cancel">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()} data-testid="new-room-create">
            <Check className="h-4 w-4 mr-1" /> Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
