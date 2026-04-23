// NOTE: OpenID Connect authentication is conditionally disabled.
// Set OPENID_DISABLED=true to skip OIDC initialization entirely (e.g. when
// OPENID_CLIENT_ID / OPENID_ISSUER_URL are not yet configured).
// When OPENID_DISABLED is not set, OPENID_CLIENT_ID and OPENID_ISSUER_URL
// must be provided — the env validation in server/index.ts enforces this
// before any module is imported.
//
// import * as client from "openid-client";
// import { Strategy, type VerifyFunction } from "openid-client/passport";
// import passport from "passport";
// import memoize from "memoizee";

import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  // SESSION_SECRET is guaranteed non-empty by the startup validation in
  // server/index.ts — the non-null assertion is safe here.
  const secret = process.env.SESSION_SECRET!;

  return session({
    name: "asc.sid",
    secret,
    store: sessionStore,
    resave: true,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax" as const,
      maxAge: sessionTtl,
    },
  });
}

// Auth setup — OIDC is skipped when OPENID_DISABLED=true.
// Registers session middleware and stubs login/callback/logout routes so that
// existing links don't 404 while OAuth credentials are not yet configured.
export async function setupAuth(app: Express) {
  app.set("trust proxy", true);
  app.use(getSession());

  if (process.env.OPENID_DISABLED === "true") {
    console.log("OpenID authentication disabled — serving stub auth routes");

    // Stub routes so existing links don't 404
    app.get("/api/login", (_req, res) => {
      res.status(503).json({ message: "Authentication is not configured" });
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/");
    });

    app.get("/api/logout", (_req, res) => {
      res.redirect("/");
    });
  } else {
    // OpenID is enabled — OPENID_CLIENT_ID and OPENID_ISSUER_URL are present
    // (validated at startup). Wire up the real OIDC flow here when ready.
    console.log("OpenID authentication enabled (OIDC client not yet wired — stub routes active)");

    app.get("/api/login", (_req, res) => {
      res.status(503).json({ message: "OpenID client not yet configured" });
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/");
    });

    app.get("/api/logout", (_req, res) => {
      res.redirect("/");
    });
  }
}

// isAuthenticated is bypassed — all requests are allowed through.
// A mock user is attached to req.user so that downstream route handlers that
// read req.user.claims.sub do not crash. Re-enable the real implementation
// once OAuth credentials are configured.
export const isAuthenticated: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    (req as any).user = {
      claims: { sub: "dev-bypass-user" },
      access_token: null,
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
  }
  next();
};
