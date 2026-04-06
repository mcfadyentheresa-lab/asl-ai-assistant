import { useEffect, useState } from "react";

export type ViewMode = "admin" | "crew" | "client";
const listeners = new Set<(mode: ViewMode) => void>();

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem("view-mode");
    return saved === "admin" || saved === "crew" || saved === "client" ? saved : "admin";
  });

  useEffect(() => {
    window.localStorage.setItem("view-mode", viewMode);
    listeners.forEach(listener => listener(viewMode));
  }, [viewMode]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
  };

  return { viewMode, setViewMode };
}

export function onViewModeChange(listener: (mode: ViewMode) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}