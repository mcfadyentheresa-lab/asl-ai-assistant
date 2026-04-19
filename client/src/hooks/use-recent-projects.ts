import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

function saveRecent(projects: RecentProject[], broadcast = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  if (broadcast) {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function useRecentProjects() {
  const [localProjects, setLocalProjects] = useState<RecentProject[]>(loadRecent);

  const { data: serverProjects, isSuccess } = useQuery<RecentProject[]>({
    queryKey: ["/api/recent-projects"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (isSuccess && serverProjects) {
      saveRecent(serverProjects, false);
      setLocalProjects(serverProjects);
    }
  }, [isSuccess, serverProjects]);

  const mutation = useMutation({
    mutationFn: (projectId: number) =>
      apiRequest("POST", "/api/recent-projects", { projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recent-projects"] });
    },
  });

  const trackProject = useCallback(
    (project: RecentProject) => {
      setLocalProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== project.id);
        const next = [project, ...filtered].slice(0, MAX_RECENT);
        saveRecent(next);
        return next;
      });
      mutation.mutate(project.id);
    },
    [mutation],
  );

  useEffect(() => {
    const handleChange = () => setLocalProjects(loadRecent());
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return { recentProjects: localProjects, trackProject };
}
