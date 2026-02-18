import { create } from "zustand";
import type { CanvasElement, InsertCanvasElement } from "@shared/schema";
import { api, buildUrl } from "@shared/routes";

interface CanvasStore {
  elements: Record<number, CanvasElement>;
  dirtyIds: Set<number>;
  boardId: number | null;
  loading: boolean;

  setElements: (elements: CanvasElement[]) => void;
  setBoardId: (id: number | null) => void;
  setLoading: (loading: boolean) => void;

  addElement: (element: CanvasElement) => void;
  updateElement: (id: number, updates: Partial<CanvasElement>) => void;
  removeElement: (id: number) => void;
  moveElement: (id: number, x: number, y: number) => void;

  markDirty: (id: number) => void;
  clearDirty: () => void;
  getDirtyUpdates: () => { id: number; x: number; y: number; width: number; height: number; zIndex: number; parentColumnId: number | null }[];
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  elements: {},
  dirtyIds: new Set(),
  boardId: null,
  loading: false,

  setElements: (elements) => {
    const map: Record<number, CanvasElement> = {};
    elements.forEach((e) => { map[e.id] = e; });
    set({ elements: map, dirtyIds: new Set() });
  },
  setBoardId: (id) => set({ boardId: id }),
  setLoading: (loading) => set({ loading }),

  addElement: (element) => {
    set((s) => ({ elements: { ...s.elements, [element.id]: element } }));
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
      return { elements: rest, dirtyIds: dirty };
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
