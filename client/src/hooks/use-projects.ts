import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProject, type InsertMilestone, type InsertTask, type InsertMessage } from "@shared/schema";

// --- Projects ---
export function useProjects() {
  return useQuery({
    queryKey: [api.projects.list.path],
    queryFn: async () => {
      const res = await fetch(api.projects.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return api.projects.list.responses[200].parse(await res.json());
    },
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: [api.projects.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.projects.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch project");
      return api.projects.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProject) => {
      const res = await fetch(api.projects.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create project");
      return api.projects.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.projects.list.path] }),
  });
}

// --- Milestones ---
export function useMilestones(projectId: number) {
  return useQuery({
    queryKey: [api.milestones.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.milestones.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch milestones");
      return api.milestones.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertMilestone & { projectId: number }) => {
      const url = buildUrl(api.milestones.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create milestone");
      return api.milestones.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      const url = buildUrl(api.milestones.list.path, { projectId: variables.projectId });
      queryClient.invalidateQueries({ queryKey: [url, variables.projectId] });
    },
  });
}

// --- Tasks ---
export function useTasks(projectId: number) {
  return useQuery({
    queryKey: [api.tasks.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.tasks.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return api.tasks.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertTask & { projectId: number }) => {
      const url = buildUrl(api.tasks.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create task");
      return api.tasks.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      const url = buildUrl(api.tasks.list.path, { projectId: variables.projectId });
      queryClient.invalidateQueries({ queryKey: [url, variables.projectId] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertTask>) => {
      const url = buildUrl(api.tasks.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update task");
      return api.tasks.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      // Invalidate generally as we don't always know projectId easily here without passing it
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

// --- Messages ---
export function useMessages(projectId: number) {
  return useQuery({
    queryKey: [api.messages.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.messages.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return api.messages.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll every 5s for chat
    enabled: !!projectId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertMessage & { projectId: number }) => {
      const url = buildUrl(api.messages.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return api.messages.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      const url = buildUrl(api.messages.list.path, { projectId: variables.projectId });
      queryClient.invalidateQueries({ queryKey: [url, variables.projectId] });
    },
  });
}
