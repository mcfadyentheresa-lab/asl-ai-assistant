import { create } from "zustand";
import type { CanvasElement } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";
import { migrateElement, migrateElements } from "@/lib/board-element-migration";

type UndoAction =
  | { type: "create"; elementId: number }
  | { type: "delete"; element: CanvasElement }
  | { type: "move"; elementId: number; prevX: number; prevY: number }
  | { type: "update"; elementId: number; prevUpdates: Partial<CanvasElement> };

const MAX_UNDO = 50;

export const COMPARE_MAX = 4;

const compareKeyFor = (boardId: number | null) =>
  boardId == null ? null : `asl:board:${boardId}:compareIds`;

const readPersistedCompareIds = (boardId: number | null): number[] => {
  const key = compareKeyFor(boardId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === "number").slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
};

const writePersistedCompareIds = (boardId: number | null, ids: number[]) => {
  const key = compareKeyFor(boardId);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(0, COMPARE_MAX)));
  } catch {}
};

interface CanvasStore {
  elements: Record<number, CanvasElement>;
  dirtyIds: Set<number>;
  boardId: number | null;
  loading: boolean;
  undoStack: UndoAction[];
  compareIds: number[];

  setElements: (elements: CanvasElement[]) => void;
  setBoardId: (id: number | null) => void;
  setLoading: (loading: boolean) => void;

  addElement: (element: CanvasElement) => void;
  updateElement: (id: number, updates: Partial<CanvasElement>) => void;
  removeElement: (id: number) => void;
  moveElement: (id: number, x: number, y: number) => void;

  pushUndo: (action: UndoAction) => void;
  popUndo: () => UndoAction | undefined;
  clearUndo: () => void;

  markDirty: (id: number) => void;
  clearDirty: () => void;
  getDirtyUpdates: () => { id: number; x: number; y: number; width: number; height: number; zIndex: number; parentColumnId: number | null }[];

  addToCompare: (id: number) => "added" | "already" | "full";
  removeFromCompare: (id: number) => void;
  toggleCompare: (id: number) => "added" | "removed" | "full";
  clearCompare: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  elements: {},
  dirtyIds: new Set(),
  boardId: null,
  loading: false,
  undoStack: [],
  compareIds: [],

  setElements: (elements) => {
    const map: Record<number, CanvasElement> = {};
    migrateElements(elements).forEach((e) => { map[e.id] = e; });
    set((s) => ({
      elements: map,
      dirtyIds: new Set(),
      compareIds: s.compareIds.filter((id) => map[id] != null),
    }));
  },
  setBoardId: (id) => {
    const compareIds = readPersistedCompareIds(id);
    set({ boardId: id, undoStack: [], compareIds });
  },
  setLoading: (loading) => set({ loading }),

  addElement: (element) => {
    // Guard against malformed responses (e.g. server error JSON like
    // { message: "..." }) that would land an entry under key `undefined`
    // in the elements map. Such entries silently break undo (the undo
    // stack would then point to a non-existent id) and pollute renders.
    if (!element || typeof (element as any).id !== "number") return;
    const migrated = migrateElement(element);
    set((s) => ({ elements: { ...s.elements, [migrated.id]: migrated } }));
  },
  updateElement: (id, updates) => {
    set((s) => {
      const el = s.elements[id];
      if (!el) return s;
      return {
        elements: { ...s.elements, [id]: { ...el, ...updates } },
        dirtyIds: new Set(Array.from(s.dirtyIds).concat([id])),
      };
    });
  },
  removeElement: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.elements;
      const dirty = new Set(Array.from(s.dirtyIds));
      dirty.delete(id);
      const nextCompare = s.compareIds.filter((cid) => cid !== id);
      if (nextCompare.length !== s.compareIds.length) {
        writePersistedCompareIds(s.boardId, nextCompare);
      }
      return { elements: rest, dirtyIds: dirty, compareIds: nextCompare };
    });
  },
  moveElement: (id, x, y) => {
    set((s) => {
      const el = s.elements[id];
      if (!el) return s;
      return {
        elements: { ...s.elements, [id]: { ...el, x, y } },
        dirtyIds: new Set(Array.from(s.dirtyIds).concat([id])),
      };
    });
  },

  pushUndo: (action) => {
    // Reject malformed actions — an undo entry whose target id is
    // undefined will appear to "work" (the button enables, the toast
    // shows) but actually removes nothing, which is exactly the kind of
    // ghost behavior the user has flagged.
    if (!action) return;
    if (action.type === "create" && typeof action.elementId !== "number") return;
    if (action.type === "delete" && (!action.element || typeof (action.element as any).id !== "number")) return;
    if (action.type === "move" && typeof action.elementId !== "number") return;
    if (action.type === "update" && typeof action.elementId !== "number") return;
    set((s) => ({
      undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), action],
    }));
  },
  popUndo: () => {
    const s = get();
    if (s.undoStack.length === 0) return undefined;
    const action = s.undoStack[s.undoStack.length - 1];
    set({ undoStack: s.undoStack.slice(0, -1) });
    return action;
  },
  clearUndo: () => set({ undoStack: [] }),

  addToCompare: (id) => {
    const s = get();
    if (s.compareIds.includes(id)) return "already";
    if (s.compareIds.length >= COMPARE_MAX) return "full";
    const next = [...s.compareIds, id];
    writePersistedCompareIds(s.boardId, next);
    set({ compareIds: next });
    return "added";
  },
  removeFromCompare: (id) => {
    const s = get();
    if (!s.compareIds.includes(id)) return;
    const next = s.compareIds.filter((cid) => cid !== id);
    writePersistedCompareIds(s.boardId, next);
    set({ compareIds: next });
  },
  toggleCompare: (id) => {
    const s = get();
    if (s.compareIds.includes(id)) {
      const next = s.compareIds.filter((cid) => cid !== id);
      writePersistedCompareIds(s.boardId, next);
      set({ compareIds: next });
      return "removed";
    }
    if (s.compareIds.length >= COMPARE_MAX) return "full";
    const next = [...s.compareIds, id];
    writePersistedCompareIds(s.boardId, next);
    set({ compareIds: next });
    return "added";
  },
  clearCompare: () => {
    const s = get();
    writePersistedCompareIds(s.boardId, []);
    set({ compareIds: [] });
  },

  markDirty: (id) => {
    set((s) => ({ dirtyIds: new Set(Array.from(s.dirtyIds).concat([id])) }));
  },
  clearDirty: () => set({ dirtyIds: new Set() }),
  getDirtyUpdates: () => {
    const s = get();
    return Array.from(s.dirtyIds)
      .map((id) => {
        const el = s.elements[id];
        if (!el) return null;
        return { id: el.id, x: el.x, y: el.y, width: el.width, height: el.height, zIndex: el.zIndex, parentColumnId: el.parentColumnId };
      })
      .filter(Boolean) as any;
  },
}));

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSavePositions(boardId: number, delay = 800) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const store = useCanvasStore.getState();
    const updates = store.getDirtyUpdates();
    if (updates.length === 0) return;
    store.clearDirty();
    try {
      const url = buildUrl(api.canvasElements.updatePositions.path, { boardId });
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      });
    } catch (err) {
      console.error("Failed to save positions:", err);
    }
  }, delay);
}
