// Rooms-as-the-spine tab strip.
//
// Lives directly above the canvas, below the top toolbar. Shows "All" + one
// tab per room name (derived from `room_zone` elements and explicit `room`
// fields on hardware/surface/product). Tabs are reorderable (drag), renameable
// inline, and a trailing "+ Room" tab opens a small dialog to drop a new
// room_zone with optional W × D dimensions.
//
// Active room is persisted per board in localStorage. Status filter pills sit
// just below the tabs and are multi-select. A budget rollup pill is rendered
// at the right end of the active room's strip.
//
// iPad-first: 44pt min height, swipe-scroll horizontally.

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Check, X as XIcon, AlertTriangle } from "lucide-react";
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
} from "@/lib/board-rooms";
import type { CanvasElement, Project } from "@shared/schema";

interface RoomTabStripProps {
  rooms: string[];
  activeRoom: string | null; // null = "All"
  statusFilters: Set<RoomStatus>;
  elements: CanvasElement[];
  project: Project | undefined;
  isLocked: boolean;
  onSelectRoom: (room: string | null) => void;
  onReorderRooms: (orderedRoomNames: string[]) => void;
  onRenameRoom: (oldName: string, newName: string) => void;
  onCreateRoom: (payload: { name: string; widthFt?: number; widthIn?: number; depthFt?: number; depthIn?: number }) => void;
  onToggleStatusFilter: (s: RoomStatus) => void;
}

const STATUS_PILL_CLASS: Record<RoomStatus, { dot: string; label: string }> = {
  idea: { dot: "bg-stone-400", label: "Idea" },
  shortlist: { dot: "bg-[#7a9bb5]", label: "Shortlist" },
  selected: { dot: "bg-[#2f4a3a]", label: "Selected" },
  ordered: { dot: "bg-[#2f4a3a]", label: "Ordered" },
};

export default function RoomTabStrip({
  rooms,
  activeRoom,
  statusFilters,
  elements,
  project,
  isLocked,
  onSelectRoom,
  onReorderRooms,
  onRenameRoom,
  onCreateRoom,
  onToggleStatusFilter,
}: RoomTabStripProps) {
  const [renamingRoom, setRenamingRoom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragRoom, setDragRoom] = useState<string | null>(null);
  const [dragOverRoom, setDragOverRoom] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingRoom && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingRoom]);

  const counts = useMemo(() => countByStatus(elements, activeRoom), [elements, activeRoom]);
  const budget = useMemo(() => computeRoomBudget(elements, activeRoom), [elements, activeRoom]);
  const totalBudget = project?.totalBudget ?? 0;
  const overBy = budget.total - totalBudget;

  const beginRename = (room: string) => {
    if (isLocked) return;
    setRenamingRoom(room);
    setRenameDraft(room);
  };

  const commitRename = () => {
    if (!renamingRoom) return;
    const next = renameDraft.trim();
    if (next && next !== renamingRoom) {
      onRenameRoom(renamingRoom, next);
    }
    setRenamingRoom(null);
    setRenameDraft("");
  };

  const handleDragStart = (room: string) => (e: React.DragEvent) => {
    if (isLocked) return;
    setDragRoom(room);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", room);
  };

  const handleDragOver = (room: string) => (e: React.DragEvent) => {
    if (!dragRoom || dragRoom === room) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverRoom(room);
  };

  const handleDrop = (room: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragRoom || dragRoom === room) {
      setDragRoom(null);
      setDragOverRoom(null);
      return;
    }
    const fromIdx = rooms.indexOf(dragRoom);
    const toIdx = rooms.indexOf(room);
    if (fromIdx < 0 || toIdx < 0) {
      setDragRoom(null);
      setDragOverRoom(null);
      return;
    }
    const next = rooms.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorderRooms(next);
    setDragRoom(null);
    setDragOverRoom(null);
  };

  const handleDragEnd = () => {
    setDragRoom(null);
    setDragOverRoom(null);
  };

  const tabBase = "min-h-[44px] px-4 inline-flex items-center gap-2 text-sm whitespace-nowrap rounded-t-md transition-colors select-none";

  return (
    <div className="shrink-0 bg-card/70 backdrop-blur border-b border-border" data-testid="room-tab-strip">
      <div
        className="flex items-end gap-1 overflow-x-auto px-2 pt-1 hide-scrollbar"
        style={{ scrollbarWidth: "none" }}
        data-testid="room-tab-row"
      >
        <button
          type="button"
          className={`${tabBase} ${activeRoom === null ? "bg-[#2f4a3a] text-white" : "bg-[#f7f1e7] text-foreground/80 hover:bg-[#f0e8d6]"}`}
          style={{ fontFamily: "Inter Tight, Inter, sans-serif", fontWeight: 500 }}
          onClick={() => onSelectRoom(null)}
          data-testid="room-tab-all"
        >
          All
        </button>

        {rooms.map((room) => {
          const isActive = room === activeRoom;
          const isRenaming = room === renamingRoom;
          const isDragOver = room === dragOverRoom;
          return (
            <div
              key={room}
              draggable={!isLocked && !isRenaming}
              onDragStart={handleDragStart(room)}
              onDragOver={handleDragOver(room)}
              onDrop={handleDrop(room)}
              onDragEnd={handleDragEnd}
              className={`relative ${isDragOver ? "ring-2 ring-[#2f4a3a]/40 rounded-t-md" : ""}`}
              data-testid={`room-tab-wrap-${room}`}
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
                        setRenamingRoom(null);
                        setRenameDraft("");
                      }
                    }}
                    onBlur={commitRename}
                    className="h-6 w-32 bg-transparent border-none text-sm outline-none"
                    style={{ fontFamily: "Inter Tight, Inter, sans-serif" }}
                    data-testid={`room-tab-rename-input-${room}`}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={`${tabBase} ${isActive ? "bg-[#2f4a3a] text-white" : "bg-[#f7f1e7] text-foreground/80 hover:bg-[#f0e8d6]"}`}
                  style={{ fontFamily: "Inter Tight, Inter, sans-serif", fontWeight: 500 }}
                  onClick={() => onSelectRoom(room)}
                  onDoubleClick={() => beginRename(room)}
                  data-testid={`room-tab-${room}`}
                  title="Double-tap to rename"
                >
                  {room}
                  {isActive && !isLocked && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/15"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginRename(room);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          beginRename(room);
                        }
                      }}
                      aria-label={`Rename ${room}`}
                      data-testid={`room-tab-rename-${room}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className={`${tabBase} bg-transparent text-muted-foreground hover:text-[#2f4a3a] hover:bg-[#f0e8d6]/60 border border-dashed border-border/60`}
          style={{ fontFamily: "Inter Tight, Inter, sans-serif" }}
          onClick={() => setDialogOpen(true)}
          data-testid="room-tab-add"
        >
          <Plus className="h-4 w-4" /> Room
        </button>

        <div className="flex-1" />

        {/* Budget rollup pill — sits at the right end of the strip. Only renders when
            there is something to say (at least one selected/ordered card OR a target budget). */}
        {(budget.total > 0 || (activeRoom !== null && totalBudget > 0)) && (
          <div className="ml-auto pr-1 pb-0.5 flex items-center gap-1.5">
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
            {activeRoom === null && totalBudget > 0 && budget.total > 0 && (
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

      {/* Status filter pills — multi-select, with counts. Hidden when no roomable cards exist. */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto" data-testid="status-filter-row">
        {ROOM_STATUSES.map((s) => {
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

      <NewRoomDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreate={onCreateRoom} />
    </div>
  );
}

function NewRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: RoomTabStripProps["onCreateRoom"];
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="new-room-dialog">
        <DialogHeader>
          <DialogTitle className="font-serif">New room</DialogTitle>
          <DialogDescription>
            Add a room lane. Dimensions are optional — useful for scale planning later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs" htmlFor="new-room-name">Name</Label>
            <Input
              id="new-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen, Primary Bath…"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              data-testid="new-room-name"
            />
          </div>
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
