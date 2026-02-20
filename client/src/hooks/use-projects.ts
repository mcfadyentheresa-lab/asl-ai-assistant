import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProject, type InsertMilestone, type InsertTask, type InsertMessage, type InsertChecklistItem, type InsertBoardItem, type InsertCalendarEvent, type Document } from "@shared/schema";

// --- Users ---
export function useUsers() {
  return useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; role: string | null; profileImageUrl: string | null }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useUpdateUserPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, phone }: { userId: string; phone: string }) => {
      const res = await fetch(`/api/users/${userId}/phone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update phone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });
}

export function useSendTestSms() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send test SMS");
      }
      return res.json();
    },
  });
}

export function useNotifyTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, message, recipientIds }: { projectId: number; message: string; recipientIds?: string[] }) => {
      const res = await fetch(`/api/projects/${projectId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, recipientIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send notification");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

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

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertProject> }) => {
      const url = buildUrl(api.projects.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.projects.get.path, variables.id] });
    },
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
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...data }: { id: number; projectId: number; title?: string; date?: string | null; completed?: boolean; order?: number }) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update milestone");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.milestones.list.path, variables.projectId] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; projectId: number }) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete milestone");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.milestones.list.path, variables.projectId] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

// --- Delete / Archive Projects ---
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.projects.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      return api.projects.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.projects.list.path] }),
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.projects.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to archive project");
      return api.projects.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.projects.list.path] }),
  });
}

// --- Checklist Items ---
export function useChecklistItems(projectId: number) {
  return useQuery({
    queryKey: [api.checklist.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.checklist.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch checklist items");
      return api.checklist.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertChecklistItem & { projectId: number }) => {
      const url = buildUrl(api.checklist.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create checklist item");
      return api.checklist.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.checklist.list.path, variables.projectId] });
    },
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertChecklistItem>) => {
      const url = buildUrl(api.checklist.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update checklist item");
      return api.checklist.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.checklist.list.path] });
    },
  });
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.checklist.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete checklist item");
      return api.checklist.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.checklist.list.path] });
    },
  });
}

// --- Board Items (Moodboard) ---
export function useBoardItems(projectId: number) {
  return useQuery({
    queryKey: [api.board.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.board.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch board items");
      return api.board.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateBoardItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertBoardItem & { projectId: number }) => {
      const url = buildUrl(api.board.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create board item");
      return api.board.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.board.list.path, variables.projectId] });
    },
  });
}

export function useUpdateBoardItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertBoardItem>) => {
      const url = buildUrl(api.board.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update board item");
      return api.board.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.board.list.path] });
    },
  });
}

export function useDeleteBoardItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.board.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete board item");
      return api.board.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.board.list.path] });
    },
  });
}

// --- Planning Boards ---
export function usePlanningBoards(projectId: number) {
  return useQuery({
    queryKey: ['/api/projects', projectId, 'planning-boards'],
    queryFn: async () => {
      const url = buildUrl(api.planningBoards.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch planning boards");
      return await res.json();
    },
    enabled: !!projectId,
  });
}

export function usePlanningBoard(id: number | null) {
  return useQuery({
    queryKey: ['/api/planning-boards', id],
    queryFn: async () => {
      const url = buildUrl(api.planningBoards.get.path, { id: id! });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch planning board");
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useCreatePlanningBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, name }: { projectId: number; name?: string }) => {
      const url = buildUrl(api.planningBoards.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "Untitled Board" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create planning board");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'planning-boards'] });
    },
  });
}

export function useUpdatePlanningBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; name?: string; linkedMilestoneId?: number | null; linkedChecklistItemId?: number | null; linkedCalendarEventId?: number | null; linkedUserIds?: string[]; linkedProjectIds?: number[]; notifyUsers?: boolean }) => {
      const url = buildUrl(api.planningBoards.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update planning board");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', data.projectId, 'planning-boards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/planning-boards', data.id] });
    },
  });
}

export function useDeletePlanningBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const url = buildUrl(api.planningBoards.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete planning board");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'planning-boards'] });
    },
  });
}

export function useSavePlanningBoardCanvas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, canvasData }: { id: number; canvasData: any }) => {
      const url = buildUrl(api.planningBoards.saveCanvas.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasData }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save planning board canvas");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/planning-boards', data.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', data.projectId, 'planning-boards'] });
    },
  });
}

// --- Activity Log ---
export function useActivityLog(projectId: number) {
  return useQuery({
    queryKey: ['/api/projects', projectId, 'activity'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/activity`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity log");
      return res.json();
    },
  });
}

// --- Calendar Events ---
export function useCalendarEvents(projectId: number) {
  return useQuery({
    queryKey: [api.calendar.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.calendar.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calendar events");
      return api.calendar.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: InsertCalendarEvent & { projectId: number }) => {
      const url = buildUrl(api.calendar.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create calendar event");
      return api.calendar.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.calendar.list.path, variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; date?: string; title?: string; description?: string | null; type?: string }) => {
      const url = buildUrl(api.calendar.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update calendar event");
      return api.calendar.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.calendar.list.path] });
    },
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.calendar.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete calendar event");
      return api.calendar.delete.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.calendar.list.path] });
    },
  });
}

export function useUploadCalendarEventImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, file, projectId }: { eventId: number; file: File; projectId: number }) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/calendar/${eventId}/image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to upload image");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.calendar.list.path, variables.projectId] });
    },
  });
}

// --- Photos ---
export function usePhotos(projectId: number) {
  return useQuery<import("@shared/schema").Photo[]>({
    queryKey: [api.photos.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.photos.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreatePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: { projectId: number; url: string; caption?: string; tags?: string[] }) => {
      const url = buildUrl(api.photos.create.path, { projectId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create photo");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.photos.list.path, variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const res = await fetch(`/api/photos/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete photo");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.photos.list.path, variables.projectId] });
    },
  });
}

export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<{ url: string }>;
    },
  });
}

// --- Documents ---
export function useDocuments(projectId: number) {
  return useQuery<Document[]>({
    queryKey: [api.documents.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.documents.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, file, title, type }: { projectId: number; file: File; title: string; type: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("type", type);
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<Document>;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', variables.projectId, 'activity'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete document");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.documents.list.path] });
    },
  });
}
