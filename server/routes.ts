import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertSubMilestoneSchema, insertTimeEntrySchema, insertCostCategorySchema, insertMarketRateSchema, insertProjectEstimateSchema, insertEstimateItemSchema, insertReceiptSchema, insertCrewRateSchema, insertSubcontractorSchema } from "@shared/schema";
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

    if (milestone.date) {
      storage.createCalendarEvent({
        projectId,
        title: `Milestone Due: ${milestone.title}`,
        description: `milestone:${milestone.id}`,
        date: milestone.date,
        type: "milestone",
        createdBy: (req as any).user?.claims?.sub,
      }).catch(() => {});
    }

    const project = await storage.getProject(projectId);
    if (project) {
      notifyMilestoneCreated(project.name, input.title, project.clientId).catch(() => {});
      storage.createActivityLog({ projectId, userId: (req as any).user?.claims?.sub, type: "milestone_created", title: `Milestone added: ${input.title}` }).catch(() => {});
    }
  });

  app.patch("/api/milestones/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.user.claims.sub;
      
      const schema = z.object({
        title: z.string().optional(),
        date: z.string().nullable().optional(),
        completed: z.boolean().optional(),
        completedBy: z.string().nullable().optional(),
        order: z.number().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }

      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }

      const project = await storage.getProject(milestone.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === 'client' && project.clientId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this milestone" });
      }

      const updateData: any = { ...parsed.data };
      if (parsed.data.completed === false) {
        updateData.completedBy = null;
      }

      const updated = await storage.updateMilestone(id, updateData);

      const milestoneEvents = await storage.getCalendarEventsByType(milestone.projectId, "milestone");
      const linkedEvent = milestoneEvents.find(e => e.description === `milestone:${id}`);

      if ('date' in parsed.data || 'title' in parsed.data) {
        const newDate = 'date' in parsed.data ? parsed.data.date : milestone.date;
        const newTitle = parsed.data.title || milestone.title;

        if (linkedEvent) {
          if (newDate === null || newDate === undefined) {
            await storage.deleteCalendarEvent(linkedEvent.id);
          } else {
            await storage.updateCalendarEvent(linkedEvent.id, {
              title: `Milestone Due: ${newTitle}`,
              date: newDate,
            });
          }
        } else if (newDate) {
          await storage.createCalendarEvent({
            projectId: milestone.projectId,
            title: `Milestone Due: ${newTitle}`,
            description: `milestone:${id}`,
            date: newDate,
            type: "milestone",
            createdBy: userId,
          });
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update milestone" });
    }
  });

  app.delete("/api/milestones/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.user.claims.sub;

      // Fetch milestone to verify it exists
      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }

      // Check user has access to the milestone's project
      const project = await storage.getProject(milestone.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === 'client' && project.clientId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this milestone" });
      }

      const milestoneEvents = await storage.getCalendarEventsByType(milestone.projectId, "milestone");
      const linkedEvent = milestoneEvents.find(e => e.description === `milestone:${id}`);
      if (linkedEvent) {
        await storage.deleteCalendarEvent(linkedEvent.id);
      }

      await storage.deleteMilestone(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Sub-Milestones
  app.get("/api/milestones/:milestoneId/sub-milestones", isAuthenticated, async (req, res) => {
    const subs = await storage.getSubMilestones(Number(req.params.milestoneId));
    res.json(subs);
  });

  app.post("/api/milestones/:milestoneId/sub-milestones", isAuthenticated, async (req, res) => {
    const milestoneId = Number(req.params.milestoneId);
    const input = insertSubMilestoneSchema.parse({ ...req.body, milestoneId });
    const sub = await storage.createSubMilestone(input);
    res.status(201).json(sub);
  });

  app.patch("/api/sub-milestones/:id", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertSubMilestoneSchema.partial().parse(req.body);
      const updated = await storage.updateSubMilestone(Number(req.params.id), parsed);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update sub-milestone" });
    }
  });

  app.delete("/api/sub-milestones/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteSubMilestone(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete sub-milestone" });
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

  app.patch("/api/photos/:id/tag", isAuthenticated, async (req: any, res) => {
    try {
      const photoId = Number(req.params.id);
      const { planningBoardId } = req.body;
      await storage.tagPhoto(photoId, planningBoardId ?? null);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to tag photo" });
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

  // Board Snapshots
  app.get(api.boardSnapshots.list.path, isAuthenticated, async (req: any, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      const snapshots = await storage.getBoardSnapshots(boardId);
      res.json(snapshots);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to list snapshots" });
    }
  });

  app.post(api.boardSnapshots.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      const { name } = api.boardSnapshots.create.input.parse(req.body);
      const elements = await storage.getCanvasElements(boardId);
      const snapshot = await storage.createBoardSnapshot({
        boardId,
        name,
        canvasData: elements,
        createdBy: req.user.id,
      });
      res.status(201).json(snapshot);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create snapshot" });
    }
  });

  app.post(api.boardSnapshots.restore.path, isAuthenticated, async (req: any, res) => {
    try {
      const snapshotId = parseInt(req.params.id);
      const snapshot = await storage.getBoardSnapshot(snapshotId);
      if (!snapshot) return res.status(404).json({ message: "Snapshot not found" });
      
      const currentElements = await storage.getCanvasElements(snapshot.boardId);
      for (const el of currentElements) {
        await storage.deleteCanvasElement(el.id);
      }
      
      const snapshotElements = snapshot.canvasData as any[];
      if (snapshotElements.length > 0) {
        await storage.createCanvasElements(
          snapshotElements.map((el: any) => ({
            boardId: snapshot.boardId,
            type: el.type,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            zIndex: el.zIndex || 0,
            parentColumnId: el.parentColumnId || null,
            content: el.content,
            createdBy: el.createdBy,
          }))
        );
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Snapshot restore error:", err);
      res.status(500).json({ message: "Failed to restore snapshot" });
    }
  });

  app.delete(api.boardSnapshots.delete.path, isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteBoardSnapshot(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete snapshot" });
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

  // ── Color Tags ──
  const colorTagSchema = z.object({
    colorTagId: z.number().nullable(),
  });

  app.patch("/api/projects/:id/color-tag", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getProject(id);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      const parsed = colorTagSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
      const project = await storage.updateProject(id, { colorTagId: parsed.data.colorTagId });
      res.json(project);
    } catch (error) {
      console.error("Error updating project color tag:", error);
      res.status(500).json({ message: "Failed to update color tag" });
    }
  });

  app.patch("/api/planning-boards/:id/color-tag", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getPlanningBoard(id);
      if (!existing) return res.status(404).json({ message: "Planning board not found" });
      const parsed = colorTagSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
      const board = await storage.updatePlanningBoard(id, { colorTagId: parsed.data.colorTagId });
      res.json(board);
    } catch (error) {
      console.error("Error updating board color tag:", error);
      res.status(500).json({ message: "Failed to update color tag" });
    }
  });

  // ── Paint Colors ──
  app.get("/api/paint-colors", isAuthenticated, async (req, res) => {
    const { brand, colorFamily, search, popular } = req.query;
    const filters: { brand?: string; colorFamily?: string; search?: string; popular?: boolean } = {};
    if (typeof brand === "string") filters.brand = brand;
    if (typeof colorFamily === "string") filters.colorFamily = colorFamily;
    if (typeof search === "string" && search.trim()) filters.search = search.trim();
    if (popular === "true") filters.popular = true;
    const colors = await storage.getPaintColors(filters);
    res.json(colors);
  });

  app.get("/api/paint-colors/families", isAuthenticated, async (req, res) => {
    const brand = typeof req.query.brand === "string" ? req.query.brand : undefined;
    const families = await storage.getPaintColorFamilies(brand);
    res.json(families);
  });

  app.get("/api/paint-colors/:id", isAuthenticated, async (req, res) => {
    const color = await storage.getPaintColor(Number(req.params.id));
    if (!color) return res.status(404).json({ error: "Color not found" });
    res.json(color);
  });

  // ── Timesheets / Time Entries ──────────────────────────────

  app.get("/api/time-entries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      const entries = await storage.getTimeEntriesByUser(userId, startDate as string, endDate as string);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  app.get("/api/time-entries/period", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const entries = await storage.getTimeEntriesByPeriod(startDate as string, endDate as string);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching period entries:", error);
      res.status(500).json({ message: "Failed to fetch period entries" });
    }
  });

  app.post("/api/time-entries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = insertTimeEntrySchema.safeParse({ ...req.body, userId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }
      const entry = await storage.createTimeEntry(parsed.data);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating time entry:", error);
      res.status(500).json({ message: "Failed to create time entry" });
    }
  });

  app.post("/api/time-entries/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { entries: rawEntries } = req.body;
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
        return res.status(400).json({ message: "entries array is required" });
      }
      const parsed = rawEntries.map((e: any) => {
        const result = insertTimeEntrySchema.safeParse({ ...e, userId });
        if (!result.success) throw new Error("Invalid entry data");
        return result.data;
      });
      const entries = await storage.bulkCreateTimeEntries(parsed);
      res.status(201).json(entries);
    } catch (error) {
      console.error("Error bulk creating time entries:", error);
      res.status(500).json({ message: "Failed to create time entries" });
    }
  });

  app.patch("/api/time-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const dbUser = await authStorage.getUser(userId);
      const isAdmin = dbUser?.role === "admin";
      
      if (!isAdmin) {
        const userEntries = await storage.getTimeEntriesByUser(userId);
        const existing = userEntries.find(e => e.id === id);
        if (!existing) {
          return res.status(404).json({ message: "Time entry not found" });
        }
        if (existing.status !== "draft") {
          return res.status(403).json({ message: "Can only edit draft entries" });
        }
        const { status, userId: _, approvedBy, approvedAt, submittedAt, ...safeUpdates } = req.body;
        const updated = await storage.updateTimeEntry(id, safeUpdates);
        return res.json(updated);
      }
      
      const updated = await storage.updateTimeEntry(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating time entry:", error);
      res.status(500).json({ message: "Failed to update time entry" });
    }
  });

  app.delete("/api/time-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const dbUser = await authStorage.getUser(userId);
      const isAdmin = dbUser?.role === "admin";
      
      if (!isAdmin) {
        const userEntries = await storage.getTimeEntriesByUser(userId);
        const existing = userEntries.find(e => e.id === id);
        if (!existing) {
          return res.status(404).json({ message: "Time entry not found" });
        }
        if (existing.status !== "draft") {
          return res.status(403).json({ message: "Can only delete draft entries" });
        }
      }
      
      await storage.deleteTimeEntry(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      console.error("Error deleting time entry:", error);
      res.status(500).json({ message: "Failed to delete time entry" });
    }
  });

  app.post("/api/time-entries/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }
      const userEntries = await storage.getTimeEntriesByUser(userId);
      const userEntryIds = new Set(userEntries.filter(e => e.status === "draft").map(e => e.id));
      const validIds = ids.filter((id: number) => userEntryIds.has(id));
      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid draft entries found to submit" });
      }
      const now = new Date();
      const results: any[] = [];
      for (const id of validIds) {
        const updated = await storage.updateTimeEntry(id, { status: "submitted", submittedAt: now });
        results.push(updated);
      }
      res.json(results);
    } catch (error) {
      console.error("Error submitting time entries:", error);
      res.status(500).json({ message: "Failed to submit time entries" });
    }
  });

  app.post("/api/time-entries/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }
      const allEntries = await storage.getTimeEntriesByPeriod("2000-01-01", "2099-12-31");
      const submittedIds = new Set(allEntries.filter(e => e.status === "submitted").map(e => e.id));
      const validIds = ids.filter((id: number) => submittedIds.has(id));
      if (validIds.length === 0) {
        return res.status(400).json({ message: "No submitted entries found to approve" });
      }
      const approved = await storage.approveTimeEntries(validIds, userId);
      res.json(approved);
    } catch (error) {
      console.error("Error approving time entries:", error);
      res.status(500).json({ message: "Failed to approve time entries" });
    }
  });

  // ============ COST ESTIMATOR ROUTES ============

  // Cost Categories
  app.get("/api/cost-categories", isAuthenticated, async (_req, res) => {
    const categories = await storage.getCostCategories();
    res.json(categories);
  });

  app.post("/api/cost-categories", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertCostCategorySchema.parse(req.body);
    const created = await storage.createCostCategory(input);
    res.status(201).json(created);
  });

  app.patch("/api/cost-categories/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const id = parseInt(req.params.id);
    const input = insertCostCategorySchema.partial().parse(req.body);
    const updated = await storage.updateCostCategory(id, input);
    res.json(updated);
  });

  app.delete("/api/cost-categories/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    await storage.deleteCostCategory(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Market Rates
  app.get("/api/market-rates", isAuthenticated, async (req, res) => {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const activeOnly = req.query.active === "true";
    const rates = await storage.getMarketRates(categoryId, activeOnly);
    res.json(rates);
  });

  app.post("/api/market-rates", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertMarketRateSchema.parse(req.body);
    const created = await storage.createMarketRate(input);
    res.status(201).json(created);
  });

  app.patch("/api/market-rates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertMarketRateSchema.partial().parse(req.body);
    const updated = await storage.updateMarketRate(parseInt(req.params.id), input);
    res.json(updated);
  });

  // Project Estimates
  app.get("/api/projects/:projectId/estimates", isAuthenticated, async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const estimates = await storage.getProjectEstimates(projectId);
    res.json(estimates);
  });

  app.post("/api/projects/:projectId/estimates", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const projectId = parseInt(req.params.projectId);
    const input = insertProjectEstimateSchema.parse({ ...req.body, projectId, createdBy: userId });
    const created = await storage.createEstimate(input);
    res.status(201).json(created);
  });

  app.get("/api/estimates/:id", isAuthenticated, async (req, res) => {
    const estimate = await storage.getEstimate(parseInt(req.params.id));
    if (!estimate) return res.status(404).json({ message: "Estimate not found" });
    res.json(estimate);
  });

  app.patch("/api/estimates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const input = insertProjectEstimateSchema.partial().parse(req.body);
    const updated = await storage.updateEstimate(parseInt(req.params.id), input);
    res.json(updated);
  });

  app.delete("/api/estimates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    await storage.deleteEstimate(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Estimate Items
  app.get("/api/estimates/:id/items", isAuthenticated, async (req, res) => {
    const items = await storage.getEstimateItems(parseInt(req.params.id));
    res.json(items);
  });

  app.post("/api/estimates/:id/items", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const estimateId = parseInt(req.params.id);
    const input = insertEstimateItemSchema.parse({ ...req.body, estimateId });
    const created = await storage.createEstimateItem(input);

    // Check for pricing warnings against market rates
    if (input.categoryId && !input.isCustomRate) {
      const rates = await storage.getMarketRates(input.categoryId, true);
      if (rates.length > 0) {
        const latestRate = rates[0];
        const unitCost = parseFloat(input.unitCost);
        const low = parseFloat(latestRate.lowRate);
        const high = parseFloat(latestRate.highRate);
        const typical = parseFloat(latestRate.typicalRate);

        await storage.deleteWarningsByItem(created.id);

        if (unitCost < low * 0.8) {
          const pctDiff = (((low - unitCost) / low) * 100).toFixed(1);
          await storage.createEstimateWarning({
            estimateItemId: created.id,
            warningType: "too_low",
            message: `Unit cost $${unitCost.toFixed(2)} is ${pctDiff}% below market low of $${low.toFixed(2)}/${input.unitType}`,
            percentDiff: pctDiff,
          });
        } else if (unitCost > high * 1.2) {
          const pctDiff = (((unitCost - high) / high) * 100).toFixed(1);
          await storage.createEstimateWarning({
            estimateItemId: created.id,
            warningType: "too_high",
            message: `Unit cost $${unitCost.toFixed(2)} is ${pctDiff}% above market high of $${high.toFixed(2)}/${input.unitType}`,
            percentDiff: pctDiff,
          });
        }
      }
    }

    res.status(201).json(created);
  });

  app.patch("/api/estimate-items/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const id = parseInt(req.params.id);
    const input = insertEstimateItemSchema.partial().parse(req.body);
    const updated = await storage.updateEstimateItem(id, input);

    // Re-check warnings after update
    if (updated.categoryId) {
      const rates = await storage.getMarketRates(updated.categoryId, true);
      if (rates.length > 0) {
        const latestRate = rates[0];
        const unitCost = parseFloat(updated.unitCost);
        const low = parseFloat(latestRate.lowRate);
        const high = parseFloat(latestRate.highRate);

        await storage.deleteWarningsByItem(id);

        if (unitCost < low * 0.8) {
          const pctDiff = (((low - unitCost) / low) * 100).toFixed(1);
          await storage.createEstimateWarning({
            estimateItemId: id,
            warningType: "too_low",
            message: `Unit cost $${unitCost.toFixed(2)} is ${pctDiff}% below market low of $${low.toFixed(2)}`,
            percentDiff: pctDiff,
          });
        } else if (unitCost > high * 1.2) {
          const pctDiff = (((unitCost - high) / high) * 100).toFixed(1);
          await storage.createEstimateWarning({
            estimateItemId: id,
            warningType: "too_high",
            message: `Unit cost $${unitCost.toFixed(2)} is ${pctDiff}% above market high of $${high.toFixed(2)}`,
            percentDiff: pctDiff,
          });
        }
      }
    }

    res.json(updated);
  });

  app.delete("/api/estimate-items/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const id = parseInt(req.params.id);
    await storage.deleteWarningsByItem(id);
    await storage.deleteEstimateItem(id);
    res.json({ message: "Deleted" });
  });

  // Receipts
  app.get("/api/projects/:projectId/receipts", isAuthenticated, async (req, res) => {
    const receipts = await storage.getReceipts(parseInt(req.params.projectId));
    res.json(receipts);
  });

  app.post("/api/projects/:projectId/receipts", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const projectId = parseInt(req.params.projectId);
    const input = insertReceiptSchema.parse({ ...req.body, projectId, createdBy: userId });
    const created = await storage.createReceipt(input);
    res.status(201).json(created);
  });

  app.delete("/api/receipts/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    await storage.deleteReceipt(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Estimate Warnings
  app.get("/api/estimates/:id/warnings", isAuthenticated, async (req, res) => {
    const warnings = await storage.getWarningsByEstimate(parseInt(req.params.id));
    res.json(warnings);
  });

  app.post("/api/warnings/:id/ignore", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const updated = await storage.ignoreWarning(parseInt(req.params.id), userId);
    res.json(updated);
  });

  // Board Materials (import materials/products from planning boards into estimates)
  app.get("/api/projects/:id/board-materials", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
        return res.status(403).json({ message: "Admin or crew access required" });
      }
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (dbUser.role === "client" && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { db } = await import("./db");
      const { planningBoards, canvasElements } = await import("@shared/schema");
      const { eq, and, inArray } = await import("drizzle-orm");

      const boards = await db.select().from(planningBoards).where(eq(planningBoards.projectId, projectId));
      if (boards.length === 0) {
        return res.json([]);
      }
      const boardIds = boards.map(b => b.id);
      const elements = await db.select().from(canvasElements).where(
        and(
          inArray(canvasElements.boardId, boardIds),
          inArray(canvasElements.type, ["material", "product"])
        )
      );

      const grouped = boards
        .map(board => ({
          boardId: board.id,
          boardName: board.name,
          materials: elements
            .filter(el => el.boardId === board.id)
            .map(el => ({ id: el.id, type: el.type, content: el.content })),
        }))
        .filter(g => g.materials.length > 0);

      res.json(grouped);
    } catch (error) {
      console.error("Error fetching board materials:", error);
      res.status(500).json({ message: "Failed to fetch board materials" });
    }
  });

  // AI Scope Analyzer
  app.post("/api/estimates/:estimateId/ai-analyze", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }

    const { description } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "Project description is required" });
    }

    const estimateId = parseInt(req.params.estimateId as string);
    const estimate = await storage.getEstimate(estimateId);
    if (!estimate) {
      return res.status(404).json({ message: "Estimate not found" });
    }

    const categories = await storage.getCostCategories();
    const allRates = await storage.getAllMarketRates();
    const activeRates = allRates.filter(r => r.isActive);

    const categoryInfo = categories.map(cat => {
      const rate = activeRates.find(r => r.categoryId === cat.id);
      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        unitType: cat.defaultUnitType,
        lowRate: rate ? rate.lowRate : null,
        typicalRate: rate ? rate.typicalRate : null,
        highRate: rate ? rate.highRate : null,
      };
    });

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const systemPrompt = `You are an expert construction estimator specializing in high-end Muskoka, Ontario cottage renovations. 
Given a project description, analyze the scope and estimate square footage or unit quantities for each relevant trade category.

Available categories with current market rates (CAD):
${categoryInfo.map(c => `- ${c.name} (ID: ${c.id}, Unit: ${c.unitType === "sq_ft" ? "per sq ft" : "per unit"}${c.typicalRate ? `, Typical: $${c.typicalRate}` : ""}): ${c.description}`).join("\n")}

Rules:
- Only include categories that are relevant to the described project scope
- For sq_ft categories, estimate the square footage that would need that trade work
- For unit-based categories (Windows & Doors, Cabinetry, Septic & Well), estimate the number of units
- Use the typical market rate for unit cost unless the description suggests premium or budget finishes
- If premium/luxury is mentioned, use a rate between typical and high
- If budget-conscious is mentioned, use a rate between low and typical  
- Provide a brief note explaining your quantity estimate for each line
- Be realistic for Muskoka cottage renovation context

Respond with valid JSON only, no markdown. Format:
{
  "items": [
    {
      "categoryId": <number>,
      "categoryName": "<string>",
      "unitType": "sq_ft" or "board",
      "quantity": "<string number>",
      "unitCost": "<string number>",
      "materialCost": "<string number - estimate 30-40% of line total for material>",
      "notes": "<brief explanation of quantity estimate>"
    }
  ],
  "summary": "<1-2 sentence summary of scope>"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      const parsed = JSON.parse(content);

      if (!parsed.items || !Array.isArray(parsed.items)) {
        return res.status(422).json({ message: "AI returned invalid format" });
      }

      const validItems = parsed.items
        .filter((item: any) => item.categoryId && item.quantity && item.unitCost)
        .map((item: any) => ({
          categoryId: Number(item.categoryId),
          categoryName: String(item.categoryName || ""),
          unitType: item.unitType === "board" ? "board" : "sq_ft",
          quantity: String(parseFloat(item.quantity) || 0),
          unitCost: String(parseFloat(item.unitCost) || 0),
          materialCost: String(parseFloat(item.materialCost) || 0),
          notes: item.notes ? String(item.notes) : null,
        }));

      res.json({ items: validItems, summary: String(parsed.summary || "") });
    } catch (error: any) {
      console.error("AI analysis error:", error);
      res.status(500).json({ message: "Failed to analyze project scope" });
    }
  });

  // Crew Rates
  app.get("/api/crew-rates", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }
    const rates = await storage.getCrewRates();
    res.json(rates);
  });

  app.post("/api/crew-rates", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertCrewRateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const created = await storage.createCrewRate(parsed.data);
    res.json(created);
  });

  app.patch("/api/crew-rates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertCrewRateSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const updated = await storage.updateCrewRate(parseInt(req.params.id), parsed.data);
    res.json(updated);
  });

  app.delete("/api/crew-rates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    await storage.deleteCrewRate(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Subcontractors
  app.get("/api/subcontractors", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const subs = await storage.getSubcontractors(categoryId);
    res.json(subs);
  });

  app.post("/api/subcontractors", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertSubcontractorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const created = await storage.createSubcontractor(parsed.data);
    res.json(created);
  });

  app.patch("/api/subcontractors/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertSubcontractorSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const updated = await storage.updateSubcontractor(parseInt(req.params.id), parsed.data);
    res.json(updated);
  });

  app.delete("/api/subcontractors/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    await storage.deleteSubcontractor(parseInt(req.params.id));
    res.json({ success: true });
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

  // Seed Cost Categories & Market Rates
  const categories = await storage.getCostCategories();
  if (categories.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    
    const cats = [
      { name: "Demolition & Site Prep", description: "Tear-out, debris removal, site grading", defaultUnitType: "sq_ft", sortOrder: 1 },
      { name: "Foundation", description: "Footings, slabs, underpinning, waterproofing", defaultUnitType: "sq_ft", sortOrder: 2 },
      { name: "Framing", description: "Structural framing, beams, trusses", defaultUnitType: "sq_ft", sortOrder: 3 },
      { name: "Roofing", description: "Shingles, metal roofing, underlayment, flashing", defaultUnitType: "sq_ft", sortOrder: 4 },
      { name: "Windows & Doors", description: "Premium windows, exterior doors, patio doors", defaultUnitType: "board", sortOrder: 5 },
      { name: "Insulation", description: "Spray foam, batt, rigid board insulation", defaultUnitType: "sq_ft", sortOrder: 6 },
      { name: "Electrical", description: "Panel upgrades, wiring, fixtures, smart home", defaultUnitType: "sq_ft", sortOrder: 7 },
      { name: "Plumbing", description: "Rough-in, fixtures, water heaters, wells", defaultUnitType: "sq_ft", sortOrder: 8 },
      { name: "HVAC", description: "Furnaces, heat pumps, ductwork, mini-splits", defaultUnitType: "sq_ft", sortOrder: 9 },
      { name: "Drywall & Taping", description: "Hanging, taping, finishing, textures", defaultUnitType: "sq_ft", sortOrder: 10 },
      { name: "Interior Trim & Millwork", description: "Crown moulding, baseboards, custom built-ins", defaultUnitType: "sq_ft", sortOrder: 11 },
      { name: "Cabinetry", description: "Kitchen, bathroom, laundry cabinets", defaultUnitType: "board", sortOrder: 12 },
      { name: "Countertops", description: "Granite, quartz, marble, butcher block", defaultUnitType: "sq_ft", sortOrder: 13 },
      { name: "Flooring", description: "Hardwood, tile, luxury vinyl, heated floors", defaultUnitType: "sq_ft", sortOrder: 14 },
      { name: "Painting & Finishes", description: "Interior/exterior paint, stains, wallpaper", defaultUnitType: "sq_ft", sortOrder: 15 },
      { name: "Tile & Stone", description: "Backsplash, bathroom tile, natural stone", defaultUnitType: "sq_ft", sortOrder: 16 },
      { name: "Exterior Cladding", description: "Siding, stone veneer, board and batten", defaultUnitType: "sq_ft", sortOrder: 17 },
      { name: "Decks & Docks", description: "Composite decking, docks, railings, pergolas", defaultUnitType: "sq_ft", sortOrder: 18 },
      { name: "Landscaping", description: "Grading, planting, retaining walls, pathways", defaultUnitType: "sq_ft", sortOrder: 19 },
      { name: "Septic & Well", description: "Septic systems, well drilling, water treatment", defaultUnitType: "board", sortOrder: 20 },
    ];

    for (const cat of cats) {
      const created = await storage.createCostCategory(cat);
      
      // Seed market rates - high-end Muskoka pricing (CAD per sq_ft or per unit)
      const rateMap: Record<string, { low: string; typical: string; high: string }> = {
        "Demolition & Site Prep": { low: "3.50", typical: "5.00", high: "8.00" },
        "Foundation": { low: "25.00", typical: "35.00", high: "55.00" },
        "Framing": { low: "18.00", typical: "28.00", high: "42.00" },
        "Roofing": { low: "8.00", typical: "14.00", high: "25.00" },
        "Windows & Doors": { low: "800.00", typical: "1500.00", high: "3500.00" },
        "Insulation": { low: "4.50", typical: "7.00", high: "12.00" },
        "Electrical": { low: "12.00", typical: "18.00", high: "30.00" },
        "Plumbing": { low: "14.00", typical: "22.00", high: "35.00" },
        "HVAC": { low: "10.00", typical: "16.00", high: "28.00" },
        "Drywall & Taping": { low: "4.00", typical: "6.50", high: "10.00" },
        "Interior Trim & Millwork": { low: "8.00", typical: "15.00", high: "30.00" },
        "Cabinetry": { low: "5000.00", typical: "12000.00", high: "35000.00" },
        "Countertops": { low: "65.00", typical: "120.00", high: "250.00" },
        "Flooring": { low: "8.00", typical: "16.00", high: "35.00" },
        "Painting & Finishes": { low: "3.00", typical: "5.50", high: "10.00" },
        "Tile & Stone": { low: "15.00", typical: "28.00", high: "55.00" },
        "Exterior Cladding": { low: "12.00", typical: "22.00", high: "45.00" },
        "Decks & Docks": { low: "25.00", typical: "45.00", high: "85.00" },
        "Landscaping": { low: "8.00", typical: "18.00", high: "40.00" },
        "Septic & Well": { low: "8000.00", typical: "15000.00", high: "30000.00" },
      };

      const rates = rateMap[cat.name];
      if (rates) {
        await storage.createMarketRate({
          categoryId: created.id,
          unitType: cat.defaultUnitType,
          lowRate: rates.low,
          typicalRate: rates.typical,
          highRate: rates.high,
          effectiveDate: today,
          isActive: true,
          notes: "Baseline high-end Muskoka renovation rates",
        });
      }
    }
  }

  // Seed Crew Rates
  const existingCrewRates = await storage.getCrewRates();
  if (existingCrewRates.length === 0) {
    const crewSeeds = [
      { name: "Lead Carpenter", role: "Lead Carpenter", payRate: "45.00", billableRate: "85.00", isActive: true, notes: "Journeyman rate, Muskoka region" },
      { name: "Apprentice Carpenter", role: "Apprentice Carpenter", payRate: "28.00", billableRate: "55.00", isActive: true, notes: "2nd/3rd year apprentice" },
      { name: "General Labourer", role: "Labourer", payRate: "22.00", billableRate: "45.00", isActive: true, notes: "Site cleanup, material handling" },
      { name: "Project Foreman", role: "Foreman", payRate: "55.00", billableRate: "100.00", isActive: true, notes: "On-site project oversight" },
      { name: "Finish Carpenter", role: "Finish Carpenter", payRate: "50.00", billableRate: "95.00", isActive: true, notes: "Trim, millwork, cabinetry install" },
      { name: "Painter", role: "Painter", payRate: "32.00", billableRate: "60.00", isActive: true, notes: "Interior/exterior finishing" },
    ];
    for (const crew of crewSeeds) {
      await storage.createCrewRate(crew);
    }
  }

  // Seed Subcontractors with realistic Muskoka trades
  const existingSubs = await storage.getSubcontractors();
  if (existingSubs.length === 0) {
    const allCats = await storage.getCostCategories();
    const catMap = Object.fromEntries(allCats.map(c => [c.name, c.id]));

    const subSeeds = [
      { businessName: "Muskoka Plumbing & Heating", contactName: "Dave Morrison", phone: "(705) 645-8822", email: "dave@muskokaplumbing.ca", categoryId: catMap["Plumbing"], trade: "Plumbing", hourlyRate: "95.00", dailyRate: "760.00", unitType: "hour", isPreferred: true, isActive: true, address: "Bracebridge, ON", notes: "Licensed master plumber, 20+ yrs Muskoka experience. Handles wells and septic too." },
      { businessName: "Cottage Country Electric", contactName: "Mike Sullivan", phone: "(705) 789-3344", email: "mike@cottagecountryelectric.ca", categoryId: catMap["Electrical"], trade: "Electrical", hourlyRate: "90.00", dailyRate: "720.00", unitType: "hour", isPreferred: true, isActive: true, address: "Gravenhurst, ON", notes: "ESA licensed, smart home specialist. Panel upgrades, generator hookups." },
      { businessName: "Northern HVAC Solutions", contactName: "Sarah Chen", phone: "(705) 687-5500", email: "info@northernhvac.ca", categoryId: catMap["HVAC"], trade: "HVAC", hourlyRate: "100.00", dailyRate: "800.00", unitType: "hour", isPreferred: true, isActive: true, address: "Huntsville, ON", notes: "Heat pumps, in-floor radiant, mini-splits. TSSA certified." },
      { businessName: "Lakeland Roofing Co.", contactName: "Tom Baker", phone: "(705) 645-1199", email: "tom@lakelandroofing.ca", categoryId: catMap["Roofing"], trade: "Roofing", hourlyRate: null, dailyRate: null, unitRate: "14.00", unitType: "sq_ft", isPreferred: false, isActive: true, address: "Bracebridge, ON", notes: "Metal and shingle roofing. Prices per sq ft installed." },
      { businessName: "Georgian Bay Drywall", contactName: "Pete Lawson", phone: "(705) 746-2288", email: "pete@gbdrywall.ca", categoryId: catMap["Drywall & Taping"], trade: "Drywall", hourlyRate: "65.00", dailyRate: "520.00", unitType: "hour", isPreferred: false, isActive: true, address: "Parry Sound, ON", notes: "Hanging, taping, finishing. Level 5 finish available." },
      { businessName: "Muskoka Granite & Stone", contactName: "Lisa Park", phone: "(705) 645-7733", email: "lisa@muskokagranite.ca", categoryId: catMap["Countertops"], trade: "Countertops", hourlyRate: null, dailyRate: null, unitRate: "120.00", unitType: "sq_ft", isPreferred: true, isActive: true, address: "Bracebridge, ON", notes: "Fabrication & install. Granite, quartz, marble. Template to install 2-3 weeks." },
      { businessName: "Kawartha Tile & Bath", contactName: "Ryan Hughes", phone: "(705) 324-5566", email: "ryan@kawarthatile.ca", categoryId: catMap["Tile & Stone"], trade: "Tile", hourlyRate: "75.00", dailyRate: "600.00", unitType: "hour", isPreferred: false, isActive: true, address: "Lindsay, ON", notes: "Custom tile, heated floors, shower systems. Travels to Muskoka." },
      { businessName: "Shield Septic Services", contactName: "Brian Ward", phone: "(705) 385-2200", email: "brian@shieldseptic.ca", categoryId: catMap["Septic & Well"], trade: "Septic & Well", hourlyRate: null, dailyRate: null, unitRate: "15000.00", unitType: "unit", isPreferred: true, isActive: true, address: "Port Carling, ON", notes: "Full septic install, well drilling, water treatment systems." },
      { businessName: "Dock Masters Muskoka", contactName: "Jeff Collins", phone: "(705) 765-3399", email: "jeff@dockmasters.ca", categoryId: catMap["Decks & Docks"], trade: "Docks & Decks", hourlyRate: null, dailyRate: null, unitRate: "45.00", unitType: "sq_ft", isPreferred: true, isActive: true, address: "Port Carling, ON", notes: "Floating docks, permanent docks, composite decking. Spring install booking required." },
      { businessName: "Muskoka Landscapes", contactName: "Anna Reid", phone: "(705) 644-8800", email: "anna@muskokalandscapes.ca", categoryId: catMap["Landscaping"], trade: "Landscaping", hourlyRate: "70.00", dailyRate: "560.00", unitType: "hour", isPreferred: false, isActive: true, address: "Huntsville, ON", notes: "Retaining walls, pathways, planting. Bobcat and excavator available." },
    ];
    for (const sub of subSeeds) {
      await storage.createSubcontractor(sub);
    }
  }
}
