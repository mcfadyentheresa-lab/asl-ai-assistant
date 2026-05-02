import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

const STORAGE_KEY = "asl_recent_projects";
const CHANGE_EVENT = "asl_recent_projects_changed";
const MAX_RECENT = 3;

export interface RecentProject {
  id: number;
  name: string;
  // Optional id of the last planning board the user opened on this project.
  // Used by "Jump back in" so re-entry lands on the exact board they left.
  lastBoardId?: number | null;
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
    mutationFn: (vars: { projectId: number; boardId?: number }) =>
      apiRequest("POST", "/api/recent-projects", {
        projectId: vars.projectId,
        ...(typeof vars.boardId === "number" ? { boardId: vars.boardId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recent-projects"] });
    },
  });

  // Track a project visit. Pass `boardId` only when the user actually opened a
  // planning board — otherwise we keep whatever lastBoardId the server already
  // has (so a bare project visit doesn't wipe out the board the user wants to
  // jump back into).
  const trackProject = useCallback(
    (project: RecentProject, boardId?: number) => {
      setLocalProjects((prev) => {
        const existing = prev.find((p) => p.id === project.id);
        const merged: RecentProject = {
          id: project.id,
          name: project.name,
          lastBoardId:
            typeof boardId === "number"
              ? boardId
              : project.lastBoardId ?? existing?.lastBoardId ?? null,
        };
        const filtered = prev.filter((p) => p.id !== project.id);
        const next = [merged, ...filtered].slice(0, MAX_RECENT);
        saveRecent(next);
        return next;
      });
      mutation.mutate({ projectId: project.id, boardId });
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
