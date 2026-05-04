import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertSubMilestoneSchema, insertSectionSchema, insertTimeEntrySchema, insertCostCategorySchema, insertMarketRateSchema, insertProjectEstimateSchema, insertEstimateItemSchema, insertReceiptSchema, insertCrewRateSchema, insertSubcontractorSchema, insertSupplierSchema, insertSupplierPriceSchema, insertRegionalModifierSchema, insertTableRedesignPlanSchema, insertTableRedesignMaterialSchema, regionalModifiers, estimateItems, projectEstimates } from "@shared/schema";
import { db } from "./db";
import { eq as eqSql } from "drizzle-orm";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { authStorage } from "./replit_integrations/auth/storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
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
  notifyBoardLinked,
} from "./sms";
import { notifyTeamEmail } from "./email";
import { heartbeat, getOnlineUsers, setVisibility, getVisibility } from "./presence";
import { broadcastProjectChange } from "./websocket";
import { getTemplateCatalogue, getTemplateCanvasData } from "./board-templates";
import type { Request, Response, NextFunction, RequestHandler } from "express";

function asyncHandler(fn: (req: any, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Upload directory. Override with UPLOAD_DIR env var to point at a persistent
// disk on Railway (e.g. /data/uploads when a volume is mounted there). Falls
// back to a local ./uploads folder for dev. NOTE: on Railway without a
// volume, files in this directory are wiped on every redeploy.
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");
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
  // Real health check: pings the database with a cheap `SELECT 1`.
  // Registered FIRST so it can never be shadowed by the SPA catch-all in
  // production. Returns 200 + JSON when the DB round-trips, 503 + JSON when
  // it does not. Railway's health probe relies on this returning 5xx (not
  // 200 SPA HTML) when the database is unreachable so a bad pod gets cycled
  // instead of silently serving the marketing page from a broken backend.
  app.get("/api/health", async (_req, res) => {
    const startedAt = Date.now();
    try {
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      res.status(200).json({
        status: "ok",
        database: "ok",
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
      });
    } catch (err: any) {
      res.status(503).json({
        status: "error",
        database: "unreachable",
        error: err?.message || "unknown",
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    }
  });

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

  // Receipt upload — accepts images and PDFs
  app.post("/api/receipts/upload", isAuthenticated, (req: any, res) => {
    docUpload.single("file")(req, res, (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 25MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

  // Change a user's role. Admins only — previously this endpoint was open to
  // any authenticated caller and updated *the caller's own* role, which let a
  // logged-in client promote themselves to admin. Now: requires the caller to
  // already be an admin, requires an explicit target userId, and forbids the
  // caller from changing their own role here (use a second admin if a swap
  // is needed). This is the only role-mutation endpoint in the API.
  app.patch("/api/auth/role", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can change roles" });
      }
      const { userId, role } = req.body || {};
      if (typeof userId !== "string" || !userId) {
        return res.status(400).json({ message: "userId is required" });
      }
      if (!["client", "crew", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      if (userId === requesterId) {
        return res.status(400).json({ message: "You cannot change your own role" });
      }
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
    lastName: z.string().max(100).nullable().optional(),
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

  // Self-service password change. Requires the user to provide their current
  // password (verified against the bcrypt hash). Rejects accounts that have no
  // local password set (e.g. SSO-only) so we never silently overwrite.
  app.post("/api/auth/change-password", isAuthenticated, async (req: any, res) => {
    try {
      const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required" });
      }
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      if (newPassword === currentPassword) {
        return res.status(400).json({ message: "New password must be different from current password" });
      }
      const userId = req.user.claims.sub;
      const { db } = await import("./db");
      const { users } = await import("@shared/models/auth");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row) return res.status(404).json({ message: "User not found" });
      if (!row.passwordHash) {
        return res.status(400).json({ message: "This account has no password set. Contact an admin to reset it." });
      }
      const bcryptMod = await import("bcrypt");
      const ok = await bcryptMod.default.compare(currentPassword, row.passwordHash);
      if (!ok) return res.status(401).json({ message: "Current password is incorrect" });
      const newHash = await bcryptMod.default.hash(newPassword, 12);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
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
  app.get(api.projects.list.path, isAuthenticated, asyncHandler(async (req, res) => {
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
  }));

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
      // Project creation is an admin operation. Crew were previously able to
      // create projects via the Timesheets inline "Create one" escape hatch —
      // a labourer spawning projects is unexpected and confusing for admin.
      // Lock both UI (Timesheets.tsx) and API to admin only. Clients are also
      // denied (separate message kept for clarity).
      if (dbUser?.role === "client") {
        return res.status(403).json({ message: "Clients cannot create projects" });
      }
      if (dbUser?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can create projects" });
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

  app.put(api.projects.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const existing = await storage.getProject(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Project not found" });
    const input = api.projects.update.input.parse(req.body);
    const { budgetVisibleToClient: _stripped, ...safeInput } = input;
    const project = await storage.updateProject(Number(req.params.id), safeInput);
    res.json(project);
    broadcastProjectChange(Number(req.params.id), ["project"], "updated", undefined, req.user.claims.sub);
  }));

  app.delete("/api/projects/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    await storage.deleteProject(Number(req.params.id));
    res.json({ success: true });
    broadcastProjectChange(Number(req.params.id), ["project"], "deleted", undefined, req.user.claims.sub);
  }));

  // Recent Project Views
  app.get("/api/recent-projects", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const recent = await storage.getRecentProjectViews(userId);
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client") {
      const clientProjects = await storage.getProjectsByClient(userId);
      const accessibleIds = new Set(clientProjects.map((p) => p.id));
      return res.json(recent.filter((r) => accessibleIds.has(r.id)));
    }
    res.json(recent);
  }));

  app.post("/api/recent-projects", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    // boardId is optional — the client passes it when the user actually opens
    // a planning board so "Jump back in" can land them back inside that board.
    // A bare project-landing visit posts without boardId and we keep the
    // previous lastBoardId untouched.
    const parseResult = z.object({
      projectId: z.number().int().positive(),
      boardId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parseResult.success) return res.status(400).json({ message: "Invalid request body", errors: parseResult.error.errors });
    const { projectId, boardId } = parseResult.data;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client" && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await storage.trackRecentProjectView(userId, projectId, boardId);
    res.json({ success: true });
  }));

  // Client Invites
  // NOTE: phone is genuinely optional — the invite UI labels the field
  // "Phone Number (optional)". Previously the schema required min(7) which
  // 400'd whenever an admin left the field blank, contradicting the label.
  // We accept empty strings (treating them as missing) and otherwise require
  // at least 7 characters so we don't store obviously-bad values.
  const inviteClientSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().max(255),
    phone: z
      .string()
      .max(30)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
      .refine((v) => v === undefined || v.length >= 7, {
        message: "Phone must be at least 7 characters",
      }),
  });

  app.post("/api/projects/:id/invite-client", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can invite clients" });
      }
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const parsed = inviteClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      let userId: string | null = null;
      const existingUsers = await authStorage.getUsers();
      const existingUser = existingUsers.find(u => u.email?.toLowerCase() === parsed.data.email.toLowerCase());
      if (existingUser) {
        userId = existingUser.id;
      } else {
        const preId = `pre-${randomUUID().slice(0, 12)}`;
        const newUser = await authStorage.upsertUser({
          id: preId,
          email: parsed.data.email,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          role: "client",
        });
        userId = newUser.id;
      }
      if (!project.clientId && userId) {
        await storage.updateProject(projectId, { clientId: userId });
      }

      const invite = await storage.createClientInvite({
        token,
        projectId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        userId,
        createdBy: requesterId,
        expiresAt,
        status: "pending",
      });

      let emailSent = false;
      let smsSent = false;
      try {
        const { sendClientInviteEmail } = await import("./email");
        emailSent = await sendClientInviteEmail(parsed.data.email, parsed.data.firstName, project.name, token);
      } catch (e) {
        console.error("Error sending invite email:", e);
      }
      if (parsed.data.phone) {
        try {
          const { sendClientInviteSms } = await import("./sms");
          smsSent = await sendClientInviteSms(parsed.data.phone, parsed.data.firstName, project.name, token);
        } catch (e) {
          console.error("Error sending invite SMS:", e);
        }
      }

      res.status(201).json({ ...invite, emailSent, smsSent });
    } catch (error: any) {
      console.error("Error creating client invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.post("/api/projects/:id/invites/:inviteId/resend", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can resend invites" });
      }

      const projectId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const invite = await storage.getClientInvitesByProject(projectId).then(invites => invites.find(inv => inv.id === inviteId));
      if (!invite || invite.projectId !== projectId) {
        return res.status(404).json({ message: "Invite not found" });
      }

      let emailSent = false;
      let smsSent = false;
      try {
        const { sendClientInviteEmail } = await import("./email");
        emailSent = await sendClientInviteEmail(invite.email, invite.firstName, project.name, invite.token);
      } catch (e) {
        console.error("Error resending invite email:", e);
      }
      if (invite.phone) {
        try {
          const { sendClientInviteSms } = await import("./sms");
          smsSent = await sendClientInviteSms(invite.phone, invite.firstName, project.name, invite.token);
        } catch (e) {
          console.error("Error resending invite SMS:", e);
        }
      }
      res.json({ success: true, emailSent, smsSent });
    } catch (error: any) {
      console.error("Error resending client invite:", error);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  app.delete("/api/projects/:id/invites/:inviteId", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete invites" });
      }

      const projectId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const invite = await storage.getClientInvitesByProject(projectId).then(invites => invites.find(inv => inv.id === inviteId));
      if (!invite || invite.projectId !== projectId) {
        return res.status(404).json({ message: "Invite not found" });
      }

      await storage.deleteClientInvite(inviteId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting client invite:", error);
      res.status(500).json({ message: "Failed to delete invite" });
    }
  });

  app.get("/api/invites/:token/validate", async (req: any, res) => {
    try {
      const invite = await storage.getClientInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ message: "Invite not found" });

      const project = await storage.getProject(invite.projectId);
      const isExpired = new Date() > invite.expiresAt;
      const isAccepted = invite.status === "accepted";

      res.json({
        valid: !isExpired && !isAccepted,
        expired: isExpired,
        accepted: isAccepted,
        projectName: project?.name || "Unknown Project",
        firstName: invite.firstName,
        lastName: invite.lastName,
        email: invite.email,
      });
    } catch (error) {
      console.error("Error validating invite:", error);
      res.status(500).json({ message: "Failed to validate invite" });
    }
  });

  // Client invite acceptance.
  // - If the user is NOT logged in: they must provide { password } to set
  //   their password. We then auto-login them.
  // - If the user IS already logged in (rare; happens if they previously
  //   accepted another invite), we just link this project to their account.
  app.post("/api/invites/:token/accept", async (req: any, res) => {
    try {
      const invite = await storage.getClientInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ message: "Invite not found" });

      if (new Date() > invite.expiresAt) {
        return res.status(410).json({ message: "This invite has expired" });
      }
      if (invite.status === "accepted") {
        return res.status(409).json({ message: "This invite has already been accepted" });
      }

      const inviteEmail = invite.email?.toLowerCase().trim();
      if (!inviteEmail) return res.status(400).json({ message: "Invite has no email" });

      // Branch: not logged in → set password and link account.
      if (!req.user) {
        const password = typeof req.body?.password === "string" ? req.body.password : null;
        if (!password || password.length < 8) {
          return res.status(400).json({ message: "Password (min 8 characters) is required" });
        }
        const bcryptMod = await import("bcrypt");
        const hash = await bcryptMod.default.hash(password, 12);

        // Use the user record that the invite already pre-created (or find by email).
        let user = invite.userId ? await authStorage.getUser(invite.userId) : undefined;
        if (!user) {
          const all = await authStorage.getUsers();
          user = all.find((u) => u.email?.toLowerCase().trim() === inviteEmail);
        }
        if (!user) {
          // Create a new client user.
          user = await authStorage.upsertUser({
            email: invite.email,
            firstName: invite.firstName,
            lastName: invite.lastName,
            phone: invite.phone ?? null,
            role: "client",
          });
        }

        // Set the password and ensure role/profile.
        const { db: _db } = await import("./db");
        const { users: _users } = await import("@shared/models/auth");
        const { eq: _eq } = await import("drizzle-orm");
        await _db
          .update(_users)
          .set({
            passwordHash: hash,
            role: "client",
            firstName: invite.firstName,
            lastName: invite.lastName,
            phone: invite.phone ?? null,
            updatedAt: new Date(),
          })
          .where(_eq(_users.id, user.id));

        await storage.updateClientInvite(invite.id, {
          status: "accepted",
          acceptedAt: new Date(),
          userId: user.id,
        });
        await storage.updateProject(invite.projectId, { clientId: user.id });

        // Auto-login.
        return req.logIn(user, (err: any) => {
          if (err) {
            console.error("Auto-login after invite accept failed:", err);
            return res.status(500).json({ message: "Account created. Please log in." });
          }
          broadcastProjectChange(invite.projectId, ["invites", "project"], "invite_accepted", undefined, user!.id);
          res.json({ success: true, projectId: invite.projectId });
        });
      }

      // Branch: already logged in — must match invite email.
      const userId = req.user.claims.sub;
      const currentUser = await authStorage.getUser(userId);
      const userEmail = currentUser?.email?.toLowerCase().trim();

      if (!userEmail || userEmail !== inviteEmail) {
        return res.status(403).json({ message: "This invite was sent to a different email address. Please log in with the correct account." });
      }

      await storage.updateClientInvite(invite.id, {
        status: "accepted",
        acceptedAt: new Date(),
        userId,
      });

      const project = await storage.getProject(invite.projectId);
      if (project) {
        await storage.updateProject(invite.projectId, { clientId: userId });
      }

      const currentUserData = await authStorage.getUser(userId);
      const profileUpdates: { firstName?: string; lastName?: string; phone?: string } = {};
      if (!currentUserData?.firstName) profileUpdates.firstName = invite.firstName;
      if (!currentUserData?.lastName) profileUpdates.lastName = invite.lastName;
      if (!currentUserData?.phone && invite.phone) profileUpdates.phone = invite.phone;
      if (Object.keys(profileUpdates).length > 0) {
        await authStorage.updateUserProfile(userId, profileUpdates);
      }

      broadcastProjectChange(invite.projectId, ["invites", "project"], "invite_accepted", undefined, userId);

      res.json({ success: true, projectId: invite.projectId });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  const onboardingSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().max(30).nullable().optional(),
    email: z.string().email().optional(),
    smsNotifications: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
  });

  app.post("/api/auth/complete-onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = onboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }

      const updates: Record<string, unknown> = {
        onboardingCompleted: new Date(),
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      };
      if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
      if (parsed.data.email !== undefined) updates.email = parsed.data.email;
      if (parsed.data.smsNotifications !== undefined) updates.smsNotifications = parsed.data.smsNotifications;
      if (parsed.data.emailNotifications !== undefined) updates.emailNotifications = parsed.data.emailNotifications;

      const user = await authStorage.updateUserProfile(userId, updates as Parameters<typeof authStorage.updateUserProfile>[1]);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  app.post("/api/auth/reconcile-invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await authStorage.getUser(userId);
      if (!currentUser?.email) return res.json({ reconciled: 0 });

      const pendingInvites = await storage.getPendingInvitesByEmail(currentUser.email);

      let reconciled = 0;
      let firstProjectId: number | null = null;
      for (const invite of pendingInvites) {
        if (new Date() > invite.expiresAt) continue;

        await storage.updateClientInvite(invite.id, {
          status: "accepted",
          acceptedAt: new Date(),
          userId,
        });

        const project = await storage.getProject(invite.projectId);
        if (project) {
          await storage.updateProject(invite.projectId, { clientId: userId });
        }

        if (!currentUser.firstName && invite.firstName) {
          await authStorage.updateUserProfile(userId, { firstName: invite.firstName, lastName: invite.lastName });
        }

        broadcastProjectChange(invite.projectId, ["invites", "project"], "invite_accepted", undefined, userId);

        if (!firstProjectId) firstProjectId = invite.projectId;
        reconciled++;
      }

      let linkedProjectId = firstProjectId;
      if (!linkedProjectId && !currentUser.onboardingCompleted) {
        const allInvites = await storage.getClientInvitesByEmail(currentUser.email);
        const accepted = allInvites.find(i => i.status === "accepted");
        if (accepted) linkedProjectId = accepted.projectId;
      }

      res.json({ reconciled, projectId: linkedProjectId, needsOnboarding: !currentUser.onboardingCompleted && linkedProjectId !== null });
    } catch (error) {
      console.error("Error reconciling invites:", error);
      res.json({ reconciled: 0 });
    }
  });

  app.get("/api/projects/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const requesterId = req.user.claims.sub;
      const requester = await authStorage.getUser(requesterId);
      if (requester?.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }
      const invites = await storage.getClientInvitesByProject(Number(req.params.id));
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  app.get("/api/projects/:id/budget-summary", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === "client" && project.clientId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (dbUser?.role === "client" && !project.budgetVisibleToClient) {
        return res.json({ hidden: true });
      }

      const estimates = await storage.getProjectEstimates(projectId);
      const activeEstimate = estimates[0];
      const budget = activeEstimate?.budget ? parseFloat(activeEstimate.budget) : 0;

      const projectReceipts = await storage.getReceipts(projectId);
      const totalSpent = projectReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

      // Approved change orders adjust the contract. Sum positive (additions)
      // and negative (credits) approved COs, ignore drafts/sent/declined.
      const cos = await storage.getChangeOrders(projectId, false, true);
      const approvedChangeOrders = cos
        .filter((c) => c.status === "approved")
        .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

      // Adjusted contract = base budget + approved CO total. Status is
      // computed against the adjusted total so going over only flags when
      // spending exceeds the *current* contract, not the original.
      const adjustedBudget = budget + approvedChangeOrders;

      let status: "no_budget" | "on_track" | "under_budget" | "over_budget" = "no_budget";
      let variancePercent = 0;
      if (adjustedBudget > 0) {
        variancePercent = ((totalSpent - adjustedBudget) / adjustedBudget) * 100;
        if (Math.abs(variancePercent) <= 5) status = "on_track";
        else if (variancePercent < -5) status = "under_budget";
        else status = "over_budget";
      }

      res.json({
        hidden: false,
        budget,
        approvedChangeOrders,
        adjustedBudget,
        totalSpent,
        status,
        variancePercent,
        budgetVisibleToClient: project.budgetVisibleToClient ?? false,
      });
    } catch (error) {
      console.error("Error fetching budget summary:", error);
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });

  app.patch("/api/projects/:id/budget-visibility", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can toggle budget visibility" });
      }
      const projectId = Number(req.params.id);
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      const { visible } = req.body;
      if (typeof visible !== "boolean") {
        return res.status(400).json({ message: "visible must be a boolean" });
      }
      const project = await storage.updateProject(projectId, { budgetVisibleToClient: visible });
      res.json({ budgetVisibleToClient: project.budgetVisibleToClient });
      broadcastProjectChange(projectId, ["project", "budget"], "updated", undefined, userId);
    } catch (error) {
      console.error("Error toggling budget visibility:", error);
      res.status(500).json({ message: "Failed to toggle budget visibility" });
    }
  });

  // My Tasks (cross-project, assigned to current user)
  app.get("/api/my-tasks", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const myTasks = await storage.getTasksByAssignee(userId);
    res.json(myTasks);
  }));

  // Upcoming events across all projects (for crew/admin My Day)
  app.get("/api/upcoming-events", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "crew" && dbUser.role !== "admin")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const days = Number(req.query.days) || 7;
    const events = await storage.getUpcomingEventsAllProjects(days);
    res.json(events);
  }));

  // Tasks
  app.get(api.tasks.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  }));

  app.post(api.tasks.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.tasks.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);

    if (input.sectionId) {
      const section = await storage.getSection(input.sectionId);
      if (!section || section.projectId !== projectId) {
        return res.status(400).json({ message: "Section does not belong to this project" });
      }
      if (input.milestoneId && section.milestoneId !== input.milestoneId) {
        return res.status(400).json({ message: "Section does not belong to the specified phase" });
      }
      if (!input.milestoneId) {
        input.milestoneId = section.milestoneId;
      }
    }

    const task = await storage.createTask({ ...input, projectId });
    res.status(201).json(task);
    broadcastProjectChange(task.projectId, ["tasks"], "created", task.id, req.user.claims.sub);

    const project = await storage.getProject(projectId);
    if (project && input.assignedTo) {
      notifyTaskAssigned(project.name, input.title, input.assignedTo).catch(() => {});
    }
  }));

  app.put(api.tasks.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const taskId = Number(req.params.id);

    if (req.body.sectionId) {
      const existingTask = await storage.getTask(taskId);
      if (existingTask) {
        const section = await storage.getSection(req.body.sectionId);
        if (!section || section.projectId !== existingTask.projectId) {
          return res.status(400).json({ message: "Section does not belong to this project" });
        }
        const effectiveMilestoneId = req.body.milestoneId ?? existingTask.milestoneId;
        if (effectiveMilestoneId && section.milestoneId !== effectiveMilestoneId) {
          return res.status(400).json({ message: "Section does not belong to the specified phase" });
        }
        if (!effectiveMilestoneId) {
          req.body.milestoneId = section.milestoneId;
        }
      }
    }

    const task = await storage.updateTask(taskId, req.body);
    res.json(task);
    broadcastProjectChange(task.projectId, ["tasks"], "updated", task.id, req.user.claims.sub);

    if (req.body.status && task.projectId) {
      const project = await storage.getProject(task.projectId);
      if (project) {
        const userId = req.user.claims.sub;
        notifyTaskStatusChange(project.name, task.title, task.status || "updated", project.clientId, userId).catch(() => {});
      }
    }
  }));

  // Milestones
  app.get(api.milestones.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const milestones = await storage.getMilestones(Number(req.params.projectId));
    res.json(milestones);
  }));

  app.post(api.milestones.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.milestones.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);
    const milestone = await storage.createMilestone({ ...input, projectId });
    res.status(201).json(milestone);
    broadcastProjectChange(projectId, ["milestones"], "created", milestone.id, req.user.claims.sub);

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
  }));

  app.patch("/api/milestones/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.user.claims.sub;
      
      const schema = z.object({
        title: z.string().optional(),
        date: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        completed: z.boolean().optional(),
        completedBy: z.string().nullable().optional(),
        order: z.number().optional(),
        colorHex: z.string().nullable().optional(),
        paintColorIds: z.array(z.number()).nullable().optional(),
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
      broadcastProjectChange(updated.projectId, ["milestones"], "updated", updated.id, userId);

      if (parsed.data.completed === true && !milestone.completed && project) {
        (async () => {
          try {
            const OpenAI = (await import("openai")).default;
            const openai = new OpenAI({
              apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
              baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
            });
            const projectPhotos = await storage.getPhotos(project.id);
            const pairedPhoto = projectPhotos.find((p: any) => p.isShowcase) || projectPhotos[0] || null;
            const milestonePrompt = `You are a social media copywriter for Aster & Spruce Living, a high-end Muskoka cottage renovation company.
Always use Canadian English spelling (colour, favourite, centre, etc.).
Brand voice: Warm minimalist, premium quality, nature-inspired.

A milestone has just been completed! Create a celebratory Instagram post.
Project: ${project.name}
Milestone completed: ${updated.title}

Write an engaging post celebrating this achievement (150-300 words, 15-25 hashtags).
Respond with valid JSON only:
{ "title": "<3-5 word title>", "copy": "<full post text>" }`;

            const aiRes = await openai.chat.completions.create({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: milestonePrompt },
                { role: "user", content: `Celebrate the completion of "${updated.title}" for project "${project.name}".` },
              ],
              response_format: { type: "json_object" },
            });
            const content = aiRes.choices[0]?.message?.content;
            if (content) {
              const result = JSON.parse(content);
              await storage.createSocialPost({
                projectId: project.id,
                title: String(result.title || `${updated.title} Complete`),
                copy: String(result.copy || ""),
                platform: "instagram",
                tone: "Milestone Celebration",
                photoUrl: pairedPhoto?.url || null,
                photoId: pairedPhoto?.id || null,
                status: "draft",
                source: "milestone",
              });
            }
          } catch (err) {
            console.error("Milestone social post auto-generation failed:", err);
          }
        })();
      }
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
      broadcastProjectChange(milestone.projectId, ["milestones"], "deleted", id, userId);
    } catch (error) {
      res.status(500).json({ message: "Failed to delete milestone" });
    }
  });

  // Sub-Milestones
  app.get("/api/milestones/:milestoneId/sub-milestones", isAuthenticated, asyncHandler(async (req, res) => {
    const subs = await storage.getSubMilestones(Number(req.params.milestoneId));
    res.json(subs);
  }));

  app.post("/api/milestones/:milestoneId/sub-milestones", isAuthenticated, async (req: any, res) => {
    const milestoneId = Number(req.params.milestoneId);
    const userId = req.user.claims.sub;
    const input = insertSubMilestoneSchema.parse({ ...req.body, milestoneId });
    const sub = await storage.createSubMilestone(input);
    res.status(201).json(sub);
    const parentMilestone = await storage.getMilestone(milestoneId);
    if (parentMilestone) {
      broadcastProjectChange(parentMilestone.projectId, ["milestones"], "created", sub.id, userId);
    }
  });

  app.patch("/api/sub-milestones/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = insertSubMilestoneSchema.partial().parse(req.body);
      const updated = await storage.updateSubMilestone(Number(req.params.id), parsed);
      res.json(updated);
      if (updated.milestoneId) {
        const parentMilestone = await storage.getMilestone(updated.milestoneId);
        if (parentMilestone) {
          broadcastProjectChange(parentMilestone.projectId, ["milestones"], "updated", updated.id, userId);
        }
      }
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

  // Sections (WBS grouping under phases)
  app.get("/api/projects/:projectId/sections", isAuthenticated, async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === 'client' && project.clientId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this project" });
    }
    const secs = await storage.getSections(projectId);
    res.json(secs);
  });

  app.post("/api/projects/:projectId/sections", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = req.user.claims.sub;

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === 'client') {
        return res.status(403).json({ message: "Clients cannot create sections" });
      }

      const milestoneId = Number(req.body.milestoneId);
      if (milestoneId) {
        const milestone = await storage.getMilestone(milestoneId);
        if (!milestone || milestone.projectId !== projectId) {
          return res.status(400).json({ message: "Milestone does not belong to this project" });
        }
      }

      const input = insertSectionSchema.parse({ ...req.body, projectId });
      const section = await storage.createSection(input);
      res.status(201).json(section);
      broadcastProjectChange(projectId, ["sections", "milestones"], "created", section.id, userId);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "Failed to create section" });
    }
  });

  app.patch("/api/sections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const section = await storage.getSection(Number(req.params.id));
      if (!section) return res.status(404).json({ message: "Section not found" });

      const project = await storage.getProject(section.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === 'client') {
        return res.status(403).json({ message: "Clients cannot update sections" });
      }

      const schema = z.object({
        title: z.string().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        completed: z.boolean().optional(),
        order: z.number().optional(),
        milestoneId: z.number().optional(),
      });
      const parsed = schema.parse(req.body);
      const updated = await storage.updateSection(Number(req.params.id), parsed);
      res.json(updated);
      broadcastProjectChange(updated.projectId, ["sections", "milestones"], "updated", updated.id, userId);
    } catch (e) {
      res.status(500).json({ message: "Failed to update section" });
    }
  });

  app.delete("/api/sections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.user.claims.sub;
      const section = await storage.getSection(id);
      if (!section) return res.status(404).json({ message: "Section not found" });

      const project = await storage.getProject(section.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role === 'client') {
        return res.status(403).json({ message: "Clients cannot delete sections" });
      }

      await storage.deleteSection(id);
      res.json({ ok: true });
      broadcastProjectChange(section.projectId, ["sections", "milestones", "tasks"], "deleted", id, userId);
    } catch (e) {
      res.status(500).json({ message: "Failed to delete section" });
    }
  });

  // Photos
  app.get(api.photos.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const photos = await storage.getPhotos(Number(req.params.projectId));
    res.json(photos);
  }));

  app.post(api.photos.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.photos.create.input.parse(req.body);
    const projectId = Number(req.params.projectId);
    const photo = await storage.createPhoto({ ...input, projectId });
    res.status(201).json(photo);
    broadcastProjectChange(photo.projectId, ["photos"], "created", photo.id, req.user.claims.sub);

    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (project) {
      notifyPhotoUploaded(project.name, project.clientId, userId).catch(() => {});
      storage.createActivityLog({ projectId, userId, type: "photo_uploaded", title: "Photo uploaded", description: input.caption || undefined }).catch(() => {});
    }
  }));

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

  // Replace the tags array on a photo. Used by the Assets drawer's grouping
  // feature — the first tag doubles as the asset group label.
  app.patch("/api/photos/:id/tags", isAuthenticated, async (req: any, res) => {
    try {
      const photoId = Number(req.params.id);
      const raw = req.body?.tags;
      const tags = Array.isArray(raw)
        ? raw.filter((t: any) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean)
        : [];
      await storage.setPhotoTags(photoId, tags);
      res.json({ success: true, tags });
    } catch (error) {
      res.status(500).json({ message: "Failed to update photo tags" });
    }
  });

  // Documents
  app.get(api.documents.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const docs = await storage.getDocuments(Number(req.params.projectId));
    res.json(docs);
  }));

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
        broadcastProjectChange(parseInt(req.params.projectId), ["documents"], "created", undefined, req.user.claims.sub);

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
  app.get(api.messages.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const messages = await storage.getMessages(Number(req.params.projectId));
    res.json(messages);
  }));

  app.post(api.messages.create.path, isAuthenticated, asyncHandler(async (req, res) => {
    const input = api.messages.create.input.parse(req.body);
    const user = req.user as any;
    const userId = user.claims.sub;
    const message = await storage.createMessage({ 
      ...input, 
      projectId: Number(req.params.projectId),
      senderId: userId 
    });
    res.status(201).json(message);
    broadcastProjectChange(message.projectId, ["messages"], "created", message.id, userId);

    const project = await storage.getProject(Number(req.params.projectId));
    if (project) {
      const sender = await authStorage.getUser(userId);
      const senderName = sender ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || "Someone" : "Someone";
      notifyNewMessage(project.id, project.name, senderName, input.content, userId, project.clientId).catch(() => {});
      storage.createActivityLog({ projectId: project.id, userId, type: "message_sent", title: `Message from ${senderName}`, description: input.content.slice(0, 100) }).catch(() => {});
    }
  }));

  // Decisions log
  // Read: any authenticated user with access to the project (clients see only their projects)
  // Write/update: crew or admin only
  app.get(api.decisions.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client" && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Clients never see archived decisions; crew/admin see them via ?includeArchived=1
    const includeArchived =
      dbUser?.role !== "client" && req.query.includeArchived === "1";
    const list = await storage.getDecisions(projectId, includeArchived);
    res.json(list);
  }));

  app.post(api.decisions.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can record decisions" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const input = api.decisions.create.input.parse(req.body);
    const decision = await storage.createDecision({
      ...input,
      projectId,
      decidedBy: userId,
    });
    res.status(201).json(decision);
    broadcastProjectChange(projectId, ["decisions"], "created", decision.id, userId);
    storage.createActivityLog({
      projectId,
      userId,
      type: "decision_recorded",
      title: `Decision: ${decision.title}`,
      description: decision.decision.slice(0, 140),
    }).catch(() => {});
  }));

  app.patch(api.decisions.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can update decisions" });
    }
    const existing = await storage.getDecision(id);
    if (!existing) return res.status(404).json({ message: "Decision not found" });
    const input = api.decisions.update.input.parse(req.body);
    const updated = await storage.updateDecision(id, input);
    res.json(updated);
    broadcastProjectChange(updated.projectId, ["decisions"], "updated", updated.id, userId);
  }));

  // Selections ledger
  // Read: any authenticated user with access to the project (clients see only their projects)
  // Write/update: crew or admin only
  app.get(api.selections.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client" && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Clients never see archived selections; crew/admin see them via ?includeArchived=1
    const includeArchived =
      dbUser?.role !== "client" && req.query.includeArchived === "1";
    const list = await storage.getSelections(projectId, includeArchived);
    res.json(list);
  }));

  app.post(api.selections.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can record selections" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const input = api.selections.create.input.parse(req.body);
    const selection = await storage.createSelection({
      ...input,
      projectId,
      createdBy: userId,
    });
    res.status(201).json(selection);
    broadcastProjectChange(projectId, ["selections"], "created", selection.id, userId);
    storage.createActivityLog({
      projectId,
      userId,
      type: "selection_added",
      title: `Selection: ${selection.item}`,
      description: [selection.product, selection.vendor].filter(Boolean).join(" · ").slice(0, 140),
    }).catch(() => {});
  }));

  app.patch(api.selections.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can update selections" });
    }
    const existing = await storage.getSelection(id);
    if (!existing) return res.status(404).json({ message: "Selection not found" });
    const input = api.selections.update.input.parse(req.body);
    const updated = await storage.updateSelection(id, input);
    res.json(updated);
    broadcastProjectChange(updated.projectId, ["selections"], "updated", updated.id, userId);
  }));

  // Change orders inbox
  // Read: any authenticated user with project access. Clients see only
  //   non-draft, non-archived rows.
  // Create: crew/admin only. Server auto-assigns the per-project number.
  // Update: crew/admin can change any field. Clients can only flip status
  //   from 'sent' to 'approved' or 'declined' on their own project.
  app.get(api.changeOrders.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    const isClient = dbUser?.role === "client";
    if (isClient && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Clients never see drafts or archived rows.
    // Crew/admin opt in via ?includeArchived=1 and ?includeDrafts=1.
    const includeArchived = !isClient && req.query.includeArchived === "1";
    const includeDrafts = !isClient && req.query.includeDrafts === "1";
    const list = await storage.getChangeOrders(projectId, includeArchived, includeDrafts);
    res.json(list);
  }));

  app.post(api.changeOrders.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can create change orders" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const input = api.changeOrders.create.input.parse(req.body);
    const number = await storage.getNextChangeOrderNumber(projectId);
    const co = await storage.createChangeOrder({
      ...input,
      projectId,
      createdBy: userId,
      number,
    });
    res.status(201).json(co);
    broadcastProjectChange(projectId, ["changeOrders", "budget"], "created", co.id, userId);
    storage.createActivityLog({
      projectId,
      userId,
      type: "change_order_created",
      title: `Change order CO-${co.number}: ${co.title}`,
      description: (co.description || "").slice(0, 140),
    }).catch(() => {});
  }));

  app.patch(api.changeOrders.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    const existing = await storage.getChangeOrder(id);
    if (!existing) return res.status(404).json({ message: "Change order not found" });
    const input = api.changeOrders.update.input.parse(req.body);

    if (dbUser?.role === "client") {
      // Clients can only respond to a change order that's been sent to them.
      // They can transition status from 'sent' to 'approved' or 'declined' — nothing else.
      const project = await storage.getProject(existing.projectId);
      if (!project || project.clientId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const allowedKeys = new Set(["status"]);
      const keys = Object.keys(input);
      const onlyAllowed = keys.length > 0 && keys.every((k) => allowedKeys.has(k));
      const allowedNext = input.status === "approved" || input.status === "declined";
      if (!onlyAllowed || !allowedNext || existing.status !== "sent") {
        return res.status(403).json({ message: "Clients can only approve or decline a sent change order" });
      }
      const updated = await storage.updateChangeOrder(id, {
        status: input.status,
        decidedBy: userId,
        decidedOn: new Date().toISOString().slice(0, 10),
      });
      res.json(updated);
      broadcastProjectChange(updated.projectId, ["changeOrders", "budget"], "updated", updated.id, userId);
      storage.createActivityLog({
        projectId: updated.projectId,
        userId,
        type: input.status === "approved" ? "change_order_approved" : "change_order_declined",
        title: `Change order CO-${updated.number} ${input.status}`,
        description: updated.title,
      }).catch(() => {});
      return;
    }

    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const updated = await storage.updateChangeOrder(id, input);
    res.json(updated);
    broadcastProjectChange(updated.projectId, ["changeOrders", "budget"], "updated", updated.id, userId);
  }));

  // Site visits
  // Read: any authenticated user with project access. Clients see only
  //   non-archived rows.
  // Create / Update: crew/admin only. Server fills projectId from URL and
  //   createdBy from session.
  app.get(api.siteVisits.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    const isClient = dbUser?.role === "client";
    if (isClient && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Crew/admin can opt in to archived rows; clients never see them.
    const includeArchived = !isClient && req.query.includeArchived === "1";
    const list = await storage.getSiteVisits(projectId, includeArchived);
    res.json(list);
  }));

  app.post(api.siteVisits.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can log site visits" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const input = api.siteVisits.create.input.parse(req.body);
    const visit = await storage.createSiteVisit({
      ...input,
      projectId,
      createdBy: userId,
    });
    res.status(201).json(visit);
    broadcastProjectChange(projectId, ["siteVisits"], "created", visit.id, userId);
    storage.createActivityLog({
      projectId,
      userId,
      type: "site_visit_logged",
      title: `Site visit on ${visit.visitedOn}`,
      description: (visit.summary || "").slice(0, 140),
    }).catch(() => {});
  }));

  app.patch(api.siteVisits.update.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can edit site visits" });
    }
    const existing = await storage.getSiteVisit(id);
    if (!existing) return res.status(404).json({ message: "Site visit not found" });
    const input = api.siteVisits.update.input.parse(req.body);
    const updated = await storage.updateSiteVisit(id, input);
    res.json(updated);
    broadcastProjectChange(updated.projectId, ["siteVisits"], "updated", updated.id, userId);
  }));

  // Time Entries
  app.get(api.timeEntries.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const entries = await storage.getTimeEntries(Number(req.params.projectId));
    res.json(entries);
  }));

  app.post(api.timeEntries.create.path, isAuthenticated, asyncHandler(async (req, res) => {
    const input = api.timeEntries.create.input.parse(req.body);
    const user = req.user as any;
    const entry = await storage.createTimeEntry({ 
      ...input, 
      projectId: Number(req.params.projectId),
      userId: user.claims.sub
    });
    res.status(201).json(entry);
  }));

  // Checklist Items
  // Read: any authenticated user with project access (clients limited to their own project).
  // Write: crew or admin only.
  app.get(api.checklist.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role === "client" && project.clientId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const items = await storage.getChecklistItems(projectId);
    res.json(items);
  }));

  app.post(api.checklist.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can create checklist items" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const input = api.checklist.create.input.parse(req.body);
    const item = await storage.createChecklistItem({
      ...input,
      projectId,
      createdBy: userId,
    });
    res.status(201).json(item);
    broadcastProjectChange(projectId, ["checklist"], "created", item.id, userId);
  }));

  app.put("/api/checklist/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can update checklist items" });
    }
    const existing = await storage.getChecklistItem(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Checklist item not found" });
    const input = api.checklist.update.input.parse(req.body);
    const item = await storage.updateChecklistItem(Number(req.params.id), input);
    if (!item) return res.status(404).json({ message: "Checklist item not found" });
    res.json(item);
    if (item.projectId) {
      broadcastProjectChange(item.projectId, ["checklist"], "updated", item.id, userId);
    }
  }));

  app.delete("/api/checklist/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only crew or admin can delete checklist items" });
    }
    const existing = await storage.getChecklistItem(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Checklist item not found" });
    await storage.deleteChecklistItem(Number(req.params.id));
    res.json({ success: true });
  }));

  // Board Items (Moodboard)
  app.get(api.board.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const items = await storage.getBoardItems(Number(req.params.projectId));
    res.json(items);
  }));

  app.post(api.board.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.board.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const item = await storage.createBoardItem({
      ...input,
      projectId: Number(req.params.projectId),
      createdBy: userId,
    });
    res.status(201).json(item);
    broadcastProjectChange(Number(req.params.projectId), ["board"], "created", item.id, userId);
  }));

  app.put("/api/board/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const input = api.board.update.input.parse(req.body);
    const item = await storage.updateBoardItem(Number(req.params.id), input);
    if (!item) return res.status(404).json({ message: "Board item not found" });
    res.json(item);
    if (item.projectId) {
      broadcastProjectChange(item.projectId, ["board"], "updated", item.id, userId);
    }
  }));

  app.delete("/api/board/:id", isAuthenticated, asyncHandler(async (req, res) => {
    await storage.deleteBoardItem(Number(req.params.id));
    res.json({ success: true });
  }));

  // Planning Boards
  app.get(api.planningBoards.list.path, isAuthenticated, asyncHandler(async (req: any, res) => {
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
  }));

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

  app.get(api.planningBoards.get.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const board = await checkBoardAccess(req, res, Number(req.params.id));
    if (!board) return;
    res.json(board);
  }));

  // Suggested categories — deduped, frequency-sorted list of `category` values
  // used across every board/element on a project. Powers the autocomplete in
  // card editors and the +Category dialog. Cached for 30s per project; we
  // recompute on the fly otherwise (small volume, no separate write path).
  const suggestedCategoriesCache = new Map<number, { at: number; data: string[] }>();
  app.get("/api/projects/:projectId/suggested-categories", isAuthenticated, asyncHandler(async (req: any, res) => {
    const projectId = Number(req.params.projectId);
    const ok = await checkProjectAccess(req, res, projectId);
    if (!ok) return;
    const cached = suggestedCategoriesCache.get(projectId);
    if (cached && Date.now() - cached.at < 30_000) {
      res.json(cached.data);
      return;
    }
    const { planningBoards: pbTable, canvasElements: ceTable } = await import("@shared/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const { db } = await import("./db");
    const boardRows = await db.select({ id: pbTable.id }).from(pbTable).where(eq(pbTable.projectId, projectId));
    const ids = boardRows.map((b) => b.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const rows = await db.select({ content: ceTable.content }).from(ceTable).where(inArray(ceTable.boardId, ids));
      for (const r of rows) {
        const c = (r.content as any) || {};
        const cat = typeof c.category === "string" ? c.category.trim() : "";
        if (!cat) continue;
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    const data = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
    suggestedCategoriesCache.set(projectId, { at: Date.now(), data });
    res.json(data);
  }));

  app.get("/api/board-templates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(await getTemplateCatalogue());
  }));

  // Save the current state of a board as a reusable template. Body:
  //   { boardId: number, name: string, description?: string }
  // The board's canvasData is deep-cloned at save time; later edits to the
  // source board do not retroactively change the template.
  app.post("/api/board-templates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const { boardId, name, description } = req.body ?? {};
    if (!boardId || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "boardId and name are required" });
    }
    const board = await storage.getPlanningBoard(Number(boardId));
    if (!board) {
      return res.status(404).json({ message: "Source board not found" });
    }
    const canvasData = board.canvasData ?? { objects: [] };
    const created = await storage.createBoardTemplate({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      canvasData: JSON.parse(JSON.stringify(canvasData)),
      sourceBoardId: Number(boardId),
      createdBy: userId,
    });
    res.status(201).json(created);
  }));

  app.delete("/api/board-templates/:templateId", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.templateId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid template id" });
    }
    await storage.deleteBoardTemplate(id);
    res.status(204).end();
  }));

  app.get("/api/board-templates/:templateId", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userRecord = await authStorage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const canvasData = await getTemplateCanvasData(req.params.templateId);
    if (!canvasData) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ id: req.params.templateId, canvasData });
  }));

function templateCanvasToElements(canvasData: any, boardId: number, createdBy: string) {
  const objects = Array.isArray(canvasData?.objects) ? canvasData.objects : [];
  const elements: any[] = [];
  let zIndex = 1;

  const columnBounds: { idx: number; x: number; y: number; w: number; h: number }[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (!obj || typeof obj !== "object") continue;
    const base = { boardId, createdBy, zIndex: zIndex++ };

    if (obj.type === "rect") {
      const x = Math.round(obj.left ?? 0);
      const y = Math.round(obj.top ?? 0);
      const w = Math.round(obj.width ?? 280);
      const h = Math.round(obj.height ?? 260);
      let columnTitle = "";
      const next = objects[i + 1];
      if (next?.type === "textbox") {
        const nx = Math.round(next.left ?? 0);
        const ny = Math.round(next.top ?? 0);
        if (nx >= x && nx <= x + w && ny >= y && ny <= y + h) {
          columnTitle = String(next.text || "");
          i++;
        }
      }
      const elIdx = elements.length;
      elements.push({
        ...base,
        type: "column",
        x, y, width: w, height: h,
        content: { title: columnTitle, backgroundColor: obj.fill },
      });
      columnBounds.push({ idx: elIdx, x, y, w, h });
      continue;
    }

    if (obj.type === "textbox") {
      const text = String(obj.text || "");
      const fontSize = obj.fontSize || 16;
      const isSectionTitle = fontSize >= 16 && text === text.toUpperCase() && text.length > 0;
      if (isSectionTitle) {
        elements.push({
          ...base,
          type: "text",
          x: Math.round(obj.left ?? 0),
          y: Math.round(obj.top ?? 0),
          width: Math.round(obj.width ?? 240),
          height: Math.max(48, Math.round(fontSize * 3)),
          content: { variant: "heading", title: text },
        });
      } else {
        elements.push({
          ...base,
          type: "text",
          x: Math.round(obj.left ?? 0),
          y: Math.round(obj.top ?? 0),
          width: Math.round(obj.width ?? 240),
          height: Math.max(48, Math.round(fontSize * 3)),
          content: { variant: "note", text },
        });
      }
      continue;
    }

    if (obj.type === "group") {
      const innerText = obj.objects?.find((o: any) => o.type === "textbox")?.text || "";
      elements.push({
        ...base,
        type: "text",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 180),
        height: Math.round(obj.height ?? 100),
        content: {
          variant: "note",
          text: innerText,
          color: obj.objects?.find((o: any) => o.type === "rect")?.fill || "#fef9c3",
        },
      });
      continue;
    }

    if (obj.type === "template_image") {
      elements.push({
        ...base,
        type: "image",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 280),
        height: Math.round(obj.height ?? 220),
        content: { url: obj.url || "", caption: obj.caption || "" },
      });
      continue;
    }

    if (obj.type === "template_color_swatch") {
      elements.push({
        ...base,
        type: "surface",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 180),
        height: Math.round(obj.height ?? 200),
        content: { kind: "paint", color: obj.color || "#1e3a2f", name: obj.name || "", hex: obj.hex || obj.color || "#1E3A2F", code: obj.code || "", brand: obj.brand || "", status: "idea" },
      });
      continue;
    }

    if (obj.type === "template_product") {
      elements.push({
        ...base,
        type: "product",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 220),
        height: Math.round(obj.height ?? 120),
        content: { name: obj.name || "", price: obj.price || "", supplier: obj.supplier || "", url: obj.url || "" },
      });
      continue;
    }

    if (obj.type === "template_material") {
      elements.push({
        ...base,
        type: "surface",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 220),
        height: Math.round(obj.height ?? 180),
        content: { kind: "material", name: obj.name || "", supplier: obj.supplier || "", code: obj.code || "", imageUrl: obj.imageUrl || "", notes: obj.notes || "", status: "idea" },
      });
      continue;
    }

    if (obj.type === "template_room_zone") {
      elements.push({
        ...base,
        type: "room_zone",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 500),
        height: Math.round(obj.height ?? 400),
        content: { title: obj.title || "Zone", color: obj.color || "#f0ede8", opacity: obj.opacity ?? 0.5 },
      });
      continue;
    }

    if (obj.type === "template_callout") {
      elements.push({
        ...base,
        type: "text",
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.width ?? 200),
        height: Math.round(obj.height ?? 80),
        content: { variant: "callout", text: obj.text || "", color: obj.color || "#fef9c3" },
      });
      continue;
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "column") continue;
    const cx = el.x + (el.width || 0) / 2;
    const cy = el.y + (el.height || 0) / 2;
    for (const col of columnBounds) {
      if (cx >= col.x && cx <= col.x + col.w && cy >= col.y && cy <= col.y + col.h) {
        el.parentColumnId = -1 - col.idx;
        break;
      }
    }
  }

  return { elements, columnBounds };
}

  app.post(api.planningBoards.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const hasAccess = await checkProjectAccess(req, res, projectId);
      if (!hasAccess) return;
      const userId = req.user.claims.sub;
      const input = api.planningBoards.create.input.parse(req.body);

      const templateId = input.templateId;
      let canvasData: any = undefined;
      if (templateId) {
        const userRecord = await authStorage.getUser(userId);
        if (userRecord?.role !== "admin") {
          return res.status(403).json({ message: "Only admins can use board templates" });
        }
        canvasData = await getTemplateCanvasData(templateId);
        if (!canvasData) {
          return res.status(400).json({ message: "Invalid template ID" });
        }
      }

      const { templateId: _tid, ...boardInput } = input;
      const board = await storage.createPlanningBoard({
        ...boardInput,
        projectId,
        updatedBy: userId,
        ...(canvasData ? { canvasData } : {}),
      });
      if (canvasData) {
        try {
          const { elements, columnBounds } = templateCanvasToElements(canvasData, board.id, userId);
          if (elements.length > 0) {
            const rawElements = elements.map(({ parentColumnId: _p, ...rest }: any) => rest);
            const created = await storage.createCanvasElements(rawElements as any);
            const columnIdMap = new Map<number, number>();
            for (const col of columnBounds) {
              const realId = created[col.idx]?.id;
              if (realId) columnIdMap.set(col.idx, realId);
            }
            const updates: { id: number; parentColumnId: number }[] = [];
            for (let i = 0; i < elements.length; i++) {
              const marker = elements[i].parentColumnId;
              if (marker !== undefined && marker < 0) {
                const colIdx = -1 - marker;
                const realColId = columnIdMap.get(colIdx);
                if (realColId && created[i]?.id) {
                  updates.push({ id: created[i].id, parentColumnId: realColId });
                }
              }
            }
            if (updates.length > 0) {
              for (const u of updates) {
                await storage.updateCanvasElement(u.id, { parentColumnId: u.parentColumnId });
              }
            }
          }
        } catch (templateErr: any) {
          console.error("Template element creation error:", templateErr.message);
        }
      }
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

  // URL unfurl — fetches OG/meta tags so any paste-in product or reference URL
  // gets a thumbnail, title, site name, and (when present) price/currency.
  // Used by the Hardware/Material picker and by board link elements.
  // Admin/crew only; rate-limited per user (in-memory).
  const unfurlBuckets = new Map<string, { count: number; resetAt: number }>();
  const UNFURL_LIMIT = 30;
  const UNFURL_WINDOW_MS = 5 * 60_000;

  const handleUnfurl = async (req: any, res: any) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can unfurl URLs" });
      }

      const now = Date.now();
      const bucket = unfurlBuckets.get(userId);
      if (!bucket || bucket.resetAt < now) {
        unfurlBuckets.set(userId, { count: 1, resetAt: now + UNFURL_WINDOW_MS });
      } else {
        if (bucket.count >= UNFURL_LIMIT) {
          return res.status(429).json({ message: "Too many unfurl requests; try again in a few minutes." });
        }
        bucket.count += 1;
      }

      const url = String(req.body?.url || "").trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ message: "A valid http(s) URL is required" });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let html = "";
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; AsterSpruceBoard/1.0; +https://asterandspruceliving.ca)",
            "Accept": "text/html,application/xhtml+xml",
          },
        });
        if (!r.ok) {
          return res.status(422).json({ message: "Couldn't read that page; try manual entry." });
        }
        html = await r.text();
      } catch {
        clearTimeout(timer);
        return res.status(422).json({ message: "Couldn't read that page; try manual entry." });
      } finally {
        clearTimeout(timer);
      }

      const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
      const head = headMatch ? headMatch[1] : html.slice(0, 50_000);

      const metaContent = (re: RegExp): string | undefined => {
        const m = head.match(re);
        return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : undefined;
      };

      const ogTitle = metaContent(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
      const titleTag = metaContent(/<title[^>]*>([^<]+)<\/title>/i);
      const ogImage = metaContent(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      const ogSiteName = metaContent(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
      const ogDescription = metaContent(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i);
      const priceAmount = metaContent(/<meta[^>]+property=["'](?:og:price:amount|product:price:amount)["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i);
      const priceCurrency = metaContent(/<meta[^>]+property=["'](?:og:price:currency|product:price:currency)["'][^>]+content=["']([^"']+)["']/i)
        || metaContent(/<meta[^>]+itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)["']/i);

      const priceNum = priceAmount ? Number(String(priceAmount).replace(/[^0-9.]/g, "")) : undefined;

      let absoluteImage: string | undefined = ogImage;
      if (absoluteImage && /^\/\//.test(absoluteImage)) absoluteImage = "https:" + absoluteImage;
      else if (absoluteImage && /^\//.test(absoluteImage)) {
        try { absoluteImage = new URL(absoluteImage, url).toString(); } catch { /* keep raw */ }
      }

      res.json({
        title: ogTitle || titleTag,
        image: absoluteImage,
        siteName: ogSiteName,
        description: ogDescription,
        price: Number.isFinite(priceNum as number) ? priceNum : undefined,
        currency: priceCurrency,
        sourceUrl: url,
      });
    } catch (err: any) {
      console.error("Unfurl error:", err.message);
      res.status(422).json({ message: "Couldn't read that page; try manual entry." });
    }
  };

  app.post("/api/board/unfurl", isAuthenticated, handleUnfurl);
  // Back-compat alias — hardware/material picker still calls this path.
  app.post("/api/board/unfurl-vendor", isAuthenticated, handleUnfurl);

  // Spec sheet PDF — admin/crew only. Streams a printable PDF tearsheet of every
  // selected/ordered hardware/surface/product across the project's boards.
  app.post("/api/projects/:projectId/spec-sheet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can generate spec sheets" });
      }
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: "Invalid project id" });
      }
      const { generateSpecSheetPdf } = await import("./spec-sheet");
      const roomFilter = typeof req.body?.room === "string" ? req.body.room : null;
      await generateSpecSheetPdf(projectId, res, { roomFilter });
    } catch (err: any) {
      console.error("Spec sheet error:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate spec sheet" });
      } else {
        try { res.end(); } catch { /* already broken */ }
      }
    }
  });

  // Manual vendor-link recheck. Admin/crew only; rate-limited 10/user/hour.
  const recheckBuckets = new Map<string, { count: number; resetAt: number }>();
  const RECHECK_LIMIT = 10;
  const RECHECK_WINDOW_MS = 60 * 60_000;

  app.post("/api/board/element/:elementId/recheck-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can recheck links" });
      }
      const now = Date.now();
      const bucket = recheckBuckets.get(userId);
      if (!bucket || bucket.resetAt < now) {
        recheckBuckets.set(userId, { count: 1, resetAt: now + RECHECK_WINDOW_MS });
      } else {
        if (bucket.count >= RECHECK_LIMIT) {
          return res.status(429).json({ message: "Too many recheck requests; try again later." });
        }
        bucket.count += 1;
      }
      const elementId = Number(req.params.elementId);
      if (!Number.isFinite(elementId)) {
        return res.status(400).json({ message: "Invalid element id" });
      }
      const element = await storage.getCanvasElement(elementId);
      if (!element) return res.status(404).json({ message: "Element not found" });
      const board = await checkBoardAccess(req, res, element.boardId);
      if (!board) return;
      const { recheckElementLink } = await import("./link-health");
      const result = await recheckElementLink(elementId);
      if (!result) {
        return res.status(400).json({ message: "Element has no vendor URL" });
      }
      res.json({ linkHealth: result });
    } catch (err: any) {
      console.error("Recheck link error:", err?.message || err);
      res.status(500).json({ message: "Failed to recheck link" });
    }
  });

  // Board palette extraction — k-means cluster on a photo, snap each
  // centroid to the nearest paint color in the seeded catalogue.
  // Admin/crew only; rate-limited per user.
  const paletteBuckets = new Map<string, { count: number; resetAt: number }>();
  const PALETTE_LIMIT = 20;
  const PALETTE_WINDOW_MS = 5 * 60_000;

  app.post("/api/board/extract-palette", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can extract palettes" });
      }

      const now = Date.now();
      const bucket = paletteBuckets.get(userId);
      if (!bucket || bucket.resetAt < now) {
        paletteBuckets.set(userId, { count: 1, resetAt: now + PALETTE_WINDOW_MS });
      } else {
        if (bucket.count >= PALETTE_LIMIT) {
          return res.status(429).json({ message: "Too many palette extractions; try again in a few minutes." });
        }
        bucket.count += 1;
      }

      const imageUrl = String(req.body?.imageUrl || "").trim();
      const kRaw = Number(req.body?.k);
      const k = Number.isFinite(kRaw) ? kRaw : 5;
      if (!imageUrl) return res.status(400).json({ message: "imageUrl is required" });
      if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/")) {
        return res.status(400).json({ message: "imageUrl must be http(s) or a /uploads/... path" });
      }

      const { extractPalette } = await import("./palette-extraction");
      const paintColors = await storage.getPaintColors();
      if (paintColors.length === 0) {
        return res.status(503).json({ message: "Paint catalogue not seeded" });
      }

      const origin = req.protocol + "://" + req.get("host");
      const extracted = await extractPalette({ imageUrl, k, paintColors, originBaseUrl: origin });
      res.json({ extracted });
    } catch (err: any) {
      const msg = err?.message || "Couldn't extract palette";
      const status = /too large|too small|unreadable|Invalid path|Not an image/i.test(msg) ? 422 : 500;
      res.status(status).json({ message: status === 422 ? msg : "Couldn't extract palette from that image." });
    }
  });

  // Board Snapshots — admin/crew only (clients never see Versions UI)
  async function requireBoardSnapshotAccess(req: any, res: any): Promise<boolean> {
    const dbUser = await authStorage.getUser(req.user.id);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      res.status(403).json({ message: "Only admin/crew can manage board versions" });
      return false;
    }
    return true;
  }

  app.get(api.boardSnapshots.list.path, isAuthenticated, async (req: any, res) => {
    try {
      if (!(await requireBoardSnapshotAccess(req, res))) return;
      const boardId = parseInt(req.params.boardId);
      const snapshots = await storage.getBoardSnapshots(boardId);
      res.json(snapshots);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to list snapshots" });
    }
  });

  app.post(api.boardSnapshots.create.path, isAuthenticated, async (req: any, res) => {
    try {
      if (!(await requireBoardSnapshotAccess(req, res))) return;
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

  app.patch(api.boardSnapshots.rename.path, isAuthenticated, async (req: any, res) => {
    try {
      if (!(await requireBoardSnapshotAccess(req, res))) return;
      const id = parseInt(req.params.id);
      const { name } = api.boardSnapshots.rename.input.parse(req.body);
      const updated = await storage.renameBoardSnapshot(id, name);
      if (!updated) return res.status(404).json({ message: "Snapshot not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to rename snapshot" });
    }
  });

  app.post(api.boardSnapshots.restore.path, isAuthenticated, async (req: any, res) => {
    try {
      if (!(await requireBoardSnapshotAccess(req, res))) return;
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
      if (!(await requireBoardSnapshotAccess(req, res))) return;
      const id = parseInt(req.params.id);
      await storage.deleteBoardSnapshot(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete snapshot" });
    }
  });

  // Cross-project calendar (admin/crew only)
  app.get("/api/calendar/all", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const dbUser = userId ? await authStorage.getUser(userId) : null;
    const role = dbUser?.role;
    if (role !== "admin" && role !== "crew") {
      return res.status(403).json({ message: "Admin or crew access required" });
    }
    try {
      const [events, allMilestones, allSections, allTasks] = await Promise.all([
        storage.getAllCalendarEvents(),
        storage.getAllMilestonesWithProject(),
        storage.getAllSectionsWithProject(),
        storage.getAllTasksWithProject(),
      ]);
      res.json({ events, milestones: allMilestones, sections: allSections, tasks: allTasks });
    } catch (err) {
      console.error("Error fetching cross-project calendar:", err);
      res.status(500).json({ message: "Failed to fetch calendar data" });
    }
  });

  // Calendar Events
  app.get(api.calendar.list.path, isAuthenticated, asyncHandler(async (req, res) => {
    const events = await storage.getCalendarEvents(Number(req.params.projectId));
    res.json(events);
  }));

  app.post(api.calendar.create.path, isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.calendar.create.input.parse(req.body);
    const userId = req.user.claims.sub;
    const projectId = Number(req.params.projectId);
    const event = await storage.createCalendarEvent({
      ...input,
      projectId,
      createdBy: userId,
    });
    res.status(201).json(event);
    broadcastProjectChange(projectId, ["calendar"], "created", event.id, userId);

    const project = await storage.getProject(projectId);
    if (project) {
      notifyCalendarEventCreated(project.name, input.title, input.date || "TBD", project.clientId, userId).catch(() => {});
      storage.createActivityLog({ projectId, userId, type: "calendar_event_created", title: `Event added: ${input.title}`, description: input.date || undefined }).catch(() => {});
    }
  }));

  app.put("/api/calendar/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const input = api.calendar.update.input.parse(req.body);
    const event = await storage.updateCalendarEvent(Number(req.params.id), input);
    if (!event) return res.status(404).json({ message: "Calendar event not found" });
    res.json(event);
    if (event.projectId) {
      broadcastProjectChange(event.projectId, ["calendar"], "updated", event.id, req.user?.claims?.sub);
    }

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
  }));

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
        const userId = (req as any).user?.claims?.sub;
        const event = await storage.updateCalendarEvent(Number(req.params.id), { imageUrl: url });
        if (!event) return res.status(404).json({ message: "Calendar event not found" });
        res.json(event);
        if (event.projectId) {
          broadcastProjectChange(event.projectId, ["calendar"], "updated", event.id, userId);
        }
      } catch (error) {
        console.error("Error uploading calendar event image:", error);
        res.status(500).json({ message: "Failed to upload image" });
      }
    });
  });

  app.delete("/api/calendar/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const eventId = Number(req.params.id);
    const event = await storage.getCalendarEvent(eventId);
    if (event) {
      await storage.deleteActivityByTypeAndTitle(event.projectId, "calendar_event_created", `Event added: ${event.title}`);
    }
    await storage.deleteCalendarEvent(eventId);
    res.json({ success: true });
    if (event?.projectId) {
      broadcastProjectChange(event.projectId, ["calendar"], "deleted", eventId, userId);
    }
  }));

  // Weather & PDF Reports Stubs
  app.get('/api/projects/:projectId/weather', isAuthenticated, asyncHandler(async (req, res) => {
    // In a real app, we'd call a weather API. For now, we'll return mock data based on "Muskoka"
    res.json({
      temp: 18,
      condition: "Partly Cloudy",
      impact: "No immediate impact on outdoor framing. Keep materials covered for potential evening showers."
    });
  }));

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
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
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

  // ────────────────────────────────────────────────────────────────────────
  // Presentation Mode: share-link + public read-only endpoint.
  // Token is stored inside planning_boards.canvasData JSONB under `shareToken`,
  // so no schema migration is required. Lookup is O(n) over boards but the
  // board count is small.
  // ────────────────────────────────────────────────────────────────────────
  app.post("/api/board/presentation-link", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }
    const { boardId } = req.body || {};
    if (!boardId || typeof boardId !== "number") {
      return res.status(400).json({ error: "boardId required" });
    }
    const board = await storage.getPlanningBoard(boardId);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const existing = (board.canvasData as any) || {};
    let token: string = existing.shareToken;
    if (!token || typeof token !== "string") {
      token = randomUUID();
      const nextCanvas = { ...existing, shareToken: token };
      await storage.savePlanningBoardCanvas(board.id, nextCanvas, userId);
    }
    res.json({ url: `/p/${token}`, token });
  }));

  app.get("/api/board/presentation/:token", asyncHandler(async (req: any, res) => {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "Token required" });

    // Find a board whose canvasData.shareToken matches.
    // We don't have a direct query helper, so scan via the underlying drizzle handle.
    const allBoards = await (storage as any).getAllPlanningBoardsForShareLookup?.() ?? null;
    let board: any = null;
    if (Array.isArray(allBoards)) {
      board = allBoards.find((b: any) => (b.canvasData as any)?.shareToken === token);
    } else {
      // Fallback: scan all projects' boards. Less efficient but acceptable for small datasets.
      const projects = await storage.getProjects();
      for (const proj of projects) {
        const boards = await storage.getPlanningBoards(proj.id);
        const match = boards.find((b: any) => (b.canvasData as any)?.shareToken === token);
        if (match) { board = match; break; }
      }
    }
    if (!board) return res.status(404).json({ error: "Not found" });

    const elements = await storage.getCanvasElements(board.id);
    // Stamp the share token onto any /objects/* image URLs so the public
    // presentation page can read them without being logged in. /objects/*
    // is now auth-gated; the ?pt=<token> grants scoped read access for the
    // duration the share link is alive.
    const stampPt = (val: any): any => {
      if (typeof val !== "string") return val;
      if (!val.startsWith("/objects/")) return val;
      return val.includes("?") ? `${val}&pt=${token}` : `${val}?pt=${token}`;
    };
    const stampedElements = (elements as any[]).map((el) => {
      if (!el || typeof el !== "object") return el;
      const next = { ...el };
      for (const k of ["imageUrl", "image_url", "url", "src", "thumbnailUrl"]) {
        if (k in next) next[k] = stampPt(next[k]);
      }
      // Some elements nest the image inside `data` / `props` / `content`.
      for (const wrapper of ["data", "props", "content"]) {
        if (next[wrapper] && typeof next[wrapper] === "object") {
          const w = { ...next[wrapper] };
          for (const k of ["imageUrl", "image_url", "url", "src", "thumbnailUrl"]) {
            if (k in w) w[k] = stampPt(w[k]);
          }
          next[wrapper] = w;
        }
      }
      return next;
    });
    res.json({
      projectId: board.projectId,
      boardId: board.id,
      boardName: board.name,
      elements: stampedElements,
    });
  }));

  // ────────────────────────────────────────────────────────────────────────
  // AI Design Critique: senior-designer-voice take on the current board.
  // ────────────────────────────────────────────────────────────────────────
  const critiqueLimits = new Map<string, number[]>(); // key: `${boardId}:${userId}` → [timestamps]
  const CRITIQUE_LIMIT = 5;
  const CRITIQUE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

  app.post("/api/ai/design-critique", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }

    const { boardId, focus } = req.body || {};
    if (!boardId || typeof boardId !== "number") {
      return res.status(400).json({ error: "boardId required" });
    }

    // Rate limit.
    const key = `${boardId}:${userId}`;
    const now = Date.now();
    const stamps = (critiqueLimits.get(key) || []).filter((t) => now - t < CRITIQUE_WINDOW_MS);
    if (stamps.length >= CRITIQUE_LIMIT) {
      return res.status(429).json({ error: "Critique limit reached. Try again later." });
    }
    stamps.push(now);
    critiqueLimits.set(key, stamps);

    const board = await storage.getPlanningBoard(boardId);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const project = await storage.getProject(board.projectId);
    const elements = await storage.getCanvasElements(boardId);

    const colorSwatches = elements.filter((e) =>
      e.type === "color_swatch" || (e.type === "surface" && (e.content as any)?.kind === "paint")
    );
    const hardware = elements.filter((e) => e.type === "hardware");
    const materials = elements.filter((e) =>
      e.type === "material" || (e.type === "surface" && (e.content as any)?.kind === "material")
    );
    const products = elements.filter((e) => e.type === "product");
    const images = elements.filter((e) => e.type === "image");
    const notes = elements.filter((e) =>
      e.type === "note" || e.type === "plain_text" || e.type === "callout" ||
      (e.type === "text" && (e.content as any)?.variant !== "heading")
    );
    const rooms = elements.filter((e) => e.type === "room_zone");

    const fmtList = (label: string, items: string[]) =>
      items.length ? `${label}:\n${items.map((s) => `  - ${s}`).join("\n")}` : "";

    const digestParts: string[] = [];
    digestParts.push(`Project: ${project?.name || "Untitled"}${project?.address ? ` (${project.address})` : ""}`);
    if (rooms.length) {
      const roomNames = rooms.map((r) => (r.content as any)?.name || (r.content as any)?.label).filter(Boolean) as string[];
      if (roomNames.length) digestParts.push(`Rooms: ${roomNames.join(", ")}`);
    }
    digestParts.push(fmtList(
      "Color palette",
      colorSwatches.map((s) => {
        const c: any = s.content || {};
        return [c.name || "Untitled color", c.brand, c.code, c.hex, typeof c.lrv === "number" ? `LRV ${c.lrv}` : null, c.sheen, c.room]
          .filter(Boolean).join(" · ");
      })
    ));
    digestParts.push(fmtList(
      "Hardware",
      hardware.map((h) => {
        const c: any = h.content || {};
        return [c.name || "Untitled", c.category, c.brand, c.finish, c.room, c.status]
          .filter(Boolean).join(" · ");
      })
    ));
    digestParts.push(fmtList(
      "Materials",
      materials.map((m) => {
        const c: any = m.content || {};
        return [c.name || "Untitled", c.supplier, c.category, c.code]
          .filter(Boolean).join(" · ");
      })
    ));
    digestParts.push(fmtList(
      "Products",
      products.map((p) => {
        const c: any = p.content || {};
        return [c.name || "Untitled", c.brand, c.category, c.sku]
          .filter(Boolean).join(" · ");
      })
    ));
    digestParts.push(`Inspiration images: ${images.length} on the board`);

    if (notes.length) {
      const noteText = notes.map((n) => (n.content as any)?.text || (n.content as any)?.content || "")
        .filter((s: string) => s.trim().length).join("\n").slice(0, 500);
      if (noteText) digestParts.push(`Notes (excerpts):\n${noteText}`);
    }

    const digest = digestParts.filter(Boolean).join("\n\n");

    const systemPrompt = `You are a senior interior designer giving honest, warm, specific feedback to a designer-collaborator on a working moodboard. You have 25 years experience working in residential interiors with a sensibility like Heidi Caillier or Athena Calderone. Your feedback is direct but never harsh, and always points to a specific element by name when making a critique.

Given this board, write a critique in 4 short sections:
1. The vibe — 1-2 sentences naming the mood and what's working
2. Tensions — 1-3 specific tensions, each naming the element by name
3. Missing — 1-2 things the board lacks that would round it out
4. Next move — 1 sentence, the single most leveraged next decision

Use designer language naturally. Be specific. Mention items by their actual names. Avoid generic statements. No bullet lists in your response — write in flowing paragraphs with bold section headings (Markdown). Use **The vibe**, **Tensions**, **Missing**, and **Next move** as bold headings on their own lines.`;

    const userMessage = `Focus: ${focus || "all"}\n\nBoard summary:\n\n${digest}`;

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const response = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      } as any);

      const critique = response.choices[0]?.message?.content?.trim() || "Could not generate a critique. Try again.";
      res.json({ critique, generatedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("Design critique error:", error?.status, error?.message, error?.response?.data || error);
      const detail = error?.message || "Unknown error";
      res.status(500).json({ error: "Failed to generate critique", detail });
    }
  }));

  // ────────────────────────────────────────────────────────────────────────
  // AI Partner mode: board-pulse (proactive) + board-prompt (manual).
  // Shared rate-limit pool, generous: 12/board/user/hour.
  // ────────────────────────────────────────────────────────────────────────
  const partnerLimits = new Map<string, number[]>();
  const PARTNER_LIMIT = 12;
  const PARTNER_WINDOW_MS = 60 * 60 * 1000;

  function partnerRateCheck(boardId: number, userId: string) {
    const key = `${boardId}:${userId}`;
    const now = Date.now();
    const stamps = (partnerLimits.get(key) || []).filter((t) => now - t < PARTNER_WINDOW_MS);
    if (stamps.length >= PARTNER_LIMIT) {
      const oldest = stamps[0];
      const retryMs = PARTNER_WINDOW_MS - (now - oldest);
      return { ok: false as const, retryMs };
    }
    stamps.push(now);
    partnerLimits.set(key, stamps);
    return { ok: true as const, remaining: PARTNER_LIMIT - stamps.length };
  }

  const SuggestionSchema = z.object({
    type: z.enum(["gap", "conflict", "pairing", "opportunity"]),
    room: z.string().optional(),
    severity: z.enum(["info", "nudge", "flag"]),
    text: z.string().min(1).max(200),
    referencedElementIds: z.array(z.number()).max(8).optional(),
  });

  const PulseDigestSchema = z.object({
    boardId: z.number(),
    rooms: z.array(z.object({
      name: z.string(),
      items: z.array(z.object({
        id: z.number(),
        kind: z.string(),
        name: z.string().optional(),
        finish: z.string().optional(),
        color: z.string().optional(),
        price: z.number().optional(),
        status: z.string().optional(),
      })).max(40),
    })).max(20).optional(),
    palette: z.array(z.object({
      id: z.number(),
      name: z.string().optional(),
      hex: z.string().optional(),
      lrv: z.number().optional(),
      brand: z.string().optional(),
      sheen: z.string().optional(),
      room: z.string().optional(),
    })).max(40).optional(),
    materials: z.array(z.object({
      id: z.number(),
      name: z.string().optional(),
      kind: z.string().optional(),
      lrv: z.number().optional(),
      supplier: z.string().optional(),
      room: z.string().optional(),
    })).max(40).optional(),
    inspirationCount: z.number().optional(),
    signature: z.string().optional(),
  });

  app.post("/api/ai/board-pulse", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }

    const parsed = PulseDigestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid digest" });
    const digest = parsed.data;

    const board = await storage.getPlanningBoard(digest.boardId);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const rate = partnerRateCheck(digest.boardId, userId);
    if (!rate.ok) {
      const minutes = Math.max(1, Math.ceil(rate.retryMs / 60000));
      return res.status(429).json({ error: "Partner rate limit reached", retryMinutes: minutes });
    }

    const project = await storage.getProject(board.projectId);

    const lines: string[] = [];
    lines.push(`Project: ${project?.name || "Untitled"}`);
    if (digest.rooms?.length) {
      for (const r of digest.rooms) {
        if (!r.items.length) continue;
        lines.push(`Room — ${r.name}:`);
        for (const it of r.items) {
          const parts = [
            `[id:${it.id}]`,
            it.kind,
            it.name,
            it.finish,
            it.color,
            it.status ? `(${it.status})` : null,
            typeof it.price === "number" ? `$${it.price}` : null,
          ].filter(Boolean);
          lines.push(`  - ${parts.join(" · ")}`);
        }
      }
    }
    if (digest.palette?.length) {
      lines.push("Palette:");
      for (const p of digest.palette) {
        const parts = [
          `[id:${p.id}]`,
          p.name,
          p.brand,
          p.hex,
          typeof p.lrv === "number" ? `LRV ${p.lrv}` : null,
          p.sheen,
          p.room,
        ].filter(Boolean);
        lines.push(`  - ${parts.join(" · ")}`);
      }
    }
    if (digest.materials?.length) {
      lines.push("Materials:");
      for (const m of digest.materials) {
        const parts = [
          `[id:${m.id}]`,
          m.name,
          m.kind,
          m.supplier,
          typeof m.lrv === "number" ? `LRV ${m.lrv}` : null,
          m.room,
        ].filter(Boolean);
        lines.push(`  - ${parts.join(" · ")}`);
      }
    }
    if (typeof digest.inspirationCount === "number") {
      lines.push(`Inspiration images on board: ${digest.inspirationCount}`);
    }

    const summary = lines.join("\n");

    const systemPrompt = `You are an interior designer working alongside another designer on a live moodboard. You're the partner in the room — warm, fast, specific. Watch what's happening and share AT MOST 3 short observations. Each is one of:
- gap: something a room is clearly missing
- conflict: two choices that fight (finish clash, LRV mismatch, palette tension)
- pairing: a strong pairing already on the board worth naming
- opportunity: a small move that would lift the room

Rules:
- text ≤ 140 characters, conversational, like you're standing next to them
- when an observation refers to specific items, include their numeric ids in referencedElementIds (the [id:N] tokens above)
- severity: info = neutral noticing, nudge = soft suggestion, flag = real concern
- if the board is too sparse to say anything useful, return an empty array

Respond with ONLY a JSON object: { "suggestions": Suggestion[] } where Suggestion is { type, room?, severity, text, referencedElementIds? }. No prose outside JSON.`;

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const response = await client.chat.completions.create({
        model: "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Board state:\n\n${summary}` },
        ],
      } as any);

      const raw = response.choices[0]?.message?.content?.trim() || "{}";
      let parsedJson: any = {};
      try { parsedJson = JSON.parse(raw); } catch { parsedJson = {}; }
      const arr = Array.isArray(parsedJson?.suggestions) ? parsedJson.suggestions : [];
      const suggestions = arr
        .map((s: any) => SuggestionSchema.safeParse(s))
        .filter((r: any) => r.success)
        .map((r: any) => r.data)
        .slice(0, 3);

      res.json({
        suggestions,
        generatedAt: new Date().toISOString(),
        signature: digest.signature ?? null,
      });
    } catch (error: any) {
      console.error("Board pulse error:", error?.status, error?.message, error?.response?.data || error);
      const detail = error?.message || "Unknown error";
      res.status(500).json({ error: "Failed to generate partner suggestions", detail });
    }
  }));

  // Conversation messages are passed as a flat array. Wire-shape mirrors
  // OpenAI: { role: "user" | "assistant", content: string }. Server caps the
  // total turns to keep prompts bounded.
  const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000),
  });
  const BoardPromptSchema = PulseDigestSchema.extend({
    prompt: z.string().min(1).max(500),
    messages: z.array(ChatMessageSchema).max(40).optional(),
  });

  app.post("/api/ai/board-prompt", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }

    const parsed = BoardPromptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const digest = parsed.data;

    const board = await storage.getPlanningBoard(digest.boardId);
    if (!board) return res.status(404).json({ error: "Board not found" });

    const rate = partnerRateCheck(digest.boardId, userId);
    if (!rate.ok) {
      const minutes = Math.max(1, Math.ceil(rate.retryMs / 60000));
      return res.status(429).json({ error: "Partner rate limit reached", retryMinutes: minutes });
    }

    const project = await storage.getProject(board.projectId);

    const lines: string[] = [];
    lines.push(`Project: ${project?.name || "Untitled"}`);
    if (digest.rooms?.length) {
      for (const r of digest.rooms) {
        if (!r.items.length) continue;
        lines.push(`Room — ${r.name}:`);
        for (const it of r.items) {
          const parts = [`[id:${it.id}]`, it.kind, it.name, it.finish, it.color, it.status ? `(${it.status})` : null].filter(Boolean);
          lines.push(`  - ${parts.join(" · ")}`);
        }
      }
    }
    if (digest.palette?.length) {
      lines.push("Palette:");
      for (const p of digest.palette) {
        const parts = [`[id:${p.id}]`, p.name, p.brand, p.hex, typeof p.lrv === "number" ? `LRV ${p.lrv}` : null].filter(Boolean);
        lines.push(`  - ${parts.join(" · ")}`);
      }
    }
    const summary = lines.join("\n");

    // Teammate tone, not assistant tone — the user is explicit about this.
    // The model speaks as a fellow designer working alongside them. It can
    // optionally propose a single "add a note to the board" action by
    // emitting a strict JSON tail block that the client parses out.
    const systemPrompt = [
      "You are an interior designer working SIDE BY SIDE with another designer on a shared moodboard. You are teammates, not an assistant. Use language like \"let's\", \"what if we\", \"I'm thinking\", \"could we\". Never say \"let me help you\", \"happy to help\", \"as an AI\", or anything subservient.",
      "Reply naturally in 1–3 short sentences (≤ 320 characters of prose), conversational and specific. Reference items by name when relevant. No bullet lists, no headers.",
      "If — and only if — a short sticky note would genuinely help capture a decision, reminder, or design direction worth keeping on the board, append EXACTLY ONE additional line at the very end of your reply, on its own line, in this exact format:",
      "<<ACTION>>{\"kind\":\"add_note\",\"text\":\"… ≤ 240 chars…\"}<<END>>",
      "Otherwise, omit the action block entirely. Never propose more than one note. Never invent images, paint colors, or supplier names you weren't given. The action block, if present, must be valid JSON.",
    ].join("\n\n");

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      // Build the OpenAI messages: system + board context + prior turns + current prompt.
      // Prior turns let the model remember what we just decided in this thread
      // — that's the single-thread Perplexity-style behavior the user asked for.
      const oiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Board state right now:\n${summary}` },
      ];
      const history = digest.messages || [];
      // Drop the trailing user turn from history if it duplicates `prompt` so
      // we don't send the same message twice.
      const tail = history[history.length - 1];
      const trimmed = tail && tail.role === "user" && tail.content === digest.prompt
        ? history.slice(0, -1)
        : history;
      for (const m of trimmed) {
        oiMessages.push({ role: m.role, content: m.content });
      }
      oiMessages.push({ role: "user", content: digest.prompt });

      const response = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages: oiMessages,
      } as any);

      const raw = response.choices[0]?.message?.content?.trim() || "Couldn't read the board well enough — try again?";

      // Parse out an optional <<ACTION>>{...}<<END>> tail. If present and well
      // formed, surface it as `actions`; the prose part stays in `text`.
      let text = raw;
      const actions: { kind: string; text: string }[] = [];
      const actionMatch = raw.match(/<<ACTION>>([\s\S]*?)<<END>>/);
      if (actionMatch) {
        try {
          const parsedAction = JSON.parse(actionMatch[1].trim());
          if (
            parsedAction &&
            parsedAction.kind === "add_note" &&
            typeof parsedAction.text === "string" &&
            parsedAction.text.trim().length > 0
          ) {
            actions.push({
              kind: "add_note",
              text: parsedAction.text.trim().slice(0, 240),
            });
          }
        } catch {
          // Bad JSON — ignore. Prose still ships.
        }
        text = raw.replace(/<<ACTION>>[\s\S]*?<<END>>/, "").trim();
      }

      res.json({
        text,
        actions: actions.length ? actions : undefined,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Board prompt error:", error?.status, error?.message, error?.response?.data || error);
      const detail = error?.message || "Unknown error";
      res.status(500).json({ error: "Failed to generate response", detail });
    }
  }));

  // ────────────────────────────────────────────────────────────────────────
  // Hero focal point: dedicated PATCH (admin/crew) and AI auto-frame.
  // ────────────────────────────────────────────────────────────────────────
  const heroPatchSchema = z.object({
    heroFocalX: z.number().min(0).max(1).optional(),
    heroFocalY: z.number().min(0).max(1).optional(),
    heroZoom: z.number().min(1).max(3).optional(),
  });

  app.patch("/api/projects/:id/hero", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }
    const projectId = Number(req.params.id);
    const existing = await storage.getProject(projectId);
    if (!existing) return res.status(404).json({ error: "Project not found" });
    const parsed = heroPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid hero values" });
    }
    const project = await storage.updateProject(projectId, parsed.data);
    res.json(project);
    broadcastProjectChange(projectId, ["project"], "updated", undefined, userId);
  }));

  const autoFrameLimits = new Map<string, number[]>();
  const AUTO_FRAME_LIMIT = 5;
  const AUTO_FRAME_WINDOW_MS = 60 * 60 * 1000;

  app.post("/api/projects/:id/hero/auto-frame", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "crew")) {
      return res.status(403).json({ error: "Admins and crew only" });
    }
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.thumbnailUrl) {
      return res.status(400).json({ error: "Project has no hero image yet" });
    }

    const key = `${projectId}:${userId}`;
    const now = Date.now();
    const stamps = (autoFrameLimits.get(key) || []).filter((t) => now - t < AUTO_FRAME_WINDOW_MS);
    if (stamps.length >= AUTO_FRAME_LIMIT) {
      return res.status(429).json({ error: "Auto-frame limit reached. Try again later." });
    }
    stamps.push(now);
    autoFrameLimits.set(key, stamps);

    let imageUrl = project.thumbnailUrl;
    if (imageUrl.startsWith("/")) {
      const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      imageUrl = `${protocol}://${host}${imageUrl}`;
    }

    let dataUrl: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const fetched = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!fetched.ok) {
        return res.status(502).json({ error: "Couldn't fetch the hero image" });
      }
      const contentType = fetched.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await fetched.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) {
        return res.status(413).json({ error: "Hero image too large to analyse" });
      }
      dataUrl = `data:${contentType};base64,${buf.toString("base64")}`;
    } catch (err: any) {
      console.error("Auto-frame fetch error:", err);
      return res.status(502).json({ error: "Couldn't fetch the hero image" });
    }

    const systemPrompt = `You help frame hero photographs for an interior-design portfolio website. Given a photograph, choose:
- focalX: horizontal focal point as 0..1 (0 = left edge, 1 = right edge)
- focalY: vertical focal point as 0..1 (0 = top, 1 = bottom)
- zoom: 1.0..2.0 (1.0 = no zoom; only zoom in if the subject is small or surrounded by dead space)
- reasoning: one short sentence explaining the choice

Prefer faces, architectural focal subjects, strong compositional anchors (a fireplace, a vignette, a window). Avoid cropping into dead space. Return only minified JSON.`;

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Pick the best focal point and zoom for this image as a hero. Return JSON: {focalX, focalY, zoom, reasoning}." },
              { type: "image_url", image_url: { url: dataUrl } },
            ] as any,
          },
        ],
      } as any);

      const raw = response.choices[0]?.message?.content?.trim() || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(502).json({ error: "Auto-frame returned invalid output" });
      }

      const clamp = (n: any, lo: number, hi: number, fallback: number) => {
        const v = typeof n === "number" ? n : Number(n);
        if (!Number.isFinite(v)) return fallback;
        return Math.min(hi, Math.max(lo, v));
      };

      const result = {
        focalX: clamp(parsed.focalX, 0, 1, 0.5),
        focalY: clamp(parsed.focalY, 0, 1, 0.5),
        zoom: clamp(parsed.zoom, 1, 2, 1),
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 240) : "",
      };
      res.json(result);
    } catch (error: any) {
      console.error("Auto-frame error:", error);
      res.status(500).json({ error: "Failed to auto-frame the image" });
    }
  }));

  app.post("/api/presence/heartbeat", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser) {
      heartbeat(userId, dbUser.firstName, dbUser.lastName, dbUser.role, dbUser.profileImageUrl);
    }
    res.json({ ok: true });
  }));

  app.get("/api/presence/online", isAuthenticated, asyncHandler(async (_req: any, res) => {
    res.json(getOnlineUsers());
  }));

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
      if (message.length > 1000) {
        return res.status(400).json({ message: "Message must be 1000 characters or less" });
      }
      const project = await storage.getProject(Number(req.params.projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const result = await notifyTeamEmail(
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

      res.json({ message: `Email sent to ${result.sent} team member(s)`, ...result });
    } catch (error: any) {
      console.error("Notify team error:", error);
      res.status(500).json({ message: error.message || "Failed to send notification" });
    }
  });

  // Activity Log
  app.get("/api/projects/:projectId/activity", isAuthenticated, asyncHandler(async (req: any, res) => {
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
  }));

  app.post("/api/activity/:activityId/view", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const activityId = Number(req.params.activityId);
    await storage.markActivityViewed(activityId, userId);
    res.json({ ok: true });
  }));


  // ── Paint Colors ──
  app.get("/api/paint-colors", isAuthenticated, asyncHandler(async (req, res) => {
    const { brand, colorFamily, search, popular } = req.query;
    const filters: { brand?: string; colorFamily?: string; search?: string; popular?: boolean } = {};
    if (typeof brand === "string") filters.brand = brand;
    if (typeof colorFamily === "string") filters.colorFamily = colorFamily;
    if (typeof search === "string" && search.trim()) filters.search = search.trim();
    if (popular === "true") filters.popular = true;
    const colors = await storage.getPaintColors(filters);
    res.json(colors);
  }));

  app.get("/api/paint-colors/families", isAuthenticated, asyncHandler(async (req, res) => {
    const brand = typeof req.query.brand === "string" ? req.query.brand : undefined;
    const families = await storage.getPaintColorFamilies(brand);
    res.json(families);
  }));

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
  app.get("/api/cost-categories", isAuthenticated, asyncHandler(async (_req, res) => {
    const categories = await storage.getCostCategories();
    res.json(categories);
  }));

  app.post("/api/cost-categories", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertCostCategorySchema.parse(req.body);
    const created = await storage.createCostCategory(input);
    res.status(201).json(created);
  }));

  app.patch("/api/cost-categories/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const id = parseInt(req.params.id);
    const input = insertCostCategorySchema.partial().parse(req.body);
    const updated = await storage.updateCostCategory(id, input);
    res.json(updated);
  }));

  app.delete("/api/cost-categories/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    await storage.deleteCostCategory(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  }));

  // Market Rates
  app.get("/api/market-rates", isAuthenticated, asyncHandler(async (req, res) => {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const activeOnly = req.query.active === "true";
    const rates = await storage.getMarketRates(categoryId, activeOnly);
    res.json(rates);
  }));

  app.post("/api/market-rates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertMarketRateSchema.parse(req.body);
    const created = await storage.createMarketRate(input);
    res.status(201).json(created);
  }));

  app.patch("/api/market-rates/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const input = insertMarketRateSchema.partial().parse(req.body);
    const updated = await storage.updateMarketRate(parseInt(req.params.id), input);
    res.json(updated);
  }));

  // Project Estimates
  //
  // Status lifecycle (admin-only inside ELM):
  //   draft     -> approved -> sent
  // Once an estimate leaves 'draft' it is permanently locked. To make changes,
  // call POST /api/estimates/:id/revise which clones it as a new draft. The
  // original is preserved as a paper trail (revisedFromId on the clone points
  // back).
  //
  // assertEstimateEditable() is the single chokepoint: any endpoint that
  // mutates an estimate or its line items must call this first. It throws a
  // 409 with `code: "estimate_locked"` when the estimate is approved or sent.
  function isEstimateLocked(status: string | null | undefined): boolean {
    return status === "approved" || status === "sent";
  }
  async function assertEstimateEditable(estimateId: number, res: any): Promise<boolean> {
    const est = await storage.getEstimate(estimateId);
    if (!est) {
      res.status(404).json({ message: "Estimate not found" });
      return false;
    }
    if (isEstimateLocked(est.status)) {
      res.status(409).json({
        message: `This estimate is ${est.status} and cannot be changed. Use Revise to create an editable copy.`,
        code: "estimate_locked",
        status: est.status,
      });
      return false;
    }
    return true;
  }
  async function assertItemEstimateEditable(estimateItemId: number, res: any): Promise<boolean> {
    const items = await db
      .select({ estimateId: estimateItems.estimateId })
      .from(estimateItems)
      .where(eqSql(estimateItems.id, estimateItemId));
    if (items.length === 0) {
      res.status(404).json({ message: "Estimate item not found" });
      return false;
    }
    return assertEstimateEditable(items[0].estimateId, res);
  }

  app.get("/api/projects/:projectId/estimates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const projectId = parseInt(req.params.projectId);
    const estimates = await storage.getProjectEstimates(projectId);
    res.json(estimates);
  }));

  app.post("/api/projects/:projectId/estimates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const projectId = parseInt(req.params.projectId);
    const input = insertProjectEstimateSchema.parse({ ...req.body, projectId, createdBy: userId });
    const created = await storage.createEstimate(input);
    res.status(201).json(created);
    broadcastProjectChange(parseInt(req.params.projectId), ["estimates"], "created", undefined, userId);
  }));

  app.get("/api/estimates/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const estimate = await storage.getEstimate(parseInt(req.params.id));
    if (!estimate) return res.status(404).json({ message: "Estimate not found" });
    res.json(estimate);
  }));

  app.patch("/api/estimates/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const estimateId = parseInt(req.params.id);
    if (!(await assertEstimateEditable(estimateId, res))) return;
    // Strip status/approvedAt/approvedBy/sentAt/revisedFromId from arbitrary PATCH;
    // those are managed by the dedicated /approve, /mark-sent, /revise endpoints
    // so the audit trail can't be bypassed via a generic update.
    const { status: _s, approvedAt: _aa, approvedBy: _ab, sentAt: _sa, revisedFromId: _rf, ...allowed } =
      (req.body || {}) as any;
    const input = insertProjectEstimateSchema.partial().parse(allowed);
    const updated = await storage.updateEstimate(estimateId, input);
    res.json(updated);
    if (updated.projectId) {
      broadcastProjectChange(updated.projectId, ["estimates"], "updated", updated.id, userId);
    }
  }));

  app.delete("/api/estimates/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const estimateId = parseInt(req.params.id);
    // Locked estimates (approved/sent) are part of the paper trail and must not
    // be deleted. Use Revise to create an editable copy if you need to change
    // anything.
    if (!(await assertEstimateEditable(estimateId, res))) return;
    await storage.deleteEstimate(estimateId);
    res.json({ message: "Deleted" });
  }));

  // ------- Status transition endpoints -------
  app.post("/api/estimates/:id/approve", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const estimateId = parseInt(req.params.id);
    const est = await storage.getEstimate(estimateId);
    if (!est) return res.status(404).json({ message: "Estimate not found" });
    if (est.status === "sent") {
      return res.status(409).json({ message: "Cannot approve an estimate that has already been sent.", code: "already_sent" });
    }
    if (est.status === "approved") {
      // Idempotent — return the existing record so the UI can refresh state.
      return res.json(est);
    }
    const updated = await storage.updateEstimate(estimateId, {
      status: "approved",
      approvedAt: new Date(),
      approvedBy: userId,
    } as any);
    res.json(updated);
    if (updated.projectId) {
      broadcastProjectChange(updated.projectId, ["estimates"], "updated", updated.id, userId);
    }
  }));

  app.post("/api/estimates/:id/mark-sent", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const estimateId = parseInt(req.params.id);
    const est = await storage.getEstimate(estimateId);
    if (!est) return res.status(404).json({ message: "Estimate not found" });
    if (est.status !== "approved") {
      return res.status(409).json({
        message: "Estimate must be approved before it can be marked as sent.",
        code: "not_approved",
        currentStatus: est.status,
      });
    }
    const updated = await storage.updateEstimate(estimateId, {
      status: "sent",
      sentAt: new Date(),
    } as any);
    res.json(updated);
    if (updated.projectId) {
      broadcastProjectChange(updated.projectId, ["estimates"], "updated", updated.id, userId);
    }
  }));

  app.post("/api/estimates/:id/revise", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const estimateId = parseInt(req.params.id);
    const source = await storage.getEstimate(estimateId);
    if (!source) return res.status(404).json({ message: "Estimate not found" });
    // Revise is intended for locked estimates, but we also allow it on drafts
    // ("clone this estimate") for convenience. The original is always preserved.
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    const cloned = await storage.cloneEstimate(estimateId, { name, createdBy: userId });
    res.status(201).json(cloned);
    if (cloned.projectId) {
      broadcastProjectChange(cloned.projectId, ["estimates"], "created", cloned.id, userId);
    }
  }));

  // Estimate Items
  app.get("/api/estimates/:id/items", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const items = await storage.getEstimateItems(parseInt(req.params.id));
    res.json(items);
  }));

  app.post("/api/estimates/:id/items", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const estimateId = parseInt(req.params.id);
    if (!(await assertEstimateEditable(estimateId, res))) return;
    const input = insertEstimateItemSchema.parse({ ...req.body, estimateId });
    const created = await storage.createEstimateItem(input);
    const estimateForBroadcast = await storage.getEstimate(estimateId);
    if (estimateForBroadcast?.projectId) {
      broadcastProjectChange(estimateForBroadcast.projectId, ["estimates", "estimate-items"], "created", created.id, userId);
    }

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
  }));

  app.patch("/api/estimate-items/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const id = parseInt(req.params.id);
    if (!(await assertItemEstimateEditable(id, res))) return;
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
    if (updated.estimateId) {
      const estimateForBroadcast = await storage.getEstimate(updated.estimateId);
      if (estimateForBroadcast?.projectId) {
        broadcastProjectChange(estimateForBroadcast.projectId, ["estimates", "estimate-items"], "updated", updated.id, userId);
      }
    }
  }));

  app.delete("/api/estimate-items/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const id = parseInt(req.params.id);
    if (!(await assertItemEstimateEditable(id, res))) return;
    await storage.deleteWarningsByItem(id);
    await storage.deleteEstimateItem(id);
    res.json({ message: "Deleted" });
  }));

  // Receipts
  app.get("/api/projects/:projectId/receipts", isAuthenticated, asyncHandler(async (req, res) => {
    const receipts = await storage.getReceipts(parseInt(req.params.projectId));
    res.json(receipts);
  }));

  app.post("/api/projects/:projectId/receipts", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    const projectId = parseInt(req.params.projectId);
    const input = insertReceiptSchema.parse({ ...req.body, projectId, createdBy: userId });
    const created = await storage.createReceipt(input);
    res.status(201).json(created);
    broadcastProjectChange(parseInt(req.params.projectId), ["receipts"], "created", undefined, userId);
  }));

  app.delete("/api/receipts/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub as string;
    const dbUser = await authStorage.getUser(userId);
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    if (dbUser.role === "client") return res.status(403).json({ message: "Crew or admin access required" });
    await storage.deleteReceipt(parseInt(req.params.id));
    res.json({ message: "Deleted" });
  }));

  // Estimate Warnings
  app.get("/api/estimates/:id/warnings", isAuthenticated, async (req, res) => {
    const warnings = await storage.getWarningsByEstimate(parseInt(String(req.params.id)));
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
      // Note: a check for dbUser.role === "client" used to live here, but the
      // guard above already returns 403 for any role that isn't admin or crew.
      // The branch was dead code (TS2367) and has been removed.
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
          inArray(canvasElements.type, ["material", "product", "surface"])
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
  app.post("/api/estimates/:estimateId/ai-analyze", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }

    const { description, answers } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "Project description is required" });
    }

    const estimateId = parseInt(req.params.estimateId as string);
    if (!(await assertEstimateEditable(estimateId, res))) return;
    const estimate = await storage.getEstimate(estimateId);
    if (!estimate) {
      return res.status(404).json({ message: "Estimate not found" });
    }

    // Project context (name, address, city, description, total budget) — used by the AI
    // to be Muskoka-aware (e.g., boat-access cottages on Lake Joseph) and to size scope
    // realistically given the booked budget.
    const project = await storage.getProject(estimate.projectId);

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

    // Real supplier prices (Muskoka Lumber receipts + other suppliers).
    // We pass these to the AI so it can itemize against actual SKUs when confident,
    // instead of always falling back to category-typical rates.
    const allSuppliers = await storage.getSuppliers();
    const supplierById = new Map(allSuppliers.map(s => [s.id, s]));
    const allSupplierPrices = await storage.getSupplierPrices();
    // Token-conscious: cap to first 80 SKUs (currently ~58 from Muskoka Lumber + a handful
    // from other suppliers). Sorted by category so AI can scan by trade.
    const supplierPriceLines = allSupplierPrices
      .slice(0, 80)
      .map(p => {
        const supplierName = supplierById.get(p.supplierId)?.name || "Unknown";
        const cat = categories.find(c => c.id === p.categoryId);
        const catName = cat ? cat.name : "Uncategorized";
        const code = p.productCode ? ` [${p.productCode}]` : "";
        return `- ${supplierName}: ${p.productName}${code} — $${p.unitPrice}/${p.unitType} (${catName})`;
      });

    const projectContextLines: string[] = [];
    if (project) {
      projectContextLines.push(`- Project name: ${project.name}`);
      if (project.address) projectContextLines.push(`- Address: ${project.address}${project.city ? ", " + project.city : ""}`);
      else if (project.city) projectContextLines.push(`- City: ${project.city}`);
      if (project.description) projectContextLines.push(`- Project description: ${project.description}`);
      if (project.totalBudget && project.totalBudget > 0) {
        projectContextLines.push(`- Booked total budget (CAD): $${project.totalBudget.toLocaleString("en-CA")}`);
      }
      if (project.phase) projectContextLines.push(`- Current phase: ${project.phase}`);
    }

    // Optional: if the user already answered clarifying questions in a previous round,
    // pass them through so the AI doesn't re-ask.
    const answersBlock = Array.isArray(answers) && answers.length > 0
      ? `\n\nClarifying answers from the previous round (treat as authoritative):\n${answers.map((a: any, i: number) => `${i + 1}. Q: ${a?.question ?? ""}\n   A: ${a?.answer ?? ""}`).join("\n")}`
      : "";

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    });

    const systemPrompt = `You are an expert construction estimator specializing in high-end Muskoka, Ontario cottage renovations (Port Carling, Bracebridge, Bala, MacTier, Huntsville). About 20% of work is boat-access / island cottages on Lakes Muskoka, Rosseau, and Joseph.
Given a project description, analyze the scope and estimate square footage or unit quantities for each relevant trade category.

${projectContextLines.length > 0 ? `Project context (this estimate is for the project below):\n${projectContextLines.join("\n")}\n\n` : ""}Available categories with current market rates (CAD):
${categoryInfo.map(c => `- ${c.name} (ID: ${c.id}, Unit: ${c.unitType === "sq_ft" ? "per sq ft" : "per unit"}${c.typicalRate ? `, Typical: $${c.typicalRate}` : ""}): ${c.description}`).join("\n")}

${supplierPriceLines.length > 0 ? `Real supplier prices on file (use these as a sanity check and reference them in notes when applicable):\n${supplierPriceLines.join("\n")}\n\n` : ""}Rules:
- Only include categories that are relevant to the described project scope
- For sq_ft categories, estimate the square footage that would need that trade work
- For unit-based categories (Windows & Doors, Cabinetry, Septic & Well), estimate the number of units
- Use the typical market rate for unit cost unless the description suggests premium or budget finishes
- If premium/luxury is mentioned, use a rate between typical and high
- If budget-conscious is mentioned, use a rate between low and typical
- When confident about specific materials (e.g. framing lumber, insulation, drywall), reference the supplier prices above in your notes (format: "Muskoka Lumber 2x4x8 SPF @ $X.XX/each")
- Be realistic for Muskoka cottage renovation context — boat-access projects carry a 15-25% premium for materials and labour due to barge/crane logistics
- Notes should be specific and verbose: explain assumptions about quantities, finish level, and any Muskoka-specific factors (boat access, winter premium, septic/well, shoreline regulations)

If the description is missing structurally critical information that would materially change the estimate (e.g. total square footage, number of bedrooms/bathrooms, finish level, boat-access vs road-access), DO NOT guess — instead return a JSON object with up to 3 short clarifying questions and an empty items array:
{
  "items": [],
  "questions": ["<short question 1>", "<short question 2>"],
  "summary": "<1 sentence: what's missing>"
}

Otherwise, respond with valid JSON only, no markdown. Format:
{
  "items": [
    {
      "categoryId": <number>,
      "categoryName": "<string>",
      "unitType": "sq_ft" or "board",
      "quantity": "<string number>",
      "unitCost": "<string number>",
      "materialCost": "<string number - estimate 30-40% of line total for material>",
      "notes": "<verbose explanation: quantity reasoning, finish level, supplier SKU reference if applicable, Muskoka factors>"
    }
  ],
  "summary": "<2-3 sentence summary of scope, finish level, and key assumptions>"
}${answersBlock}`;

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

      // If the AI asked clarifying questions, return them so the UI can prompt the user
      // for answers and call this endpoint again with the answers in the body.
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .filter((q: any) => typeof q === "string" && q.trim().length > 0)
            .slice(0, 5)
            .map((q: any) => String(q))
        : [];

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

      res.json({
        items: validItems,
        questions,
        summary: String(parsed.summary || ""),
      });
    } catch (error: any) {
      console.error("AI analysis error:", error);
      res.status(500).json({ message: "Failed to analyze project scope" });
    }
  }));

  // Suggest Material Alternatives
  app.post("/api/estimates/:id/suggest-alternatives", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || (user.role !== "admin" && user.role !== "crew")) {
        return res.status(403).json({ message: "Admin or crew only" });
      }

      const estimateId = Number(req.params.id);
      const { budget } = req.body;

      if (!budget) {
        return res.status(400).json({ message: "Budget is required" });
      }

      const budgetNum = parseFloat(budget);
      if (isNaN(budgetNum)) {
        return res.status(400).json({ message: "Invalid budget value" });
      }

      // Fetch estimate and items
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ message: "Estimate not found" });
      }

      const items = await storage.getEstimateItems(estimateId);
      const categories = await storage.getCostCategories();
      const marketRates = await storage.getAllMarketRates();

      // Calculate current total and prepare item details
      const markupRate = parseFloat(estimate.markupPercent || "25") / 100;
      let currentTotal = 0;
      const itemDetails: any[] = [];

      for (const item of items) {
        const qty = parseFloat(item.quantity || "0");
        const unitCost = parseFloat(item.unitCost || "0");
        const materialCost = parseFloat(item.materialCost || "0");
        
        const lineTotal = qty * unitCost + (estimate.markupEnabled ? materialCost * markupRate : 0);
        currentTotal += lineTotal;

        const category = categories.find(c => c.id === item.categoryId);
        itemDetails.push({
          id: item.id,
          categoryName: category?.name || item.customCategory || "Unknown",
          quantity: qty,
          unitType: item.unitType,
          unitCost: unitCost,
          materialCost: materialCost,
          lineTotal: lineTotal,
          notes: item.notes,
        });
      }

      // Sort by line total descending to identify expensive items
      const sortedItems = [...itemDetails].sort((a, b) => b.lineTotal - a.lineTotal);

      // Build context for AI
      const categoryInfo = categories.map(c => `- ${c.name}: ${c.description}`).join("\n");
      const itemsInfo = sortedItems.map((item, idx) => 
        `${idx + 1}. [ID: ${item.id}] ${item.categoryName} (${item.quantity} ${item.unitType} @ $${item.unitCost}/unit): $${item.lineTotal.toFixed(2)}`
      ).join("\n");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const systemPrompt = `You are an expert construction estimator specializing in high-end Muskoka, Ontario cottage renovations.
You help clients reduce project costs by suggesting more affordable material alternatives while maintaining quality.

Available renovation categories (for context):
${categoryInfo}

Current estimate details:
- Current total cost: $${currentTotal.toFixed(2)} CAD
- Client budget: $${budgetNum.toFixed(2)} CAD
- Over budget by: $${Math.max(0, currentTotal - budgetNum).toFixed(2)} CAD

Current line items (ordered by cost):
${itemsInfo}

Your task: Suggest material/specification alternatives for 2-4 of the most expensive items that could reduce costs while maintaining reasonable quality standards for a Muskoka cottage renovation. 

For each suggestion:
- Target items that have the most significant cost impact
- Suggest realistic downgrade options (e.g., standard instead of premium materials, fewer units, different finish)
- Provide specific cost savings and tradeoffs

Respond with valid JSON only, no markdown:
{
  "suggestions": [
    {
      "itemId": <number - ID of item to replace>,
      "alternativeName": "<string - name of alternative>",
      "alternativeDescription": "<string - detailed description>",
      "estimatedCost": "<string number - new unit cost>",
      "estimatedSavings": "<string number - total savings for this line>",
      "tradeoffs": "<string - brief explanation of quality/appearance tradeoffs>"
    }
  ],
  "totalPotentialSavings": "<string number>",
  "summary": "<string - brief summary of all suggestions and final estimated total>"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Please analyze the estimate and suggest cost-saving alternatives." },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      const parsed = JSON.parse(content);

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        return res.status(422).json({ message: "AI returned invalid format" });
      }

      const validSuggestions = parsed.suggestions
        .filter((s: any) => s.itemId && s.alternativeName && s.estimatedCost && s.estimatedSavings)
        .map((s: any) => ({
          itemId: Number(s.itemId),
          alternativeName: String(s.alternativeName),
          alternativeDescription: String(s.alternativeDescription || ""),
          estimatedCost: String(parseFloat(s.estimatedCost) || 0),
          estimatedSavings: String(parseFloat(s.estimatedSavings) || 0),
          tradeoffs: String(s.tradeoffs || ""),
        }));

      const totalSavings = validSuggestions.reduce((sum: number, s: any) => sum + parseFloat(s.estimatedSavings), 0);

      res.json({
        suggestions: validSuggestions,
        totalPotentialSavings: String(totalSavings.toFixed(2)),
        summary: String(parsed.summary || ""),
      });
    } catch (error: any) {
      console.error("Suggest alternatives error:", error);
      res.status(500).json({ message: "Failed to suggest alternatives" });
    }
  });

  // Social Media Post Generator
  const socialMediaGenerateSchema = z.object({
    projectId: z.number({ coerce: true }).int().positive(),
    platform: z.enum(["instagram", "facebook"]).default("instagram"),
    tone: z.string().max(100).default("Warm"),
    focus: z.string().max(1000).default(""),
    random: z.boolean().optional(),
    photoId: z.number().int().positive().optional(),
  });

  app.post("/api/social-media/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }

      const parsed = socialMediaGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
      }
      const { projectId, platform, tone, focus } = parsed.data;

      const project = await storage.getProject(Number(projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const [projectMilestones, projectPhotos] = await Promise.all([
        storage.getMilestones(project.id),
        storage.getPhotos(project.id),
      ]);
      const milestoneList = projectMilestones
        .map((m: any) => `- ${m.title}${m.completed ? " (completed)" : ""}`)
        .join("\n");

      let photoContext = `\nProject photos: ${projectPhotos.length} photo(s) available.`;
      if (projectPhotos.length > 0) {
        const photoDescriptions = projectPhotos
          .slice(0, 20)
          .map((p: any) => {
            const parts: string[] = [];
            if (p.caption) parts.push(p.caption);
            if (p.tags && p.tags.length > 0) parts.push(`tags: ${p.tags.join(", ")}`);
            if (p.isShowcase) parts.push("(showcase)");
            if (p.isBeforeAfter) parts.push("(before/after)");
            return parts.length > 0 ? `- ${parts.join(" | ")}` : null;
          })
          .filter(Boolean)
          .join("\n");
        photoContext += `${photoDescriptions ? `\nPhoto details:\n${photoDescriptions}` : ""}
The post should reference visual content where appropriate (e.g., "see the stunning reveal", "swipe through the transformation").`;
      } else {
        photoContext += "\nNo photos have been uploaded yet, so do not reference specific images.";
      }

      const platformName = platform === "facebook" ? "Facebook" : "Instagram";
      const toneStyle = tone || "Warm";
      const focusHint = focus ? `\nSpecific focus the user wants to highlight: ${focus}` : "";

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const systemPrompt = `You are a social media copywriter for Aster & Spruce Living, a high-end Muskoka cottage renovation company based in Ontario, Canada. 
You write engaging, authentic posts that showcase beautiful renovation work and the Muskoka lifestyle.

Brand voice: Warm minimalist, premium quality, nature-inspired, community-focused.
Always use Canadian English spelling (colour, favourite, centre, etc.).

Project details:
- Name: ${project.name}
- Description: ${project.description || "No description provided"}
- Status: ${project.status}
- Address: ${project.address || "Muskoka, Ontario"}
${milestoneList ? `\nProject milestones:\n${milestoneList}` : ""}${photoContext}
${focusHint}

Platform: ${platformName}
Tone: ${toneStyle}

Platform guidelines:
- Instagram: Write a longer, storytelling-style caption (150-300 words). Include 15-25 relevant hashtags at the end. Use line breaks for readability. Include a call to action.
- Facebook: Write a shorter, conversational post (50-120 words). Use 3-5 hashtags maximum. Be more direct and community-oriented.

Respond with valid JSON only, no markdown:
{
  "title": "<short 3-5 word title for the post>",
  "copy": "<the full social media post text including hashtags>"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write a ${platformName} post with a ${toneStyle} tone for the "${project.name}" project.` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      const aiResult = JSON.parse(content);
      const postTitle = String(aiResult.title || project.name);
      const postCopy = String(aiResult.copy || "");
      const postPlatform = platformName.toLowerCase();

      const selectedPhotoId = parsed.data.photoId;
      let pairedPhoto = selectedPhotoId ? projectPhotos.find((p: any) => p.id === selectedPhotoId) : null;
      if (!pairedPhoto && projectPhotos.length > 0) {
        pairedPhoto = projectPhotos.find((p: any) => p.isShowcase) || projectPhotos[0];
      }

      const savedPost = await storage.createSocialPost({
        projectId: project.id,
        title: postTitle,
        copy: postCopy,
        platform: postPlatform,
        tone: parsed.data.tone || "Warm",
        photoUrl: pairedPhoto?.url || null,
        photoId: pairedPhoto?.id || null,
        status: "draft",
      });

      res.json({
        id: savedPost.id,
        title: postTitle,
        copy: postCopy,
        platform: postPlatform,
        photos: projectPhotos.map((p: any) => ({
          id: p.id,
          url: p.url,
          caption: p.caption || null,
          tags: p.tags || [],
          isShowcase: p.isShowcase || false,
          isBeforeAfter: p.isBeforeAfter || false,
        })),
        savedPostId: savedPost.id,
        pairedPhotoId: pairedPhoto?.id || null,
        pairedPhotoUrl: pairedPhoto?.url || null,
      });
    } catch (error: any) {
      console.error("Social media generation error:", error);
      res.status(500).json({ message: "Failed to generate social media post" });
    }
  });

  // Social Posts CRUD
  app.get("/api/social-posts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const filters: any = {};
      if (req.query.projectId) filters.projectId = Number(req.query.projectId);
      if (req.query.platform) filters.platform = String(req.query.platform);
      if (req.query.status) filters.status = String(req.query.status);
      const unseenMilestoneCount = await storage.getUnseenMilestoneCount();
      const posts = await storage.getSocialPosts(filters);
      if (req.query.markSeen === "true" && unseenMilestoneCount > 0) {
        await storage.markMilestoneDraftsSeen();
      }
      res.json({ posts, unseenMilestoneCount: req.query.markSeen === "true" ? 0 : unseenMilestoneCount });
    } catch { res.status(500).json({ message: "Failed to fetch social posts" }); }
  });

  app.get("/api/social-posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const post = await storage.getSocialPost(Number(req.params.id));
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(post);
    } catch { res.status(500).json({ message: "Failed to fetch social post" }); }
  });

  app.patch("/api/social-posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const updateSchema = z.object({
        title: z.string().max(500).optional(),
        copy: z.string().max(10000).optional(),
        platform: z.enum(["instagram", "facebook"]).optional(),
        tone: z.string().max(200).optional(),
        photoUrl: z.string().nullable().optional(),
        photoId: z.number().nullable().optional(),
        status: z.enum(["draft", "ready", "posted"]).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
      const postId = Number(req.params.id);
      if (parsed.data.photoId != null && parsed.data.photoUrl != null) {
        const post = await storage.getSocialPost(postId);
        if (post) {
          const photos = await storage.getPhotos(post.projectId);
          const matchedPhoto = photos.find((p: any) => p.id === parsed.data.photoId);
          if (!matchedPhoto || matchedPhoto.url !== parsed.data.photoUrl) {
            return res.status(400).json({ message: "Photo does not match project" });
          }
        }
      }
      const updates: any = { ...parsed.data };
      if (parsed.data.status === "posted") updates.postedAt = new Date();
      const updated = await storage.updateSocialPost(postId, updates);
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to update social post" }); }
  });

  app.delete("/api/social-posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
      await storage.deleteSocialPost(Number(req.params.id));
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Failed to delete social post" }); }
  });

  // Batch generate social posts
  app.post("/api/social-media/batch-generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const batchSchema = z.object({
        projectId: z.number({ coerce: true }).int().positive(),
        count: z.number().int().min(1).max(5).default(3),
      });
      const parsed = batchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

      const project = await storage.getProject(parsed.data.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const [projectMilestones, projectPhotos] = await Promise.all([
        storage.getMilestones(project.id),
        storage.getPhotos(project.id),
      ]);
      const milestoneList = projectMilestones.map((m: any) => `- ${m.title}${m.completed ? " (completed)" : ""}`).join("\n");

      let photoContext = `\nProject photos: ${projectPhotos.length} photo(s) available.`;
      if (projectPhotos.length > 0) {
        const photoDescriptions = projectPhotos.slice(0, 20).map((p: any) => {
          const parts: string[] = [];
          if (p.caption) parts.push(p.caption);
          if (p.tags && p.tags.length > 0) parts.push(`tags: ${p.tags.join(", ")}`);
          if (p.isShowcase) parts.push("(showcase)");
          if (p.isBeforeAfter) parts.push("(before/after)");
          return parts.length > 0 ? `- ${parts.join(" | ")}` : null;
        }).filter(Boolean).join("\n");
        photoContext += photoDescriptions ? `\nPhoto details:\n${photoDescriptions}` : "";
      }

      const count = parsed.data.count;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const batchPrompt = `You are a social media copywriter for Aster & Spruce Living, a high-end Muskoka cottage renovation company based in Ontario, Canada.
Brand voice: Warm minimalist, premium quality, nature-inspired, community-focused.
Always use Canadian English spelling (colour, favourite, centre, etc.).

Project details:
- Name: ${project.name}
- Description: ${project.description || "No description provided"}
- Status: ${project.status}
- Address: ${project.address || "Muskoka, Ontario"}
${milestoneList ? `\nProject milestones:\n${milestoneList}` : ""}${photoContext}

Generate exactly ${count} unique social media posts for this project. Each post should have a different angle, tone, or platform.
Mix between Instagram (longer, storytelling, 15-25 hashtags) and Facebook (shorter, conversational, 3-5 hashtags).

Respond with valid JSON only:
{
  "posts": [
    { "title": "<3-5 word title>", "copy": "<full post text>", "platform": "instagram|facebook", "tone": "<tone used>" }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: batchPrompt },
          { role: "user", content: `Generate ${count} varied social media posts for "${project.name}".` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ message: "No response from AI" });

      const aiResult = JSON.parse(content);
      const posts = aiResult.posts || [];

      const savedPosts = [];
      for (const post of posts) {
        const pairedPhoto = projectPhotos.length > 0
          ? projectPhotos[Math.floor(Math.random() * projectPhotos.length)]
          : null;
        const saved = await storage.createSocialPost({
          projectId: project.id,
          title: String(post.title || project.name),
          copy: String(post.copy || ""),
          platform: String(post.platform || "instagram"),
          tone: String(post.tone || "Warm"),
          photoUrl: pairedPhoto?.url || null,
          photoId: pairedPhoto?.id || null,
          status: "draft",
        });
        savedPosts.push(saved);
      }

      res.json({ posts: savedPosts });
    } catch (error: any) {
      console.error("Batch generation error:", error);
      res.status(500).json({ message: "Failed to batch generate posts" });
    }
  });

  // Before/After post builder
  app.post("/api/social-media/before-after", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const baSchema = z.object({
        projectId: z.number({ coerce: true }).int().positive(),
        platform: z.enum(["instagram", "facebook"]).default("instagram"),
      });
      const parsed = baSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

      const project = await storage.getProject(parsed.data.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const projectPhotos = await storage.getPhotos(project.id);
      const baPhotos = projectPhotos.filter((p: any) => p.isBeforeAfter);
      if (baPhotos.length === 0) return res.status(400).json({ message: "No before/after photos found for this project" });

      const photoDescriptions = baPhotos.slice(0, 10).map((p: any) => {
        const parts: string[] = [];
        if (p.caption) parts.push(p.caption);
        if (p.tags && p.tags.length > 0) parts.push(`tags: ${p.tags.join(", ")}`);
        return parts.length > 0 ? `- ${parts.join(" | ")}` : "- (untitled photo)";
      }).join("\n");

      const platformName = parsed.data.platform === "facebook" ? "Facebook" : "Instagram";

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const prompt = `You are a social media copywriter for Aster & Spruce Living, a high-end Muskoka cottage renovation company.
Always use Canadian English spelling (colour, favourite, centre, etc.).
Brand voice: Warm minimalist, premium quality, nature-inspired.

This is a BEFORE & AFTER TRANSFORMATION post for ${platformName}.
Project: ${project.name} — ${project.description || "A beautiful renovation"}
Location: ${project.address || "Muskoka, Ontario"}

Before/after photos:
${photoDescriptions}

Write a compelling transformation reveal post that builds anticipation, highlights the dramatic change, and showcases the craftsmanship.
${platformName === "Instagram" ? "Include 15-25 hashtags. Use storytelling (150-300 words)." : "Keep it concise (50-120 words). Use 3-5 hashtags."}

Respond with valid JSON only:
{ "title": "<3-5 word title>", "copy": "<full post text>" }`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Write a before/after transformation post for "${project.name}".` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ message: "No response from AI" });

      const aiResult = JSON.parse(content);
      const pairedPhoto = baPhotos[0];

      const savedPost = await storage.createSocialPost({
        projectId: project.id,
        title: String(aiResult.title || "Transformation Reveal"),
        copy: String(aiResult.copy || ""),
        platform: platformName.toLowerCase(),
        tone: "Transformation",
        photoUrl: pairedPhoto?.url || null,
        photoId: pairedPhoto?.id || null,
        status: "draft",
      });

      res.json({
        ...savedPost,
        photos: baPhotos.map((p: any) => ({
          id: p.id, url: p.url, caption: p.caption, tags: p.tags || [],
          isShowcase: false, isBeforeAfter: true,
        })),
      });
    } catch (error: any) {
      console.error("Before/after generation error:", error);
      res.status(500).json({ message: "Failed to generate before/after post" });
    }
  });

  // Seasonal prompts
  app.get("/api/social-media/seasonal-prompts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const now = new Date();
      const month = now.getMonth();

      const allPrompts = [
        { id: "spring-reno", months: [2, 3, 4], title: "Spring Renovation Kickoff", description: "Fresh starts and new projects — showcase spring renovation beginnings.", icon: "🌱", theme: "renewal" },
        { id: "cottage-opener", months: [4, 5], title: "Cottage Season Opener", description: "Muskoka comes alive — highlight cottage-ready transformations.", icon: "🏡", theme: "lakeside" },
        { id: "summer-living", months: [5, 6, 7], title: "Summer Cottage Living", description: "Outdoor entertaining, lake views, and summer spaces.", icon: "☀️", theme: "outdoor" },
        { id: "summer-entertaining", months: [6, 7], title: "Summer Entertaining Spaces", description: "Decks, patios, and gathering areas perfect for hosting.", icon: "🍽️", theme: "hosting" },
        { id: "fall-prep", months: [8, 9], title: "Autumn Cottage Prep", description: "Getting spaces cozy and ready for the fall season.", icon: "🍂", theme: "cozy" },
        { id: "thanksgiving", months: [9], title: "Thanksgiving Gathering Spaces", description: "Dining rooms and kitchens ready for Canadian Thanksgiving.", icon: "🦃", theme: "gathering" },
        { id: "winter-cozy", months: [10, 11], title: "Winter Cottage Cozy", description: "Fireplaces, warm interiors, and winter-ready cottages.", icon: "❄️", theme: "warmth" },
        { id: "holiday-entertaining", months: [11, 0], title: "Holiday Entertaining", description: "Stunning spaces for holiday celebrations and gatherings.", icon: "🎄", theme: "celebration" },
        { id: "new-year", months: [0, 1], title: "New Year, New Space", description: "Fresh renovation inspiration for the new year.", icon: "✨", theme: "fresh-start" },
        { id: "winter-escape", months: [1, 2], title: "Winter Escape Planning", description: "Dream cottage renovations for the coming season.", icon: "🏔️", theme: "planning" },
      ];

      const currentPrompts = allPrompts.filter(p => p.months.includes(month));
      res.json(currentPrompts);
    } catch { res.status(500).json({ message: "Failed to fetch seasonal prompts" }); }
  });

  // Generate from seasonal prompt
  app.post("/api/social-media/seasonal-generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const seasonalSchema = z.object({
        projectId: z.number({ coerce: true }).int().positive(),
        platform: z.enum(["instagram", "facebook"]).default("instagram"),
        seasonalTheme: z.string().max(200),
        seasonalTitle: z.string().max(200),
      });
      const parsed = seasonalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

      const project = await storage.getProject(parsed.data.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const [projectMilestones, projectPhotos] = await Promise.all([
        storage.getMilestones(project.id),
        storage.getPhotos(project.id),
      ]);

      const platformName = parsed.data.platform === "facebook" ? "Facebook" : "Instagram";

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const prompt = `You are a social media copywriter for Aster & Spruce Living, a high-end Muskoka cottage renovation company.
Always use Canadian English spelling (colour, favourite, centre, etc.).
Brand voice: Warm minimalist, premium quality, nature-inspired.

SEASONAL THEME: ${parsed.data.seasonalTitle}
This post should tie the project to the seasonal theme of "${parsed.data.seasonalTheme}" — connecting the renovation work to the time of year, Muskoka lifestyle, and the feeling of the season.

Project: ${project.name} — ${project.description || "A beautiful renovation"}
Location: ${project.address || "Muskoka, Ontario"}
Milestones: ${projectMilestones.map((m: any) => m.title).join(", ") || "None"}

Platform: ${platformName}
${platformName === "Instagram" ? "Write a storytelling-style caption (150-300 words) with 15-25 hashtags." : "Write a conversational post (50-120 words) with 3-5 hashtags."}

Respond with valid JSON only:
{ "title": "<3-5 word title>", "copy": "<full post text>" }`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Write a seasonal ${parsed.data.seasonalTitle} post for "${project.name}".` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ message: "No response from AI" });

      const aiResult = JSON.parse(content);
      const pairedPhoto = projectPhotos.length > 0
        ? (projectPhotos.find((p: any) => p.isShowcase) || projectPhotos[0])
        : null;

      const savedPost = await storage.createSocialPost({
        projectId: project.id,
        title: String(aiResult.title || parsed.data.seasonalTitle),
        copy: String(aiResult.copy || ""),
        platform: platformName.toLowerCase(),
        tone: parsed.data.seasonalTitle,
        photoUrl: pairedPhoto?.url || null,
        photoId: pairedPhoto?.id || null,
        status: "draft",
      });

      res.json(savedPost);
    } catch (error: any) {
      console.error("Seasonal generation error:", error);
      res.status(500).json({ message: "Failed to generate seasonal post" });
    }
  });

  // Google Drive export — direct googleapis OAuth (no Replit connector).
  app.post("/api/social-posts/export-drive", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const exportSchema = z.object({
        postIds: z.array(z.number().int().positive()).max(20),
      });
      const parsed = exportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
      if (parsed.data.postIds.length === 0) return res.json({ exported: [], folderId: null, folderName: "Aster & Spruce Social" });

      const drive = await import("./integrations/googleDrive");
      if (!drive.isDriveConfigured()) {
        return res.status(503).json({
          message: "Google Drive export is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.",
        });
      }

      const folderName = "Aster & Spruce Social";
      let folderId: string;
      try {
        folderId = await drive.ensureFolder(folderName);
      } catch (err) {
        console.error("Drive folder lookup/create failed:", err);
        return res.status(502).json({ message: "Could not connect to Google Drive" });
      }

      const exported: any[] = [];
      for (const postId of parsed.data.postIds) {
        const post = await storage.getSocialPost(postId);
        if (!post) continue;

        const project = await storage.getProject(post.projectId);
        const projectName = project?.name || "Unknown Project";
        const timestamp = new Date().toISOString().slice(0, 10);
        const baseName = `${projectName} - ${post.title} (${post.platform}) ${timestamp}`;

        const captionContent = `${post.title}\n\nPlatform: ${post.platform}\nTone: ${post.tone || "—"}\nProject: ${projectName}\n\n---\n\n${post.copy}`;

        let captionFileId: string | null = null;
        try {
          captionFileId = await drive.uploadText({
            folderId,
            name: `${baseName}.txt`,
            content: captionContent,
          });
        } catch (err) {
          console.error("Caption upload to Drive failed for post", postId, err);
        }

        let photoFileId: string | null = null;
        if (post.photoUrl && post.photoId) {
          try {
            const projectPhotos2 = await storage.getPhotos(post.projectId);
            const validPhoto = projectPhotos2.find((p: any) => p.id === post.photoId && p.url === post.photoUrl);
            if (!validPhoto) throw new Error("Photo URL does not match a valid project photo");
            const uploadsRoot = path.resolve(process.cwd(), "uploads");
            const filename = path.basename(post.photoUrl);
            const photoPath = path.resolve(uploadsRoot, filename);
            if (photoPath.startsWith(uploadsRoot + path.sep) && fs.existsSync(photoPath)) {
              const imgBuffer = fs.readFileSync(photoPath);
              const extLower = path.extname(photoPath).toLowerCase();
              const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
              const imgContentType = mimeMap[extLower] || "image/jpeg";
              const ext = imgContentType.includes("png") ? "png" : imgContentType.includes("webp") ? "webp" : "jpg";
              photoFileId = await drive.uploadBuffer({
                folderId,
                name: `${baseName}.${ext}`,
                buffer: imgBuffer,
                mimeType: imgContentType,
              });
            }
          } catch (photoErr) {
            console.error("Photo upload to Drive failed for post", postId, photoErr);
          }
        }

        if (captionFileId || photoFileId) {
          exported.push({ postId, captionFileId, photoFileId, fileName: `${baseName}.txt` });
        } else {
          exported.push({ postId, error: "Upload failed" });
        }
      }

      res.json({ exported, folderId, folderName });
    } catch (error: any) {
      console.error("Google Drive export error:", error);
      res.status(500).json({ message: "Failed to export to Google Drive" });
    }
  });

  // Crew Rates
  app.get("/api/crew-rates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }
    const rates = await storage.getCrewRates();
    res.json(rates);
  }));

  app.post("/api/crew-rates", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertCrewRateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const created = await storage.createCrewRate(parsed.data);
    res.json(created);
  }));

  app.patch("/api/crew-rates/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertCrewRateSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const updated = await storage.updateCrewRate(parseInt(req.params.id), parsed.data);
    res.json(updated);
  }));

  app.delete("/api/crew-rates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    await storage.deleteCrewRate(parseInt(req.params.id));
    res.json({ success: true });
  });

  // Receipt Scanning with OpenAI Vision
  app.post("/api/projects/:id/receipts/scan", isAuthenticated, async (req: any, res) => {
    let tempImagePath: string | null = null;
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ message: "Image URL is required" });

      const systemPrompt = `You are a receipt parsing assistant. Extract all information from the receipt image and respond with valid JSON only using this exact shape:
{
  "vendor": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "lineItems": [
    { "description": "string", "qty": number, "unitPrice": number, "subtotal": number }
  ]
}
Rules:
- lineItems must list every individual product/service line on the receipt with its quantity, unit price, and subtotal.
- If quantity is not shown, default to 1.
- If unit price cannot be determined but subtotal is present, set unitPrice = subtotal / qty.
- amount is the receipt grand total (including tax if shown).
- date format must be YYYY-MM-DD. If not visible, use today's date.
- All numbers must be plain numbers (no currency symbols).`;

      // Resolve the actual image URL to send to OpenAI
      let scanUrl = imageUrl;
      const isPdf = imageUrl.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        // Convert first PDF page to JPEG using pdftoppm
        const filePath = path.join(process.cwd(), imageUrl.replace(/^\//, ""));
        const tempBase = path.join("/tmp", `receipt_${randomUUID()}`);
        await new Promise<void>((resolve, reject) => {
          execFile("pdftoppm", ["-jpeg", "-r", "200", "-f", "1", "-l", "1", filePath, tempBase], (err) => {
            if (err) reject(err); else resolve();
          });
        });
        // pdftoppm outputs tempBase-N.jpg where N has as many digits as needed for page count
        const tmpDir = path.dirname(tempBase);
        const tmpPrefix = path.basename(tempBase);
        const allFiles = fs.readdirSync(tmpDir)
          .filter(f => f.startsWith(tmpPrefix) && f.endsWith(".jpg"))
          .map(f => path.join(tmpDir, f));
        const found = allFiles[0] ?? null;
        if (!found) throw new Error("PDF conversion produced no output");
        tempImagePath = found;
        const imgBuffer = fs.readFileSync(found);
        scanUrl = `data:image/jpeg;base64,${imgBuffer.toString("base64")}`;
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Parse this receipt and extract every line item:" },
              { type: "image_url", image_url: { url: scanUrl } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ message: "No response from AI" });
      res.json(JSON.parse(content));
    } catch (error) {
      console.error("Receipt scan error:", error);
      res.status(500).json({ message: "Failed to scan receipt" });
    } finally {
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }
    }
  });

  // Subcontractors
  app.get("/api/subcontractors", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Admin or crew only" });
    }
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const subs = await storage.getSubcontractors(categoryId);
    res.json(subs);
  }));

  app.post("/api/subcontractors", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertSubcontractorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const created = await storage.createSubcontractor(parsed.data);
    res.json(created);
  }));

  app.patch("/api/subcontractors/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const parsed = insertSubcontractorSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
    const updated = await storage.updateSubcontractor(parseInt(req.params.id), parsed.data);
    res.json(updated);
  }));

  app.delete("/api/subcontractors/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    await storage.deleteSubcontractor(parseInt(req.params.id));
    res.json({ success: true });
  }));

  // === Suppliers ===
  app.get("/api/suppliers", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Access denied" });
    }
    const suppliers = await storage.getSuppliers();
    res.json(suppliers);
  }));

  app.post("/api/suppliers", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertSupplierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid supplier data", errors: parsed.error.errors });
    const supplier = await storage.createSupplier(parsed.data);
    res.status(201).json(supplier);
  }));

  app.patch("/api/suppliers/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertSupplierSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid supplier data", errors: parsed.error.errors });
    const supplier = await storage.updateSupplier(parseInt(req.params.id), parsed.data);
    res.json(supplier);
  }));

  app.delete("/api/suppliers/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteSupplier(parseInt(req.params.id));
    res.json({ message: "Supplier deleted" });
  }));

  // === Supplier Prices ===
  app.get("/api/supplier-prices", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "crew")) {
      return res.status(403).json({ message: "Access denied" });
    }
    const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
    const prices = await storage.getSupplierPrices(supplierId);
    res.json(prices);
  }));

  app.post("/api/supplier-prices", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertSupplierPriceSchema.safeParse({ ...req.body, createdBy: userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalid price data", errors: parsed.error.errors });
    const price = await storage.createSupplierPrice(parsed.data);
    res.status(201).json(price);
  }));

  app.patch("/api/supplier-prices/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertSupplierPriceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid price data", errors: parsed.error.errors });
    const price = await storage.updateSupplierPrice(parseInt(req.params.id), parsed.data);
    res.json(price);
  }));

  app.delete("/api/supplier-prices/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteSupplierPrice(parseInt(req.params.id));
    res.json({ message: "Supplier price deleted" });
  }));

  // Bulk-create supplier prices (used when importing receipt line items)
  app.post("/api/supplier-prices/bulk", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "No items provided" });
    const created = [];
    for (const item of items) {
      const parsed = insertSupplierPriceSchema.safeParse({ ...item, createdBy: userId });
      if (!parsed.success) continue;
      const price = await storage.createSupplierPrice(parsed.data);
      created.push(price);
    }
    res.status(201).json(created);
  }));

  // Fetch live price from a product URL using AI
  app.post("/api/supplier-prices/:id/fetch-price", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const priceId = parseInt(req.params.id);
    const allPrices = await storage.getSupplierPrices();
    const priceEntry = allPrices.find(p => p.id === priceId);
    if (!priceEntry) return res.status(404).json({ message: "Price not found" });
    if (!priceEntry.productUrl) return res.status(400).json({ message: "No product URL set for this entry" });
    let pageText = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(priceEntry.productUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceBot/1.0)" },
      });
      clearTimeout(timeout);
      const html = await pageRes.text();
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
    } catch {
      return res.status(400).json({ message: "Failed to fetch product page — check the URL" });
    }
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a price extraction assistant. Given product page text, extract the current selling price. Return JSON: { "price": number | null, "currency": "CAD" | "USD" | null, "confidence": "high" | "medium" | "low" }. If a sale price exists return it. All values must be plain numbers (no symbols).`,
        },
        { role: "user", content: `Product: ${priceEntry.productName}\nURL: ${priceEntry.productUrl}\n\nPage text:\n${pageText}` },
      ],
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return res.status(500).json({ message: "No AI response" });
    const extracted = JSON.parse(content);
    if (!extracted.price) return res.status(422).json({ message: "Could not detect a price on that page", confidence: extracted.confidence });
    const updated = await storage.updateSupplierPrice(priceId, { unitPrice: String(extracted.price) });
    res.json({ ...updated, fetchedPrice: extracted.price, currency: extracted.currency, confidence: extracted.confidence });
  }));

  // ==================== REGIONAL MODIFIERS ====================
  // Read: any authenticated user (estimator UI needs them).
  // Write: admin only — these affect every quote that gets generated.

  app.get("/api/regional-modifiers", isAuthenticated, asyncHandler(async (req: any, res) => {
    const region = typeof req.query.region === "string" ? req.query.region : "muskoka";
    const rows = await db
      .select()
      .from(regionalModifiers)
      .where(eqSql(regionalModifiers.region, region));
    res.json(rows);
  }));

  app.post("/api/regional-modifiers", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertRegionalModifierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid modifier data", errors: parsed.error.errors });
    }
    const [created] = await db.insert(regionalModifiers).values(parsed.data).returning();
    res.status(201).json(created);
  }));

  app.patch("/api/regional-modifiers/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const parsed = insertRegionalModifierSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid modifier data", errors: parsed.error.errors });
    }
    // Stamp [manual-edit] into description so future seed runs leave it alone.
    const incomingDescription = parsed.data.description ?? "";
    const description = incomingDescription.includes("[manual-edit]")
      ? incomingDescription
      : `${incomingDescription} [manual-edit]`.trim();
    const [updated] = await db
      .update(regionalModifiers)
      .set({ ...parsed.data, description })
      .where(eqSql(regionalModifiers.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  }));

  app.delete("/api/regional-modifiers/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    await db.delete(regionalModifiers).where(eqSql(regionalModifiers.id, id));
    res.json({ message: "Regional modifier deleted" });
  }));

  // ==================== TABLE REDESIGN PLANNER ====================

  app.get("/api/redesign-plans", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const projectId = req.query.projectId ? parseInt(req.query.projectId) : undefined;
    const plans = await storage.getRedesignPlans(projectId);
    res.json(plans);
  }));

  app.get("/api/redesign-plans/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const plan = await storage.getRedesignPlan(parseInt(req.params.id));
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  }));

  app.post("/api/redesign-plans", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertTableRedesignPlanSchema.safeParse({ ...req.body, createdBy: userId });
    if (!parsed.success) return res.status(400).json({ message: "Invalid plan data", errors: parsed.error.errors });
    const plan = await storage.createRedesignPlan(parsed.data);
    res.status(201).json(plan);
  }));

  app.patch("/api/redesign-plans/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const newStatus = req.body.approvalStatus;
    if (newStatus && newStatus !== "draft") {
      const existing = await storage.getRedesignPlan(parseInt(req.params.id));
      if (existing) {
        const intendedUse = req.body.intendedUse ?? existing.intendedUse;
        const priorityConstraint = req.body.priorityConstraint ?? existing.priorityConstraint;
        if (!intendedUse) {
          return res.status(400).json({ message: "Intended use is required before changing status from draft" });
        }
        if (!priorityConstraint) {
          return res.status(400).json({ message: "Priority constraint is required before changing status from draft" });
        }
      }
    }
    const plan = await storage.updateRedesignPlan(parseInt(req.params.id), req.body);
    res.json(plan);
  }));

  app.delete("/api/redesign-plans/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteRedesignPlan(parseInt(req.params.id));
    res.json({ message: "Plan deleted" });
  }));

  // Redesign Materials
  app.get("/api/redesign-plans/:planId/materials", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const materials = await storage.getRedesignMaterials(parseInt(req.params.planId));
    res.json(materials);
  }));

  app.post("/api/redesign-plans/:planId/materials", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = insertTableRedesignMaterialSchema.safeParse({ ...req.body, planId: parseInt(req.params.planId) });
    if (!parsed.success) return res.status(400).json({ message: "Invalid material data", errors: parsed.error.errors });
    const material = await storage.createRedesignMaterial(parsed.data);
    res.status(201).json(material);
  }));

  app.patch("/api/redesign-plans/:planId/materials/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const material = await storage.updateRedesignMaterial(parseInt(req.params.id), req.body);
    res.json(material);
  }));

  app.delete("/api/redesign-plans/:planId/materials/:id", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteRedesignMaterial(parseInt(req.params.id));
    res.json({ message: "Material deleted" });
  }));

  // Push redesign card to planning board
  app.post("/api/redesign-plans/:id/push-to-board", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const user = await authStorage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const plan = await storage.getRedesignPlan(parseInt(req.params.id));
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const { boardId, tag } = req.body;
    if (!boardId) return res.status(400).json({ message: "boardId is required" });

    const board = await storage.getPlanningBoard(parseInt(boardId));
    if (!board) return res.status(404).json({ message: "Board not found" });

    const imageUrl = plan.conceptImageUrl || plan.beforeImageUrl || "";
    const title = plan.conceptTitle || plan.pieceName;
    const description = plan.conceptDescription || `${plan.pieceType} redesign — ${plan.redesignScope}`;
    const tagLabel = tag || plan.tag || "";

    const elementType = imageUrl ? "image" : "note";
    const content = imageUrl
      ? { url: imageUrl, caption: `${title}${tagLabel ? ` [${tagLabel}]` : ""}\n${description}` }
      : { text: `${title}${tagLabel ? ` [${tagLabel}]` : ""}\n${description}`, color: "#f0ede8" };

    const element = await storage.createCanvasElement({
      boardId: parseInt(boardId),
      type: elementType,
      x: 100,
      y: 100,
      width: 280,
      height: elementType === "image" ? 320 : 200,
      zIndex: 1,
      content,
    });

    res.status(201).json(element);
  }));

  // ── Room Renders (PR-S: AI Room Render) ───────────────────────────────────
  // Admin/crew only. Rate-limited 5/board/user/hour. Two modes — restyle (uses
  // a per-room source photo via gpt-image-1 edit) or imagine (text-to-image).
  const roomRenderUpload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `srcphoto-${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.mimetype)) {
        return cb(new Error("Source photo must be JPG, PNG, or WebP"));
      }
      cb(null, true);
    },
  });

  // Source-photo upload for a room_zone element (multipart). Field name "image".
  // Returns { url } so the client can chain into PATCH /source-photo if it wants
  // a single-step "Add a photo" flow.
  app.post("/api/board/element/:elementId/source-photo/upload", isAuthenticated, (req: any, res) => {
    roomRenderUpload.single("image")(req, res, async (err: any) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large (max 8MB)" : err.message)
          : err.message || "Upload failed";
        return res.status(400).json({ message });
      }
      try {
        const userId = req.user.claims.sub;
        const dbUser = await authStorage.getUser(userId);
        if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
          return res.status(403).json({ message: "Only admin/crew can set source photos" });
        }
        if (!req.file) return res.status(400).json({ message: "No image file provided" });
        const elementId = Number(req.params.elementId);
        if (!Number.isFinite(elementId)) return res.status(400).json({ message: "Invalid element id" });
        const url = `/uploads/${req.file.filename}`;
        res.json({ url });
      } catch (e: any) {
        console.error("Source photo upload error:", e?.message || e);
        res.status(500).json({ message: "Failed to upload source photo" });
      }
    });
  });

  // PATCH the room_zone's content.sourcePhotoUrl + optional focal point.
  app.patch("/api/board/element/:elementId/source-photo", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only admin/crew can set source photos" });
    }
    const elementId = Number(req.params.elementId);
    if (!Number.isFinite(elementId)) return res.status(400).json({ message: "Invalid element id" });
    const bodySchema = z.object({
      sourcePhotoUrl: z.string().nullable(),
      focalPoint: z.object({ x: z.number(), y: z.number() }).nullable().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body", errors: parsed.error.errors });

    const element = await storage.getCanvasElement(elementId);
    if (!element) return res.status(404).json({ message: "Element not found" });
    if (element.type !== "room_zone") {
      return res.status(400).json({ message: "Source photos can only be set on room_zone elements" });
    }
    const nextContent: any = { ...(element.content || {}) };
    nextContent.sourcePhotoUrl = parsed.data.sourcePhotoUrl;
    if (parsed.data.focalPoint !== undefined) nextContent.sourcePhotoFocalPoint = parsed.data.focalPoint;
    const updated = await storage.updateCanvasElement(elementId, { content: nextContent });
    res.json(updated);
  }));

  const roomRenderRateBuckets = new Map<string, { count: number; resetAt: number }>();
  const ROOM_RENDER_LIMIT = 5;
  const ROOM_RENDER_WINDOW_MS = 60 * 60_000;

  app.post("/api/rooms/render", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only admin/crew can request renders" });
    }
    const bodySchema = z.object({
      projectId: z.number().int().positive(),
      boardId: z.number().int().positive(),
      roomName: z.string().min(1).max(200),
      mode: z.enum(["restyle", "imagine"]),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    const { projectId, boardId, roomName, mode } = parsed.data;

    const board = await storage.getPlanningBoard(boardId);
    if (!board || board.projectId !== projectId) {
      return res.status(404).json({ message: "Board not found for project" });
    }

    const bucketKey = `${boardId}:${userId}`;
    const now = Date.now();
    const bucket = roomRenderRateBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt < now) {
      roomRenderRateBuckets.set(bucketKey, { count: 1, resetAt: now + ROOM_RENDER_WINDOW_MS });
    } else {
      if (bucket.count >= ROOM_RENDER_LIMIT) {
        return res.status(429).json({ message: "Render rate limit reached (5/hour per board); try again later." });
      }
      bucket.count += 1;
    }

    const { createRoomRender } = await import("./room-render/db");
    const { kickRoomRenderWorker } = await import("./room-render/worker");
    const created = await createRoomRender({
      projectId,
      boardId,
      roomName,
      mode,
      status: "queued",
      prompt: "",
      createdBy: userId,
    });
    kickRoomRenderWorker();
    res.status(202).json({ jobId: created.id, status: created.status });
  }));

  app.get("/api/rooms/render/:jobId", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only admin/crew can view renders" });
    }
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const { getRoomRender } = await import("./room-render/db");
    const row = await getRoomRender(jobId);
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  }));

  app.get("/api/projects/:projectId/room-renders", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only admin/crew can view renders" });
    }
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ message: "Invalid project id" });
    const room = typeof req.query.room === "string" ? req.query.room : undefined;
    const { listRoomRendersForProject, listRoomRendersForRoom } = await import("./room-render/db");
    const rows = room
      ? await listRoomRendersForRoom(projectId, room, 20)
      : await listRoomRendersForProject(projectId, 20);
    res.json(rows);
  }));

  app.delete("/api/rooms/render/:jobId", isAuthenticated, asyncHandler(async (req: any, res) => {
    const userId = req.user.claims.sub;
    const dbUser = await authStorage.getUser(userId);
    if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
      return res.status(403).json({ message: "Only admin/crew can delete renders" });
    }
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const { deleteRoomRender, getRoomRender } = await import("./room-render/db");
    const row = await getRoomRender(jobId);
    if (!row) return res.status(404).json({ message: "Not found" });
    await deleteRoomRender(jobId);
    res.json({ ok: true });
  }));

  // ── Cinematic Reviews (PR-N1: Ken-Burns backend) ──────────────────────────
  // Admin/crew only. Rate-limited 3/board/user/hour. AI-cinematic format ships
  // in PR-N2; for now it returns 503.
  const cinematicRateBuckets = new Map<string, { count: number; resetAt: number }>();
  const CINEMATIC_LIMIT = 3;
  const CINEMATIC_WINDOW_MS = 60 * 60_000;

  app.post("/api/rooms/cinematic-review", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can request cinematic reviews" });
      }

      const bodySchema = z.object({
        projectId: z.number().int().positive(),
        boardId: z.number().int().positive(),
        roomName: z.string().min(1).max(200),
        format: z.enum(["ken-burns", "ai-cinematic"]),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const { projectId, boardId, roomName, format } = parsed.data;

      if (format === "ai-cinematic") {
        return res.status(503).json({
          error: "AI cinematic ships in PR-N2",
          supportedFormats: ["ken-burns"],
        });
      }

      const board = await storage.getPlanningBoard(boardId);
      if (!board || board.projectId !== projectId) {
        return res.status(404).json({ message: "Board not found for project" });
      }

      const bucketKey = `${boardId}:${userId}`;
      const now = Date.now();
      const bucket = cinematicRateBuckets.get(bucketKey);
      if (!bucket || bucket.resetAt < now) {
        cinematicRateBuckets.set(bucketKey, { count: 1, resetAt: now + CINEMATIC_WINDOW_MS });
      } else {
        if (bucket.count >= CINEMATIC_LIMIT) {
          return res.status(429).json({ message: "Cinematic rate limit reached (3/hour per board); try again later." });
        }
        bucket.count += 1;
      }

      const { createCinematicReview } = await import("./cinematic/db");
      const { kickCinematicWorker } = await import("./cinematic/worker");
      const created = await createCinematicReview({
        projectId,
        boardId,
        roomName,
        format,
        status: "queued",
        createdBy: userId,
      });
      kickCinematicWorker();
      res.status(202).json({ jobId: created.id, status: created.status });
    } catch (err: any) {
      console.error("Cinematic review error:", err?.message || err);
      res.status(500).json({ message: "Failed to enqueue cinematic review" });
    }
  });

  app.get("/api/rooms/cinematic-review/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can view cinematic reviews" });
      }
      const jobId = Number(req.params.jobId);
      if (!Number.isFinite(jobId)) {
        return res.status(400).json({ message: "Invalid job id" });
      }
      const { getCinematicReview } = await import("./cinematic/db");
      const row = await getCinematicReview(jobId);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      console.error("Cinematic review fetch error:", err?.message || err);
      res.status(500).json({ message: "Failed to load cinematic review" });
    }
  });

  app.get("/api/projects/:projectId/cinematic-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dbUser = await authStorage.getUser(userId);
      if (dbUser?.role !== "admin" && dbUser?.role !== "crew") {
        return res.status(403).json({ message: "Only admin/crew can view cinematic reviews" });
      }
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ message: "Invalid project id" });
      }
      const { listCinematicReviewsForProject } = await import("./cinematic/db");
      const rows = await listCinematicReviewsForProject(projectId, 20);
      res.json(rows);
    } catch (err: any) {
      console.error("Cinematic reviews list error:", err?.message || err);
      res.status(500).json({ message: "Failed to list cinematic reviews" });
    }
  });

  // Resume any orphaned 'queued' jobs left over from a previous boot.
  try {
    const { kickCinematicWorker } = await import("./cinematic/worker");
    kickCinematicWorker();
  } catch (err) {
    console.warn("[cinematic] failed to start worker on boot:", (err as Error).message);
  }
  try {
    const { kickRoomRenderWorker } = await import("./room-render/worker");
    kickRoomRenderWorker();
  } catch (err) {
    console.warn("[room-render] failed to start worker on boot:", (err as Error).message);
  }

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

  // Seed default suppliers
  const existingSuppliers = await storage.getSuppliers();
  if (existingSuppliers.length === 0) {
    await storage.createSupplier({
      name: "Muskoka Lumber",
      phone: "(705) 645-2231",
      email: "sales@muskokalumber.com",
      address: "Bracebridge, ON",
      website: "https://www.muskokalumber.com",
      isPreferred: true,
      isActive: true,
      notes: "Primary material supplier. Full lumber yard, hardware, plumbing, electrical supplies. Contractor pricing available.",
    });
  }
}
