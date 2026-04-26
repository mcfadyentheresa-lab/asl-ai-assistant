// Email + password authentication.
//
// Replaces the previous Replit OIDC stub. All three roles (admin / crew /
// client) log in through the same flow:
//
//   POST /api/auth/login          { email, password, mfaCode? }
//   POST /api/auth/logout
//   POST /api/auth/forgot         { email }
//   POST /api/auth/reset          { token, password }
//   POST /api/auth/accept-invite  { token, password, firstName?, lastName? }
//
// Existing routes still read `req.user.claims.sub` — we keep that shape so we
// don't have to touch 130+ call sites in routes.ts. The only difference is
// `req.user` now comes from Passport's session deserialize, not OIDC.
//
// Backwards compatibility:
//   /api/login   →  redirects to the login page (legacy links)
//   /api/logout  →  proxies to POST /api/auth/logout (legacy links)

import session from "express-session";
import type { Express, RequestHandler, Request } from "express";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { db } from "../../db";
import { authStorage } from "./storage";
import { users, authTokens, type User } from "@shared/models/auth";
import { eq, and, lt, isNull } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const RESET_TTL_MS  = 60 * 60 * 1000;           // 1 hour
const BCRYPT_ROUNDS = 12;

// --------------------------------------------------------------------------
// Session
// --------------------------------------------------------------------------
export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });

  const secret = process.env.SESSION_SECRET!;
  const isProd = process.env.NODE_ENV === "production";

  return session({
    name: "asc.sid",
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      maxAge: SESSION_TTL_MS,
    },
  });
}

// --------------------------------------------------------------------------
// Token helpers (invites + password resets)
// --------------------------------------------------------------------------
function newToken(): { token: string; hash: string } {
  // We store a sha256 hash of the token, never the raw value.
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCrewInvite(opts: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  createdBy: string;
}) {
  const { token, hash } = newToken();
  await db.insert(authTokens).values({
    token: hash,
    kind: "crew_invite",
    email: opts.email.toLowerCase().trim(),
    role: "crew",
    firstName: opts.firstName ?? null,
    lastName: opts.lastName ?? null,
    createdBy: opts.createdBy,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return token;
}

export async function createPasswordReset(email: string) {
  const normalized = email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user) return null; // caller decides whether to reveal this
  const { token, hash } = newToken();
  await db.insert(authTokens).values({
    token: hash,
    kind: "password_reset",
    email: normalized,
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  return { token, user };
}

async function consumeToken(rawToken: string, kind: string) {
  const hash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.token, hash), eq(authTokens.kind, kind)));
  if (!row) return null;
  if (row.consumedAt) return { row, error: "consumed" as const };
  if (row.expiresAt < new Date()) return { row, error: "expired" as const };
  return { row, error: null };
}

async function markTokenConsumed(id: number) {
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(eq(authTokens.id, id));
}

// --------------------------------------------------------------------------
// Passport — local strategy
// --------------------------------------------------------------------------
function configurePassport() {
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const normalized = email.toLowerCase().trim();
          const [user] = await db.select().from(users).where(eq(users.email, normalized));
          if (!user || !user.passwordHash) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (user.archivedAt) {
            return done(null, false, { message: "This account is disabled" });
          }
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return done(null, false, { message: "Invalid email or password" });
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  // We persist the user id only and rehydrate on each request.
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authStorage.getUser(id);
      if (!user || user.archivedAt) return done(null, false);
      // Synthesize the legacy `claims.sub` shape so existing route code keeps working.
      const augmented: any = {
        ...user,
        claims: { sub: user.id, email: user.email },
        // Legacy fields some code touches; harmless to leave null.
        access_token: null,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      done(null, augmented);
    } catch (err) {
      done(err as Error);
    }
  });
}

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------
function loginEmailSchema(req: Request): { email: string; password: string; mfaCode?: string } | null {
  const { email, password, mfaCode } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (email.length < 3 || password.length < 1) return null;
  return { email, password, mfaCode: typeof mfaCode === "string" ? mfaCode : undefined };
}

async function sendInviteEmail(opts: {
  to: string;
  firstName?: string | null;
  token: string;
  kind: "crew_invite" | "client_invite" | "password_reset";
  appUrl: string;
}) {
  // Lazy import — email module reads env at call time.
  const nodemailer = (await import("nodemailer")).default;
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    console.warn("[auth] Skipping email send — GMAIL_USER/GMAIL_APP_PASSWORD not configured");
    return false;
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  const subjectMap = {
    crew_invite: "You're invited to join Aster & Spruce",
    client_invite: "Welcome to your project workspace",
    password_reset: "Reset your password",
  };
  const path = opts.kind === "password_reset" ? "/reset-password" : "/accept-invite";
  const url = `${opts.appUrl}${path}/${opts.token}`;
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  const body =
    opts.kind === "password_reset"
      ? `${greeting}\n\nClick the link below to reset your password (expires in 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`
      : `${greeting}\n\nYou've been invited to Aster & Spruce. Click the link below to set your password and finish creating your account (expires in 7 days):\n${url}`;

  await transport.sendMail({
    from: gmailUser,
    to: opts.to,
    subject: subjectMap[opts.kind],
    text: body,
  });
  return true;
}

function getAppUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}`;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", true);
  app.use(getSession());

  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  // ── Login ───────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginEmailSchema(req);
    if (!parsed) return res.status(400).json({ message: "Email and password are required" });

    passport.authenticate("local", async (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid email or password" });

      // MFA gate (lightweight scaffold — real TOTP verify lives in PR follow-up).
      if (user.mfaEnabled && user.mfaSecret) {
        if (!parsed.mfaCode) {
          return res.status(401).json({ message: "MFA code required", mfaRequired: true });
        }
        // TODO: verify TOTP against user.mfaSecret. For now reject any code so
        // accounts with mfaEnabled=true cannot log in until verification is wired.
        return res.status(401).json({ message: "MFA verification not yet enabled" });
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
        res.json({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        });
      });
    })(req, res, next);
  });

  // ── Logout ──────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("asc.sid");
        res.json({ ok: true });
      });
    });
  });

  // ── Forgot password ─────────────────────────────────────────────────────
  app.post("/api/auth/forgot", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : null;
    if (!email) return res.status(400).json({ message: "Email is required" });
    try {
      const result = await createPasswordReset(email);
      if (result) {
        await sendInviteEmail({
          to: email,
          firstName: result.user.firstName,
          token: result.token,
          kind: "password_reset",
          appUrl: getAppUrl(req),
        });
      }
      // Always return ok — never leak whether the email exists.
      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] forgot failed", err);
      res.status(500).json({ message: "Failed to send reset email" });
    }
  });

  // ── Reset password ──────────────────────────────────────────────────────
  app.post("/api/auth/reset", async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Token and a password (min 8 chars) are required" });
    }
    const result = await consumeToken(token, "password_reset");
    if (!result) return res.status(404).json({ message: "Invalid token" });
    if (result.error === "consumed") return res.status(409).json({ message: "Token already used" });
    if (result.error === "expired") return res.status(410).json({ message: "Token expired" });
    if (!result.row.userId) return res.status(500).json({ message: "Token has no user" });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, result.row.userId));
    await markTokenConsumed(result.row.id);
    res.json({ ok: true });
  });

  // ── Validate invite token (used by accept-invite page) ──────────────────
  app.get("/api/auth/invite/:token", async (req, res) => {
    const result = await consumeToken(req.params.token, "crew_invite");
    if (!result) return res.status(404).json({ valid: false, reason: "not_found" });
    if (result.error === "consumed") return res.json({ valid: false, reason: "consumed" });
    if (result.error === "expired") return res.json({ valid: false, reason: "expired" });
    res.json({
      valid: true,
      email: result.row.email,
      firstName: result.row.firstName,
      lastName: result.row.lastName,
      role: result.row.role,
    });
  });

  // ── Accept crew invite ──────────────────────────────────────────────────
  app.post("/api/auth/accept-invite", async (req, res) => {
    const { token, password, firstName, lastName } = req.body || {};
    if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Token and a password (min 8 chars) are required" });
    }
    const result = await consumeToken(token, "crew_invite");
    if (!result) return res.status(404).json({ message: "Invalid invite" });
    if (result.error === "consumed") return res.status(409).json({ message: "Invite already used" });
    if (result.error === "expired") return res.status(410).json({ message: "Invite expired" });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const role = result.row.role || "crew";

    // Upsert by email
    const existing = await db.select().from(users).where(eq(users.email, result.row.email));
    let user;
    if (existing.length > 0) {
      const [u] = await db
        .update(users)
        .set({
          passwordHash: hash,
          role,
          firstName: firstName ?? result.row.firstName ?? existing[0].firstName,
          lastName: lastName ?? result.row.lastName ?? existing[0].lastName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      user = u;
    } else {
      const [u] = await db
        .insert(users)
        .values({
          email: result.row.email,
          passwordHash: hash,
          role,
          firstName: firstName ?? result.row.firstName,
          lastName: lastName ?? result.row.lastName,
        })
        .returning();
      user = u;
    }

    await markTokenConsumed(result.row.id);

    // Auto-login after accepting invite
    req.logIn(user as any, (err) => {
      if (err) return res.status(500).json({ message: "Account created but login failed. Please sign in." });
      res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
    });
  });

  // ── Current user ────────────────────────────────────────────────────────
  app.get("/api/auth/user", (req: any, res) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const { passwordHash: _ph, mfaSecret: _mf, ...safe } = req.user;
    res.json(safe);
  });

  // ── Legacy redirects ────────────────────────────────────────────────────
  // Old links pointed at /api/login (GET) — bounce them to the SPA login page.
  app.get("/api/login", (req, res) => {
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
    res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  });

  app.get("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("asc.sid");
        res.redirect("/");
      });
    });
  });

  app.get("/api/callback", (_req, res) => res.redirect("/"));

  // Periodic cleanup of expired/consumed tokens (best-effort, non-blocking).
  setInterval(() => {
    db.delete(authTokens)
      .where(and(lt(authTokens.expiresAt, new Date()), isNull(authTokens.consumedAt)))
      .catch(() => {});
  }, 60 * 60 * 1000).unref?.();
}

// --------------------------------------------------------------------------
// Middleware
// --------------------------------------------------------------------------

// Require a logged-in user. Replaces the previous "always allow" stub.
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if ((req as any).user) return next();
  // Dev escape hatch: only honored when NODE_ENV !== "production" AND explicitly enabled.
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true") {
    (req as any).user = {
      id: "dev-bypass-user",
      email: "dev@local",
      role: "admin",
      claims: { sub: "dev-bypass-user", email: "dev@local" },
      access_token: null,
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
