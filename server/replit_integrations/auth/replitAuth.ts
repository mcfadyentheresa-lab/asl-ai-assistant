// OpenID authentication is disabled — no OIDC environment variables are configured.
// All auth middleware is bypassed so the app can start and run without OAuth setup.
// To re-enable, restore the openid-client imports and the setupAuth / isAuthenticated
// implementations below, and set REPL_ID, ISSUER_URL, and SESSION_SECRET env vars.

// import * as client from "openid-client";
// import { Strategy, type VerifyFunction } from "openid-client/passport";
// import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
// import memoize from "memoizee";
import connectPg from "connect-pg-simple";
// import { authStorage } from "./storage";

// const getOidcConfig = memoize(
//   async () => {
//     return await client.discovery(
//       new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
//       process.env.REPL_ID!
//     );
//   },
//   { maxAge: 3600 * 1000 }
// );

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
    secret: process.env.SESSION_SECRET || "dev-secret-no-auth",
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

// OpenID-specific helpers — disabled while auth is bypassed.
// function updateUserSession(user, tokens) { ... }
// async function upsertUser(claims) { ... }

export async function setupAuth(app: Express) {
  // Auth is disabled — only set up the session middleware so that
  // session-dependent code (e.g. connect-pg-simple) doesn't crash.
  app.set("trust proxy", true);
  app.use(getSession());

  // OpenID / Passport setup is commented out until OAuth env vars are available.
  // app.use(passport.initialize());
  // app.use(passport.session());
  // const config = await getOidcConfig();
  // ... strategy registration, /api/login, /api/callback, /api/logout routes ...

  // Stub login/logout routes so the client doesn't get 404s.
  app.get("/api/login", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });

  app.get("/api/callback", (_req, res) => {
    res.redirect("/");
  });
}

// isAuthenticated is a pass-through while auth is disabled.
// A stub user is attached to req.user so that route handlers that read
// req.user.claims.sub don't throw. The stub ID "dev-admin" will not match
// any real DB record, so role-gated routes will return 404/null — which is
// acceptable for local testing without OAuth.
export const isAuthenticated: RequestHandler = (req: any, _res, next) => {
  if (!req.user) {
    req.user = {
      claims: { sub: "dev-admin" },
      access_token: null,
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    };
  }
  return next();
};
