// NOTE: OpenID Connect authentication is temporarily disabled.
// The openid-client initialization requires REPL_ID / ISSUER_URL env vars that
// are not available in this deployment. Auth will be re-enabled once OAuth
// credentials are configured.
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
  return session({
    name: "asc.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
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

// Auth setup — OIDC disabled. Registers session middleware only.
// Login/callback/logout routes are stubbed out until OAuth is configured.
export async function setupAuth(app: Express) {
  app.set("trust proxy", true);
  app.use(getSession());

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
