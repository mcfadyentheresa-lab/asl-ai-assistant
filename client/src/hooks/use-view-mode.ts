import { useEffect, useState } from "react";

export type ViewMode = "admin" | "crew" | "client";

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = window.localStorage.getItem("dashboard-view-mode");
    return saved === "admin" || saved === "crew" || saved === "client" ? saved : "admin";
  });

  useEffect(() => {
    window.localStorage.setItem("dashboard-view-mode", viewMode);
  }, [viewMode]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
  };

  return { viewMode, setViewMode };
}