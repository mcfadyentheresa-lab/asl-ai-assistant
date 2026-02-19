import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { authStorage } from "./replit_integrations/auth/storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import {
  notifyNewMessage,
  notifyTaskAssigned,
  notifyTaskStatusChange,
  notifyProjectUpdate,
  notifyMilestoneCreated,
  notifyPhotoUploaded,
  notifyDocumentUploaded,
  notifyCalendarEventCreated,
  notifyCalendarEventChanged,
  notifyTeamCustom,
  sendTestSms,
  notifyBoardLinked,
} from "./sms";
import { heartbeat, getOnlineUsers, setVisibility, getVisibility } from "./presence";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only image files (JPG, PNG, GIF, WebP) are allowed"));
    }
    cb(null, true);
  },
});

const allowedDocMimeTypes = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const docUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedDocMimeTypes.has(file.mimetype)) {
      return cb(new Error("File type not supported"));
    }
    cb(null, true);
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  // Serve uploaded files
  const express = await import("express");
  app.use("/uploads", express.default.static(uploadDir));

  // Image upload endpoint
  app.post("/api/upload", isAuthenticated, (req: any, res) => {
    imageUpload.single("image")(req, res, (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

  app.patch("/api/auth/role", isAuthenticated, async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!["client", "crew", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const userId = req.user.claims.sub;
      const user = await authStorage.updateUserRole(userId, role);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // Users (for client assignment)
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === "client") {
        return res.status(403).json({ message: "Not authorized" });
      }
      const allUsers = await authStorage.getUsers();
      res.json(allUsers.map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        profileImageUrl: u.profileImageUrl,
      })));
    } catch {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  const profileUpdateSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(30).nullable().optional(),
  });

  app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }
      const userId = req.user.claims.sub;
      const user = await authStorage.updateUserProfile(userId, parsed.data);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.patch("/api/auth/profile-photo", isAuthenticated, (req: any, res) => {
    imageUpload.single("image")(req, res, async (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      const url = `/uploads/${req.file.filename}`;
      try {
        const userId = req.user.claims.sub;
        const { db } = await import("./db");
        const { users } = await import("@shared/models/auth");
        const { eq } = await import("drizzle-orm");
        const [updated] = await db
          .update(users)
          .set({ profileImageUrl: url, updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();
        if (!updated) return res.status(404).json({ message: "User not found" });
        res.json(updated);
      } catch (error) {
        console.error("Error updating profile photo:", error);
        res.status(500).json({ message: "Failed to update profile photo" });
      }
    });
  });

  app.patch("/api/users/:id/phone", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update phone numbers" });
      }
      const { phone } = req.body;
      const user = await authStorage.updateUserPhone(req.params.id, phone || null);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error updating phone:", error);
      res.status(500).json({ message: "Failed to update phone" });
    }
  });

  app.patch("/api/users/:id/profile", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update user profiles" });
      }
      const { firstName, lastName, email, role, phone } = req.body;
      const user = await authStorage.updateUserProfile(req.params.id, { firstName, lastName, email, role, phone });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  app.delete("/api/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete users" });
      }
      if (req.params.id === requesterId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      const deleted = await authStorage.deleteUser(req.params.id);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  const createUserSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().max(255),
    phone: z.string().max(30).nullable().optional(),
    role: z.enum(["admin", "crew", "client"]),
  });

  app.post("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can add team members" });
      }
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }
      const id = `manual-${randomUUID().slice(0, 8)}`;
      const user = await authStorage.upsertUser({
        id,
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone || null,
        role: parsed.data.role,
      });
      res.status(201).json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === '23505') {
        return res.status(409).json({ message: "A user with that email already exists" });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.post("/api/users/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can archive users" });
      }
      if (req.params.id === requesterId) {
        return res.status(400).json({ message: "You cannot archive your own account" });
      }
      const user = await authStorage.archiveUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error archiving user:", error);
      res.status(500).json({ message: "Failed to archive user" });
    }
  });

  app.post("/api/users/:id/unarchive", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can unarchive users" });
      }
      const user = await authStorage.unarchiveUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error unarchiving user:", error);
      res.status(500).json({ message: "Failed to unarchive user" });
    }
  });

  // Projects
  app.get(api.projects.list.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.claims.sub;
    const dbUser = await authStorage.getUser(userId);

    if (dbUser?.role === 'client') {
      const projects = await storage.getProjectsByClient(userId);
      res.json(projects);
    } else {
      // Admin/Crew see all projects (or filter by assignment - simplified to all for now)
      const projects = await storage.getProjects();
      res.json(projects);
    }
  });

  app.get(api.projects.get.path, isAuthenticated, async (req: any, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === 'client' && project.clientId !== userId) {
      return res.status(403).json({ message: 'Not authorized to view this project' });
    }
    res.json(project);
  });

  app.post(api.projects.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === "client") {
        return res.status(403).json({ message: "Clients cannot create projects" });
      }
      const input = api.projects.create.input.parse(req.body);
      const project = await storage.createProject({ ...input, clientId: input.clientId || null });
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.projects.update.path, isAuthenticated, async (req, res) => {
    const existing = await storage.getProject(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Project not found" });
    const input = api.projects.update.input.parse(req.body);
    const project = await storage.updateProject(Number(req.params.id), input);
    res.json(project);
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    await storage.deleteProject(Number(req.params.id));
    res.json({ success: true });
  });

  // Tasks
  app.get(api.tasks.list.path, isAuthenticated, async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  });

  app.post(api.tasks.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.tasks.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);
    const task = await storage.createTask({ ...input, projectId });
    res.status(201).json(task);

    const project = await storage.getProject(projectId);
    if (project && input.assignedTo) {
      notifyTaskAssigned(project.name, input.title, input.assignedTo).catch(() => {});
    }
  });

  app.put(api.tasks.update.path, isAuthenticated, async (req: any, res) => {
    const taskId = Number(req.params.id);
    const task = await storage.updateTask(taskId, req.body);
    res.json(task);

    if (req.body.status && task.projectId) {
      const project = await storage.getProject(task.projectId);
      if (project) {
        const userId = req.user.claims.sub;
        notifyTaskStatusChange(project.name, task.title, task.status || "updated", project.clientId, userId).catch(() => {});
      }
    }
  });

  // Milestones
  app.get(api.milestones.list.path, isAuthenticated, async (req, res) => {
    const milestones = await storage.getMilestones(Number(req.params.projectId));
    res.json(milestones);
  });

  app.post(api.milestones.create.path, isAuthenticated, async (req, res) => {
    const input = api.milestones.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);
    const milestone = await storage.createMilestone({ ...input, projectId });
    res.status(201).json(milestone);

    const project = await storage.getProject(projectId);
    if (project) {
      notifyMilestoneCreated(project.name, input.title, project.clientId).catch(() => {});
      storage.createActivityLog({ projectId, userId: (req as any).user?.claims?.sub, type: "milestone_created", title: `Milestone added: ${input.title}` }).catch(() => {});
    }
  });

  // Photos
  app.get(api.photos.list.path, isAuthenticated, async (req, res) => {
    const photos = await storage.getPhotos(Number(req.params.projectId));
    res.json(photos);
  });

  app.post(api.photos.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.photos.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);
    const photo = await storage.createPhoto({ ...input, projectId });
    res.status(201).json(photo);

    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (project) {
      notifyPhotoUploaded(project.name, project.clientId, userId).catch(() => {});
      storage.createActivityLog({ projectId, userId, type: "photo_uploaded", title: "Photo uploaded", description: input.caption || undefined }).catch(() => {});
    }
  });

  app.delete("/api/photos/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePhoto(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  // Documents
  app.get(api.documents.list.path, isAuthenticated, async (req, res) => {
    const docs = await storage.getDocuments(Number(req.params.projectId));
    res.json(docs);
  });

  app.post("/api/projects/:projectId/documents/upload", isAuthenticated, (req: any, res) => {
    docUpload.single("file")(req, res, async (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 25MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
      const url = `/uploads/${req.file.filename}`;
      const title = req.body.title || req.file.originalname;
      const type = req.body.type || "other";
      try {
        const projectId = Number(req.params.projectId);
        const doc = await storage.createDocument({
          title,
          url,
          type,
          projectId,
        });
        res.status(201).json(doc);

        const userId = req.user.claims.sub;
        const project = await storage.getProject(projectId);
        if (project) {
          notifyDocumentUploaded(project.name, title, project.clientId, userId).catch(() => {});
          storage.createActivityLog({ projectId, userId, type: "document_uploaded", title: `Document uploaded: ${title}` }).catch(() => {});
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to save document" });
      }
    });
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteDocument(Number(req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Messages
  app.get(api.messages.list.path, isAuthenticated, async (req, res) => {
    const messages = await storage.getMessages(Number(req.params.projectId));
    res.json(messages);
  });

  app.post(api.messages.create.path, isAuthenticated, async (req, res) => {
    const input = api.messages.create.input.parse(req.body);
    const user = req.user as any;
    const userId = user.claims.sub;
    const message = await storage.createMessage({ 
      ...input, 
      projectId: Number(req.params.projectId),
      senderId: userId 
    });
    res.status(201).json(message);

    const project = await storage.getProject(Number(req.params.projectId));
    if (project) {
      const sender = await authStorage.getUser(userId);
      const senderName = sender ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || "Someone" : "Someone";
      notifyNewMessage(project.id, project.name, senderName, input.content, userId, project.clientId).catch(() => {});
      storage.createActivityLog({ projectId: project.id, userId, type: "message_sent", title: `Message from ${senderName}`, description: input.content.slice(0, 100) }).catch(() => {});
    }
  });

  // Time Entries
  app.get(api.timeEntries.list.path, isAuthenticated, async (req, res) => {
    const entries = await storage.getTimeEntries(Number(req.params.projectId));
    res.json(entries);
  });

  app.post(api.timeEntries.create.path, isAuthenticated, async (req, res) => {
    const input = api.timeEntries.create.input.parse(req.body);
    const user = req.user as any;
    const entry = await storage.createTimeEntry({ 
      ...input, 
      projectId: Number(req.params.projectId),
      userId: user.claims.sub
    });
    res.status(201).json(entry);
  });

  // Checklist Items
  app.get(api.checklist.list.path, isAuthenticated, async (req, res) => {
    const items = await storage.getChecklistItems(Number(req.params.projectId));
    res.json(items);
  });

  app.post(api.checklist.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.checklist.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const item = await storage.createChecklistItem({
      ...input,
      projectId: Number(req.params.projectId),
      createdBy: userId,
    });
    res.status(201).json(item);
  });

  app.put("/api/checklist/:id", isAuthenticated, async (req, res) => {
    const input = api.checklist.update.input.parse(req.body);
    const item = await storage.updateChecklistItem(Number(req.params.id), input);
    if (!item) return res.status(404).json({ message: "Checklist item not found" });
    res.json(item);
  });

  app.delete("/api/checklist/:id", isAuthenticated, async (req, res) => {
    await storage.deleteChecklistItem(Number(req.params.id));
    res.json({ success: true });
  });

  // Board Items (Moodboard)
  app.get(api.board.list.path, isAuthenticated, async (req, res) => {
    const items = await storage.getBoardItems(Number(req.params.projectId));
    res.json(items);
  });

  app.post(api.board.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.board.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const item = await storage.createBoardItem({
      ...input,
      projectId: Number(req.params.projectId),
      createdBy: userId,
    });
    res.status(201).json(item);
  });

  app.put("/api/board/:id", isAuthenticated, async (req, res) => {
    const input = api.board.update.input.parse(req.body);
    const item = await storage.updateBoardItem(Number(req.params.id), input);
    if (!item) return res.status(404).json({ message: "Board item not found" });
    res.json(item);
  });

  app.delete("/api/board/:id", isAuthenticated, async (req, res) => {
    await storage.deleteBoardItem(Number(req.params.id));
    res.json({ success: true });
  });

  // Planning Boards
  app.get(api.planningBoards.list.path, isAuthenticated, async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role === "client") {
      const project = await storage.getProject(projectId);
      if (!project || project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    const boards = await storage.getPlanningBoards(projectId);
    res.json(boards);
  });

  async function checkBoardAccess(req: any, res: any, boardId: number) {
    const board = await storage.getPlanningBoard(boardId);
    if (!board) { res.status(404).json({ message: "Board not found" }); return null; }
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role === "client") {
      const project = await storage.getProject(board.projectId);
      if (!project || project.clientId !== userId) { res.status(403).json({ message: "Access denied" }); return null; }
    }
    return board;
  }

  async function checkProjectAccess(req: any, res: any, projectId: number) {
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role === "client") {
      const project = await storage.getProject(projectId);
      if (!project || project.clientId !== userId) { res.status(403).json({ message: "Access denied" }); return false; }
    }
    return true;
  }

  app.get(api.planningBoards.get.path, isAuthenticated, async (req: any, res) => {
    const board = await checkBoardAccess(req, res, Number(req.params.id));
    if (!board) return;
    res.json(board);
  });

  app.post(api.planningBoards.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const hasAccess = await checkProjectAccess(req, res, projectId);
      if (!hasAccess) return;
      const userId = req.user.claims.sub;
      const input = api.planningBoards.create.input.parse(req.body);
      const board = await storage.createPlanningBoard({ ...input, projectId, updatedBy: userId });
      res.status(201).json(board);
    } catch (err: any) {
      console.error("Planning board create error:", err.message);
      res.status(500).json({ message: "Failed to create planning board" });
    }
  });

  app.patch(api.planningBoards.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const board = await checkBoardAccess(req, res, Number(req.params.id));
      if (!board) return;
      const { notifyUsers, ...fields } = req.body;
      const input = api.planningBoards.update.input.parse(fields);
      const previousLinkedUsers = (board.linkedUserIds || []) as string[];
      const updated = await storage.updatePlanningBoard(board.id, input);
      res.json(updated);

      if (notifyUsers && input.linkedUserIds) {
        const newUserIds = (input.linkedUserIds as string[]).filter(
          (uid) => !previousLinkedUsers.includes(uid)
        );
        if (newUserIds.length > 0) {
          const project = await storage.getProject(board.projectId);
          const userId = req.user.claims.sub;
          const allUsers = await authStorage.getUsers();
          const actor = allUsers.find((u) => u.id === userId);
          const actorName = actor
            ? `${actor.firstName || ""} ${actor.lastName || ""}`.trim() || "Someone"
            : "Someone";
          notifyBoardLinked(
            updated.name,
            project?.name || "a project",
            actorName,
            userId,
            newUserIds,
            board.projectId
          ).catch((err) => console.error("Board link SMS error:", err));
        }
      }
    } catch (err: any) {
      console.error("Planning board update error:", err.message);
      res.status(500).json({ message: "Failed to update planning board" });
    }
  });

  app.delete(api.planningBoards.delete.path, isAuthenticated, async (req: any, res) => {
    const board = await checkBoardAccess(req, res, Number(req.params.id));
    if (!board) return;
    await storage.deletePlanningBoard(board.id);
    res.json({ success: true });
  });

  app.put(api.planningBoards.saveCanvas.path, isAuthenticated, async (req: any, res) => {
    try {
      const board = await checkBoardAccess(req, res, Number(req.params.id));
      if (!board) return;
      const userId = req.user.claims.sub;
      const input = api.planningBoards.saveCanvas.input.parse(req.body);
      const updated = await storage.savePlanningBoardCanvas(board.id, input.canvasData, userId);
      res.json(updated);
    } catch (err: any) {
      console.error("Planning board canvas save error:", err.message);
      res.status(500).json({ message: "Failed to save planning board canvas" });
    }
  });

  // Canvas Elements
  app.get(api.canvasElements.list.path, isAuthenticated, async (req: any, res) => {
    const boardId = Number(req.params.boardId);
    const board = await checkBoardAccess(req, res, boardId);
    if (!board) return;
    const elements = await storage.getCanvasElements(boardId);
    res.json(elements);
  });

  app.post(api.canvasElements.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const boardId = Number(req.params.boardId);
      const board = await checkBoardAccess(req, res, boardId);
      if (!board) return;
      const userId = req.user.claims.sub;
      const input = api.canvasElements.create.input.parse(req.body);
      const element = await storage.createCanvasElement({ ...input, boardId, createdBy: userId });
      res.status(201).json(element);
    } catch (err: any) {
      console.error("Canvas element create error:", err.message);
      res.status(500).json({ message: "Failed to create canvas element" });
    }
  });

  app.post(api.canvasElements.createBatch.path, isAuthenticated, async (req: any, res) => {
    try {
      const boardId = Number(req.params.boardId);
      const board = await checkBoardAccess(req, res, boardId);
      if (!board) return;
      const userId = req.user.claims.sub;
      const input = api.canvasElements.createBatch.input.parse(req.body);
      const elements = await storage.createCanvasElements(
        input.elements.map((e: any) => ({ ...e, boardId, createdBy: userId }))
      );
      res.status(201).json(elements);
    } catch (err: any) {
      console.error("Canvas elements batch create error:", err.message);
      res.status(500).json({ message: "Failed to create canvas elements" });
    }
  });

  app.patch(api.canvasElements.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const element = await storage.getCanvasElement(id);
      if (!element) return res.status(404).json({ message: "Element not found" });
      const board = await checkBoardAccess(req, res, element.boardId);
      if (!board) return;
      const input = api.canvasElements.update.input.parse(req.body);
      const updated = await storage.updateCanvasElement(id, input);
      res.json(updated);
    } catch (err: any) {
      console.error("Canvas element update error:", err.message);
      res.status(500).json({ message: "Failed to update canvas element" });
    }
  });

  app.patch(api.canvasElements.updatePositions.path, isAuthenticated, async (req: any, res) => {
    try {
      const boardId = Number(req.params.boardId);
      const board = await checkBoardAccess(req, res, boardId);
      if (!board) return;
      const input = api.canvasElements.updatePositions.input.parse(req.body);
      await storage.updateCanvasElementPositions(boardId, input.updates);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Canvas element positions update error:", err.message);
      res.status(500).json({ message: "Failed to update positions" });
    }
  });

  app.delete(api.canvasElements.delete.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const element = await storage.getCanvasElement(id);
      if (!element) return res.status(404).json({ message: "Element not found" });
      const board = await checkBoardAccess(req, res, element.boardId);
      if (!board) return;
      await storage.deleteCanvasElement(id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Canvas element delete error:", err.message);
      res.status(500).json({ message: "Failed to delete canvas element" });
    }
  });

  // Calendar Events
  app.get(api.calendar.list.path, isAuthenticated, async (req, res) => {
    const events = await storage.getCalendarEvents(Number(req.params.projectId));
    res.json(events);
  });

  app.post(api.calendar.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.calendar.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const projectId = Number(req.params.projectId);
    const event = await storage.createCalendarEvent({
      ...input,
      projectId,
      createdBy: userId,
    });
    res.status(201).json(event);

    const project = await storage.getProject(projectId);
    if (project) {
      notifyCalendarEventCreated(project.name, input.title, input.date || "TBD", project.clientId, userId).catch(() => {});
      storage.createActivityLog({ projectId, userId, type: "calendar_event_created", title: `Event added: ${input.title}`, description: input.date || undefined }).catch(() => {});
    }
  });

  app.put("/api/calendar/:id", isAuthenticated, async (req: any, res) => {
    const input = api.calendar.update.input.parse(req.body);
    const event = await storage.updateCalendarEvent(Number(req.params.id), input);
    if (!event) return res.status(404).json({ message: "Calendar event not found" });
    res.json(event);

    const userId = req.user?.claims?.sub;
    if (event.projectId && userId) {
      const project = await storage.getProject(event.projectId);
      if (project) {
        notifyCalendarEventChanged(
          project.name,
          input.title || event.title,
          "Date or details updated",
          project.clientId,
          userId
        ).catch(() => {});
      }
    }
  });

  app.post("/api/calendar/:id/image", isAuthenticated, (req: any, res) => {
    imageUpload.single("image")(req, res, async (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No image file provided" });
      const url = `/uploads/${req.file.filename}`;
      try {
        const event = await storage.updateCalendarEvent(Number(req.params.id), { imageUrl: url });
        if (!event) return res.status(404).json({ message: "Calendar event not found" });
        res.json(event);
      } catch (error) {
        console.error("Error uploading calendar event image:", error);
        res.status(500).json({ message: "Failed to upload image" });
      }
    });
  });

  app.delete("/api/calendar/:id", isAuthenticated, async (req, res) => {
    const eventId = Number(req.params.id);
    const event = await storage.getCalendarEvent(eventId);
    if (event) {
      await storage.deleteActivityByTypeAndTitle(event.projectId, "calendar_event_created", `Event added: ${event.title}`);
    }
    await storage.deleteCalendarEvent(eventId);
    res.json({ success: true });
  });

  // Weather & PDF Reports Stubs
  app.get('/api/projects/:projectId/weather', isAuthenticated, async (req, res) => {
    // In a real app, we'd call a weather API. For now, we'll return mock data based on "Muskoka"
    res.json({
      temp: 18,
      condition: "Partly Cloudy",
      impact: "No immediate impact on outdoor framing. Keep materials covered for potential evening showers."
    });
  });

  app.post('/api/projects/:projectId/reports', isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    
    // In a real app, use a library like PDFKit. For now, return a mock URL
    res.json({ url: `/api/projects/${project.id}/reports/mock-report.pdf` });
  });

  // Handwriting-to-text recognition using AI Vision
  app.post("/api/ai/recognize-handwriting", isAuthenticated, async (req: any, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "imageData (base64 PNG) is required" });
      }

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a handwriting OCR. Extract the handwritten text from the image. Return ONLY the text, nothing else. If no text, return empty string."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read and return the handwritten text."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageData.startsWith("data:") ? imageData : `data:image/png;base64,${imageData}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 200,
      });

      const text = response.choices[0]?.message?.content?.trim() || "";
      res.json({ text });
    } catch (error: any) {
      console.error("Handwriting recognition error:", error);
      res.status(500).json({ error: "Failed to recognize handwriting" });
    }
  });

  app.post("/api/presence/heartbeat", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser) {
      heartbeat(userId, dbUser.firstName, dbUser.lastName, dbUser.role, dbUser.profileImageUrl);
    }
    res.json({ ok: true });
  });

  app.get("/api/presence/online", isAuthenticated, async (_req: any, res) => {
    res.json(getOnlineUsers());
  });

  app.post("/api/presence/visibility", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { visible } = req.body;
    setVisibility(userId, !!visible);
    res.json({ visible: getVisibility(userId) });
  });

  app.get("/api/presence/visibility", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    res.json({ visible: getVisibility(userId) });
  });

  app.post("/api/sms/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requester = await authStorage.getUser(userId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can send test SMS" });
      }
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ message: "Phone number required" });
      }
      const success = await sendTestSms(phone);
      if (success) {
        res.json({ message: "Test SMS sent successfully" });
      } else {
        res.status(500).json({ message: "Failed to send test SMS. Check Twilio configuration." });
      }
    } catch (error: any) {
      console.error("Test SMS error:", error);
      res.status(500).json({ message: error.message || "Failed to send test SMS" });
    }
  });

  app.post("/api/projects/:projectId/notify", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requester = await authStorage.getUser(userId);
      if (!requester || (requester.role !== "admin" && requester.role !== "crew")) {
        return res.status(403).json({ message: "Only admins and crew can send team notifications" });
      }
      const { message, recipientIds } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }
      if (message.length > 300) {
        return res.status(400).json({ message: "Message must be 300 characters or less" });
      }
      const project = await storage.getProject(Number(req.params.projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const result = await notifyTeamCustom(
        project.name,
        message.trim(),
        project.clientId,
        userId,
        Array.isArray(recipientIds) ? recipientIds : undefined
      );

      await storage.createActivityLog({
        projectId: Number(req.params.projectId),
        userId,
        type: "notification_sent",
        title: "Team notification sent",
        description: message.trim(),
      });

      res.json({ message: `Notification sent to ${result.sent} team member(s)`, ...result });
    } catch (error: any) {
      console.error("Notify team error:", error);
      res.status(500).json({ message: error.message || "Failed to send notification" });
    }
  });

  // Activity Log
  app.get("/api/projects/:projectId/activity", isAuthenticated, async (req: any, res) => {
    const entries = await storage.getActivityLog(Number(req.params.projectId), 30);
    const activityIds = entries.map((e) => e.id);
    const views = await storage.getActivityViews(activityIds);
    const viewsByActivity: Record<number, { userId: string; viewedAt: string | null }[]> = {};
    for (const v of views) {
      if (!viewsByActivity[v.activityId]) viewsByActivity[v.activityId] = [];
      viewsByActivity[v.activityId].push({ userId: v.userId, viewedAt: v.viewedAt?.toISOString() || null });
    }
    const enriched = entries.map((e) => ({
      ...e,
      views: viewsByActivity[e.id] || [],
    }));
    res.json(enriched);
  });

  app.post("/api/activity/:activityId/view", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const activityId = Number(req.params.activityId);
    await storage.markActivityViewed(activityId, userId);
    res.json({ ok: true });
  });

  // Initialize seed data
  await seedDatabase();

  return httpServer;
}

// Seed function to create initial data if needed
async function seedDatabase() {
  const projects = await storage.getProjects();
  if (projects.length === 0) {
    const project = await storage.createProject({
      name: "Muskoka Lakefront Renovation",
      description: "Complete renovation of the main cottage and boathouse, featuring custom millwork, stone fireplaces, and expansive deck systems.",
      status: "in_progress",
      address: "123 Lakeview Dr, Muskoka Lakes, ON",
      startDate: new Date().toISOString(),
      thumbnailUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6",
      totalBudget: 500000,
      budgetUsed: 150000
    });

    const projectId = project.id;

    // Milestones
    const m1 = await storage.createMilestone({ projectId, title: "Demolition & Site Prep", date: new Date("2023-05-15").toISOString(), completed: true, order: 1 });
    const m2 = await storage.createMilestone({ projectId, title: "Foundation & Framing", date: new Date("2023-06-30").toISOString(), completed: true, order: 2 });
    const m3 = await storage.createMilestone({ projectId, title: "Rough-ins (Plumbing, Electrical)", date: new Date("2023-08-15").toISOString(), completed: false, order: 3 });
    const m4 = await storage.createMilestone({ projectId, title: "Interior Finishes", date: new Date("2023-10-01").toISOString(), completed: false, order: 4 });

    // Tasks
    await storage.createTask({ projectId, milestoneId: m3.id, title: "Electrical Rough-in Inspection", status: "todo", dueDate: new Date("2023-08-10").toISOString() });
    await storage.createTask({ projectId, milestoneId: m3.id, title: "Plumbing Rough-in", status: "in_progress", dueDate: new Date("2023-08-12").toISOString() });
    await storage.createTask({ projectId, milestoneId: m2.id, title: "Frame Boathouse Roof", status: "done", dueDate: new Date("2023-06-25").toISOString() });

    // Photos
    await storage.createPhoto({ projectId, url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c", caption: "Living Room Concept", tags: ["interior", "concept"] });
    await storage.createPhoto({ projectId, url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3", caption: "Kitchen Materials", tags: ["kitchen", "materials"] });

    // Documents
    await storage.createDocument({ projectId, title: "Original Contract", url: "#", type: "contract" });
    await storage.createDocument({ projectId, title: "Site Plan v2", url: "#", type: "plan" });
  }
}
