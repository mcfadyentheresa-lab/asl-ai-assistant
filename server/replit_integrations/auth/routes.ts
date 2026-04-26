import type { Express } from "express";
import { isAuthenticated } from "./replitAuth";
import { authStorage } from "./storage";
import { createCrewInvite } from "./replitAuth";
import { db } from "../../db";
import { authTokens } from "@shared/models/auth";
import { desc, eq } from "drizzle-orm";

// Admin-only routes for managing users / sending crew invites.
// /api/auth/user is registered inside setupAuth (replitAuth.ts).
export function registerAuthRoutes(app: Express): void {
  // List crew invites (admin)
  app.get("/api/admin/crew-invites", isAuthenticated, async (req: any, res) => {
    const me = await authStorage.getUser(req.user.claims.sub);
    if (me?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const rows = await db
      .select({
        id: authTokens.id,
        email: authTokens.email,
        firstName: authTokens.firstName,
        lastName: authTokens.lastName,
        role: authTokens.role,
        expiresAt: authTokens.expiresAt,
        consumedAt: authTokens.consumedAt,
        createdAt: authTokens.createdAt,
      })
      .from(authTokens)
      .where(eq(authTokens.kind, "crew_invite"))
      .orderBy(desc(authTokens.createdAt));
    res.json(rows);
  });

  // Create a crew invite (admin)
  app.post("/api/admin/crew-invites", isAuthenticated, async (req: any, res) => {
    const me = await authStorage.getUser(req.user.claims.sub);
    if (me?.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const { email, firstName, lastName } = req.body || {};
    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email required" });
    }

    const token = await createCrewInvite({
      email,
      firstName: typeof firstName === "string" ? firstName : null,
      lastName: typeof lastName === "string" ? lastName : null,
      createdBy: me.id,
    });

    // Send email
    try {
      const nodemailer = (await import("nodemailer")).default;
      const gmailUser = process.env.GMAIL_USER;
      const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
      if (gmailUser && gmailAppPassword) {
        const transport = nodemailer.createTransport({
          service: "gmail",
          auth: { user: gmailUser, pass: gmailAppPassword },
        });
        const appUrl = (process.env.APP_URL || "https://asterandspruce.com").replace(/\/$/, "");
        const link = `${appUrl}/accept-invite/${token}`;
        await transport.sendMail({
          from: gmailUser,
          to: email,
          subject: "You're invited to join Aster & Spruce",
          html: `
            <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f7f6f1;">
              <h2 style="color:#1a3a2a;">Welcome to Aster &amp; Spruce</h2>
              <p>You've been invited to join the Aster &amp; Spruce crew workspace. Click the button below to set your password and finish creating your account.</p>
              <p style="margin:32px 0;">
                <a href="${link}" style="display:inline-block;background:#1a3a2a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:4px;font-weight:600;">Accept invite</a>
              </p>
              <p style="font-size:12px;color:#888;">This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
              <p style="font-size:12px;color:#1a3a2a;word-break:break-all;">${link}</p>
            </div>`,
        });
      } else {
        console.warn("[admin] Crew invite created but email not sent (Gmail creds missing)");
      }
    } catch (err) {
      console.error("[admin] Failed to send crew invite email:", err);
    }

    res.status(201).json({ ok: true, email });
  });

  // Revoke a crew invite (admin)
  app.delete("/api/admin/crew-invites/:id", isAuthenticated, async (req: any, res) => {
    const me = await authStorage.getUser(req.user.claims.sub);
    if (me?.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await db.delete(authTokens).where(eq(authTokens.id, id));
    res.json({ ok: true });
  });
}
