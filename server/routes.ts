import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

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

const upload = multer({
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Serve uploaded files
  const express = await import("express");
  app.use("/uploads", express.default.static(uploadDir));

  // Image upload endpoint
  app.post("/api/upload", isAuthenticated, (req: any, res) => {
    upload.single("image")(req, res, (err: any) => {
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

  app.get(api.projects.get.path, isAuthenticated, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: 'Project not found' });
    
    // Basic access control could go here
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
      const project = await storage.createProject({ ...input, clientId: userId });
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

  app.post(api.tasks.create.path, isAuthenticated, async (req, res) => {
    const input = api.tasks.create.input.parse(req.body);
    const task = await storage.createTask({ ...input, projectId: Number(req.params.projectId) });
    res.status(201).json(task);
  });

  app.put(api.tasks.update.path, isAuthenticated, async (req, res) => {
    const task = await storage.updateTask(Number(req.params.id), req.body);
    res.json(task);
  });

  // Milestones
  app.get(api.milestones.list.path, isAuthenticated, async (req, res) => {
    const milestones = await storage.getMilestones(Number(req.params.projectId));
    res.json(milestones);
  });

  app.post(api.milestones.create.path, isAuthenticated, async (req, res) => {
    const input = api.milestones.create.input.parse(req.body);
    const milestone = await storage.createMilestone({ ...input, projectId: Number(req.params.projectId) });
    res.status(201).json(milestone);
  });

  // Photos
  app.get(api.photos.list.path, isAuthenticated, async (req, res) => {
    const photos = await storage.getPhotos(Number(req.params.projectId));
    res.json(photos);
  });

  app.post(api.photos.create.path, isAuthenticated, async (req, res) => {
    const input = api.photos.create.input.parse(req.body);
    const photo = await storage.createPhoto({ ...input, projectId: Number(req.params.projectId) });
    res.status(201).json(photo);
  });

  // Documents
  app.get(api.documents.list.path, isAuthenticated, async (req, res) => {
    const docs = await storage.getDocuments(Number(req.params.projectId));
    res.json(docs);
  });

  app.post(api.documents.create.path, isAuthenticated, async (req, res) => {
    const input = api.documents.create.input.parse(req.body);
    const doc = await storage.createDocument({ ...input, projectId: Number(req.params.projectId) });
    res.status(201).json(doc);
  });

  // Messages
  app.get(api.messages.list.path, isAuthenticated, async (req, res) => {
    const messages = await storage.getMessages(Number(req.params.projectId));
    res.json(messages);
  });

  app.post(api.messages.create.path, isAuthenticated, async (req, res) => {
    const input = api.messages.create.input.parse(req.body);
    const user = req.user as any;
    const message = await storage.createMessage({ 
      ...input, 
      projectId: Number(req.params.projectId),
      senderId: user.claims.sub 
    });
    res.status(201).json(message);
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

  // Calendar Events
  app.get(api.calendar.list.path, isAuthenticated, async (req, res) => {
    const events = await storage.getCalendarEvents(Number(req.params.projectId));
    res.json(events);
  });

  app.post(api.calendar.create.path, isAuthenticated, async (req: any, res) => {
    const input = api.calendar.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const event = await storage.createCalendarEvent({
      ...input,
      projectId: Number(req.params.projectId),
      createdBy: userId,
    });
    res.status(201).json(event);
  });

  app.put("/api/calendar/:id", isAuthenticated, async (req, res) => {
    const input = api.calendar.update.input.parse(req.body);
    const event = await storage.updateCalendarEvent(Number(req.params.id), input);
    if (!event) return res.status(404).json({ message: "Calendar event not found" });
    res.json(event);
  });

  app.delete("/api/calendar/:id", isAuthenticated, async (req, res) => {
    await storage.deleteCalendarEvent(Number(req.params.id));
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
