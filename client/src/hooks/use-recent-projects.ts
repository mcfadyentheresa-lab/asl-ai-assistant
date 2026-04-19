import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "asl_recent_projects";
const CHANGE_EVENT = "asl_recent_projects_changed";
const MAX_RECENT = 3;

export interface RecentProject {
  id: number;
  name: string;
}

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function saveRecent(projects: RecentProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useRecentProjects() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecent);

  const trackProject = useCallback((project: RecentProject) => {
    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== project.id);
      const next = [project, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleChange = () => setRecentProjects(loadRecent());
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return { recentProjects, trackProject };
}
