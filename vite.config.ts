import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Replit-only dev plugins. We load them dynamically and gate on REPL_ID so
// production builds (Railway) do not require these packages or their
// transitive deps to resolve at build time.
const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== "production";

const replitPlugins = isReplit
  ? [
      await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
        m.default(),
      ),
      ...(isDev
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer(),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ]
  : [];

export default defineConfig({
  plugins: [react(), ...replitPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Split vendor libs into stable, separately-cacheable chunks so phone
    // cold-loads don't have to parse the whole world in one file.
    // We intentionally do NOT use manualChunks for React-touching libs.
    // A previous attempt split React across multiple vendor chunks and
    // produced two React instances at runtime (white screen, errors like
    // "Cannot set properties of undefined (setting 'Children')" /
    // "Cannot read properties of undefined (reading 'useLayoutEffect')").
    // The safe pattern is to let Rollup keep all React + React-consuming
    // packages in the default vendor graph, and only carve out clearly
    // independent libs. Route-level code splitting via React.lazy() in
    // App.tsx is what actually shrinks the initial bundle.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
