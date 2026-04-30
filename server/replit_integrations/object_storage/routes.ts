import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  /**
   * Re-host an external image URL into our own bucket.
   *
   * Why this exists: dropping or pasting an image URL from sites like Houzz,
   * Pinterest, or any CDN that uses Referer-based hotlink protection results
   * in a blank/white box on the canvas because the browser silently fails to
   * load the image. By fetching it server-side first and re-hosting it under
   * /objects/..., we get a reliable, persistent image that survives even if
   * the original is taken down.
   *
   * Request body: { url: string }
   * Response 200: { objectPath: "/objects/uploads/<uuid>", contentType }
   * Response 400: { error } when the URL is missing/invalid or doesn't point
   *   to a real image.
   * Response 502: { error } when the upstream fetch or our re-upload fails.
   *
   * Size cap: 25 MiB per image. Allowed types: image/* only.
   */
  app.post("/api/uploads/from-url", async (req, res) => {
    const { url } = req.body || {};
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    try {
      // Fetch the source image. Send a desktop UA + a benign Referer matching
      // the source host so hotlink-protected CDNs serve us the bytes. Time
      // out aggressively so a slow or dead source doesn't tie up a worker.
      let sourceHost = "";
      try { sourceHost = new URL(url).host; } catch { /* validated above */ }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let upstream: Response;
      try {
        upstream = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Referer": sourceHost ? `https://${sourceHost}/` : "",
            "Accept": "image/*,*/*;q=0.8",
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!upstream.ok) {
        return res.status(502).json({ error: `Source returned ${upstream.status}` });
      }
      const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return res.status(400).json({ error: `Not an image (content-type: ${contentType || "unknown"})` });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      const MAX = 25 * 1024 * 1024;
      if (buf.byteLength === 0) {
        return res.status(502).json({ error: "Empty response from source" });
      }
      if (buf.byteLength > MAX) {
        return res.status(400).json({ error: "Image larger than 25 MiB" });
      }

      // Mint a presigned PUT URL into our bucket and stream the bytes up.
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: buf,
      });
      if (!putRes.ok) {
        return res.status(502).json({ error: `Re-upload failed: ${putRes.status}` });
      }
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      return res.json({ objectPath, contentType, bytes: buf.byteLength });
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "Source fetch timed out" : (err?.message || "unknown error");
      console.error("[uploads/from-url] failed:", msg);
      return res.status(502).json({ error: msg });
    }
  });

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/{*objectPath}", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  app.get("/api/public-assets/{*filePath}", async (req: { params: Record<string, string | string[]> } & import("express").Request, res) => {
    try {
      const rawPath = req.params.filePath;
      const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath || "");
      if (!filePath) {
        return res.status(400).json({ error: "Missing file path" });
      }
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      await objectStorageService.downloadObject(file, res, 86400);
    } catch (error) {
      console.error("Error serving public asset:", error);
      return res.status(500).json({ error: "Failed to serve file" });
    }
  });
}

