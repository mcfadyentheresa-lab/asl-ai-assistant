// ─── Environment validation ───────────────────────────────────────────────────
// Must run BEFORE any imports that touch DATABASE_URL, SESSION_SECRET, or
// OpenID config so that missing vars produce a clear error instead of a
// cryptic crash deep inside compiled code.
const requiredVars = ["DATABASE_URL", "SESSION_SECRET"];
const missingVars = requiredVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingVars.join(", ")}`);
  console.error("Set these variables and restart the service.");
  process.exit(1);
}

// Email + password auth has no extra required env vars (DATABASE_URL +
// SESSION_SECRET, validated above, are sufficient). Optional vars:
//   GMAIL_USER / GMAIL_APP_PASSWORD  - to send invites & resets
//   APP_URL                          - canonical URL used in invite links
//   AUTH_DEV_BYPASS=true             - dev-only escape hatch (NODE_ENV != production)
// ─────────────────────────────────────────────────────────────────────────────

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupWebSocket } from "./websocket";
import { startSmsQueueProcessor } from "./sms";
import { bootstrapAdminFromEnv } from "./bootstrap-admin";
import { startLinkHealthJob } from "./link-health";
import { seedBenjaminMooreColors } from "./seed-paint-colors";
import { seedAdditionalBrands } from "./seed-additional-brands";
import { seedMuskokaPriceBook } from "./seed-muskoka-price-book";

const app = express();
const httpServer = createServer(app);

// ─── Security headers ─────────────────────────────────────────────────────
// Helmet adds HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
// Cross-Origin-Resource-Policy, and friends. We deliberately disable Helmet's
// default Content-Security-Policy because the SPA loads Google Fonts, R2
// public CDN images, OpenAI/Houzz/Pinterest images, and inline Vite shims —
// authoring a correct CSP without breaking those flows is its own change.
// Track that as a follow-up; the rest of the headers ship now.
app.use(
  helmet({
    contentSecurityPolicy: false,
    // The app is reached by name (app.asl-portal.ca). Telling browsers HSTS
    // for two years with subdomain inclusion is the standard for a Railway
    // app behind Let's Encrypt — TLS is already enforced at the edge.
    strictTransportSecurity: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: false,
    },
    // Public presentation pages embed in iframes (e.g. share previews) — keep
    // SAMEORIGIN to block clickjacking but not break our own UI.
    frameguard: { action: "sameorigin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Cross-Origin-Resource-Policy: same-site lets our own pages load images
    // from /api/public-assets but blocks third-party hotlinking.
    crossOriginResourcePolicy: { policy: "same-site" },
    // We don't use COEP/COOP advanced isolation today; default same-origin
    // would block third-party iframes (e.g. embedded Houzz boards).
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  setupWebSocket(httpServer);

  // Idempotent admin bootstrap from env vars. No-op if ADMIN_EMAIL /
  // ADMIN_PASSWORD aren't set. Errors are logged but don't block startup.
  await bootstrapAdminFromEnv();

  // Idempotent paint-color catalog seed. Each function checks per-brand and
  // skips if rows already exist. Errors are logged but don't block startup.
  try {
    const bm = await seedBenjaminMooreColors();
    if (bm > 0) log(`Seeded ${bm} Benjamin Moore paint colors.`);
    const additional = await seedAdditionalBrands();
    if (additional > 0) log(`Seeded ${additional} additional brand paint colors.`);
  } catch (err) {
    console.error("Paint-color seed error (non-fatal):", err);
  }

  // Idempotent Muskoka price-book seed (cost categories, suppliers,
  // supplier prices, market rates, regional modifiers). Skips rows whose
  // notes/description contain the [manual-edit] marker so admin overrides
  // are never overwritten. Errors are logged but don't block startup.
  try {
    const result = await seedMuskokaPriceBook();
    const newRows =
      result.categories.created +
      result.suppliers.created +
      result.supplierPrices.inserted +
      result.marketRates.inserted +
      result.regionalModifiers.inserted;
    const cleaned =
      result.cleanup.deletedPrices + result.cleanup.deletedSuppliers;
    if (newRows > 0 || cleaned > 0) {
      log(
        `Seeded Muskoka price book: +${result.categories.created} categories, ` +
          `+${result.suppliers.created} suppliers, ` +
          `+${result.supplierPrices.inserted} prices, ` +
          `+${result.marketRates.inserted} market rates, ` +
          `+${result.regionalModifiers.inserted} regional modifiers, ` +
          `cleaned ${result.cleanup.deletedPrices} phantom prices / ` +
          `${result.cleanup.deletedSuppliers} phantom suppliers ` +
          `(${result.cleanup.manualEditPreserved} manual-edit preserved).`,
      );
    }
  } catch (err) {
    console.error("Muskoka price-book seed error (non-fatal):", err);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      startSmsQueueProcessor();
      startLinkHealthJob();

      storage.cleanupOldActivity(7).then((count) => {
        if (count > 0) log(`Cleaned up ${count} activity entries older than 7 days`);
      }).catch(() => {});

      setInterval(() => {
        storage.cleanupOldActivity(7).then((count) => {
          if (count > 0) log(`Cleaned up ${count} activity entries older than 7 days`);
        }).catch(() => {});
      }, 6 * 60 * 60 * 1000);
    },
  );
})();
