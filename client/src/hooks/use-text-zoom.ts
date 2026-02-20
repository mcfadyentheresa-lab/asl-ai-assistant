import { useState, useEffect, useCallback } from "react";

const ZOOM_KEY = "aster-text-zoom";
const ZOOM_LEVELS = [100, 115, 130, 150];

function getStoredZoom(): number {
  try {
    const stored = localStorage.getItem(ZOOM_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (ZOOM_LEVELS.includes(val)) return val;
    }
  } catch {}
  return 100;
}

export function useTextZoom() {
  const [zoom, setZoomState] = useState(getStoredZoom);

  const applyZoom = useCallback((level: number) => {
    document.documentElement.style.fontSize = `${level}%`;
  }, []);

  useEffect(() => {
    applyZoom(zoom);
  }, [zoom, applyZoom]);

  const setZoom = useCallback((level: number) => {
    setZoomState(level);
    localStorage.setItem(ZOOM_KEY, String(level));
  }, []);

  const cycleZoom = useCallback(() => {
    setZoomState((prev) => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      const next = ZOOM_LEVELS[(idx + 1) % ZOOM_LEVELS.length];
      localStorage.setItem(ZOOM_KEY, String(next));
      return next;
    });
  }, []);

  return { zoom, setZoom, cycleZoom, levels: ZOOM_LEVELS };
}
