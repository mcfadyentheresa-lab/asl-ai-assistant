import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// -----------------------------------------------------------------------------
// Cloudflare R2 (S3-compatible) backend.
//
// We migrated off Google Cloud Storage because Google's "Secure by default"
// org policy blocks service-account JSON key creation, which is the only way
// the @google-cloud/storage library can authenticate from Railway. Cloudflare
// R2 has no such restriction, charges $0 for egress, and exposes the standard
// S3 API \u2014 so we use the AWS SDK pointed at R2's endpoint.
//
// Required env vars (set on Railway):
//   R2_ACCOUNT_ID         your Cloudflare account ID (32-char hex)
//   R2_ACCESS_KEY_ID      access key from R2 \u2192 Manage R2 API Tokens \u2192 Create
//   R2_SECRET_ACCESS_KEY  secret from the same place
//   R2_PRIVATE_BUCKET     bucket name for user uploads, e.g. "asl-portal-private"
//   R2_PUBLIC_BUCKET      bucket name for app assets,  e.g. "asl-portal-public"
//   R2_PUBLIC_URL         (optional) public base URL for the public bucket
//                         e.g. https://pub-<id>.r2.dev or https://cdn.example.com
//                         If unset, public assets are streamed through this server.
// -----------------------------------------------------------------------------

// We retain the legacy GCS-style env names too so existing call sites that still
// reference PRIVATE_OBJECT_DIR keep working. The R2 path takes precedence when
// both are set; if only the legacy ones are set we derive the bucket name from
// PRIVATE_OBJECT_DIR ("/<bucket>/<prefix>" \u2192 bucket).
function readBucketAndPrefix(envValue: string | undefined): { bucket: string; prefix: string } {
  // Accepts either a plain bucket name ("asl-portal-private") or a legacy
  // "/<bucket>/<prefix>" path. The prefix is preserved so we can keep using
  // "/uploads/<uuid>" object names exactly like before.
  const raw = (envValue || "").trim();
  if (!raw) return { bucket: "", prefix: "" };
  if (!raw.includes("/")) {
    return { bucket: raw, prefix: "" };
  }
  const parts = raw.replace(/^\/+/, "").split("/");
  return { bucket: parts[0] || "", prefix: parts.slice(1).join("/") };
}

function readPrivateConfig(): { bucket: string; prefix: string } {
  if (process.env.R2_PRIVATE_BUCKET) {
    return readBucketAndPrefix(process.env.R2_PRIVATE_BUCKET);
  }
  return readBucketAndPrefix(process.env.PRIVATE_OBJECT_DIR);
}

function readPublicConfigs(): Array<{ bucket: string; prefix: string }> {
  if (process.env.R2_PUBLIC_BUCKET) {
    return [readBucketAndPrefix(process.env.R2_PUBLIC_BUCKET)];
  }
  // Legacy comma-separated list "/<bucket>/<prefix>,/<bucket>/<prefix>"
  return (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(readBucketAndPrefix);
}

function buildClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (and R2_PRIVATE_BUCKET, R2_PUBLIC_BUCKET) on the server.",
    );
  }
  const config: S3ClientConfig = {
    // R2 ignores region, but the SDK requires a non-empty value. "auto" is the
    // documented placeholder.
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 uses path-style addressing.
    forcePathStyle: true,
  };
  return new S3Client(config);
}

// Lazy client \u2014 construction throws if env is missing, but we don't want to
// crash boot just because storage is misconfigured. The diagnostic endpoint
// surfaces config errors gracefully.
let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) _client = buildClient();
  return _client;
}

// -----------------------------------------------------------------------------
// Compatibility shim: a tiny "File" facade so the rest of the codebase keeps
// using the same property/method names it had with @google-cloud/storage.
// Existing callers do:
//   await file.exists()           => HEAD
//   await file.getMetadata()      => HEAD + parse x-amz-meta-* into ACL
//   await file.setMetadata(...)   => COPY-overwrite with new metadata
//   file.createReadStream()       => GET body
//   file.name                     => key
// -----------------------------------------------------------------------------
export class File {
  public readonly bucketName: string;
  public readonly key: string;
  constructor(bucketName: string, key: string) {
    this.bucketName = bucketName;
    this.key = key;
  }

  get name(): string {
    return this.key;
  }

  async exists(): Promise<[boolean]> {
    try {
      await client().send(new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }));
      return [true];
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
        return [false];
      }
      throw err;
    }
  }

  async getMetadata(): Promise<[{
    contentType?: string;
    size?: string | number;
    metadata?: Record<string, string>;
  }]> {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: this.bucketName, Key: this.key }),
    );
    return [{
      contentType: res.ContentType,
      size: res.ContentLength?.toString() ?? "0",
      // Convert AWS SDK shape (Metadata: { aclPolicy: '...' }) into the
      // GCS-style shape this codebase expects (metadata['custom:aclPolicy']).
      metadata: Object.fromEntries(
        Object.entries(res.Metadata || {}).map(([k, v]) => [
          k === "aclpolicy" ? "custom:aclPolicy" : k,
          v as string,
        ]),
      ),
    }];
  }

  async setMetadata(opts: { metadata?: Record<string, string> }): Promise<void> {
    // S3 metadata is immutable on existing objects \u2014 to update it we copy the
    // object onto itself with new metadata. Use REPLACE directive.
    const meta = opts.metadata || {};
    // Header keys must be lowercase ASCII; collapse the namespaced GCS key
    // ("custom:aclPolicy") into a plain "aclpolicy" header that round-trips
    // through getMetadata() above.
    const collapsed: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v !== "string") continue;
      const normKey = k === "custom:aclPolicy" ? "aclpolicy" : k.toLowerCase();
      collapsed[normKey] = v;
    }
    await client().send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.key,
        CopySource: `/${this.bucketName}/${encodeURIComponent(this.key)}`,
        Metadata: collapsed,
        MetadataDirective: "REPLACE",
      }),
    );
  }

  async delete(): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client().send(
      new DeleteObjectCommand({ Bucket: this.bucketName, Key: this.key }),
    );
  }

  async getStreamAndMetadata(): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
    metadata?: Record<string, string>;
  }> {
    const res = await client().send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: this.key }),
    );
    return {
      stream: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      metadata: res.Metadata,
    };
  }
}

// Bucket facade: exposes .file(key) like @google-cloud/storage's bucket.
class Bucket {
  constructor(private readonly bucketName: string) {}
  file(key: string): File {
    return new File(this.bucketName, key);
  }
}

// Mimic the storage client export so callers that do
// `objectStorageClient.bucket(name)` keep working.
export const objectStorageClient = {
  bucket(name: string): Bucket {
    return new Bucket(name);
  },
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  // Public-asset search paths. Returned as an array of {bucket, prefix} so we
  // can hop over the (now likely single) public bucket and look for the key.
  getPublicObjectSearchPaths(): Array<string> {
    const cfgs = readPublicConfigs();
    if (cfgs.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS / R2_PUBLIC_BUCKET not set. Configure your R2 public bucket env vars.",
      );
    }
    // Return legacy "/<bucket>/<prefix>" strings so external callers stay
    // compatible. (Internal code should prefer searchPublicObject().)
    return cfgs.map(({ bucket, prefix }) => (prefix ? `/${bucket}/${prefix}` : `/${bucket}`));
  }

  // Private bucket as a single legacy "/<bucket>/<prefix>" string.
  getPrivateObjectDir(): string {
    const { bucket, prefix } = readPrivateConfig();
    if (!bucket) {
      throw new Error(
        "PRIVATE_OBJECT_DIR / R2_PRIVATE_BUCKET not set. Configure your R2 private bucket env vars.",
      );
    }
    return prefix ? `/${bucket}/${prefix}` : `/${bucket}`;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const { bucket, prefix } of readPublicConfigs()) {
      const key = prefix ? `${prefix.replace(/\/+$/, "")}/${filePath}` : filePath;
      const file = new File(bucket, key);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  // Streams the object body to the response. Shape and behaviour match the
  // previous GCS implementation so the routes layer needs no changes.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const { stream, contentType, contentLength, metadata } = await file.getStreamAndMetadata();
      // Reconstruct ACL visibility for cache-control. We stored
      // "custom:aclPolicy" as a plain "aclpolicy" header on R2.
      const aclRaw = metadata?.aclpolicy || metadata?.aclPolicy;
      let isPublic = false;
      if (aclRaw) {
        try {
          const policy = JSON.parse(aclRaw) as ObjectAclPolicy;
          isPublic = policy?.visibility === "public";
        } catch { /* malformed metadata \u2014 treat as private */ }
      }
      res.set({
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(contentLength ?? ""),
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Returns a 15-minute presigned PUT URL that the browser can hit directly
  // with the file body. R2's CORS must allow PUT from the app origin (we tell
  // the user how to set this up in the migration PR description).
  async getObjectEntityUploadURL(): Promise<string> {
    const { bucket, prefix } = readPrivateConfig();
    if (!bucket) {
      throw new Error(
        "PRIVATE_OBJECT_DIR / R2_PRIVATE_BUCKET not set. Configure your R2 private bucket env vars.",
      );
    }
    const objectId = randomUUID();
    const key = prefix ? `${prefix.replace(/\/+$/, "")}/uploads/${objectId}` : `uploads/${objectId}`;
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(client(), cmd, { expiresIn: 900 });
  }

  // Resolve an "/objects/<entityId>" path back to a real R2 File handle.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.replace(/^\/objects\//, "");
    if (!entityId) throw new ObjectNotFoundError();
    const { bucket, prefix } = readPrivateConfig();
    if (!bucket) throw new ObjectNotFoundError();
    const key = prefix ? `${prefix.replace(/\/+$/, "")}/${entityId}` : entityId;
    const file = new File(bucket, key);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  // Convert a presigned/raw URL or absolute object path into our canonical
  // "/objects/<entityId>" client-facing form.
  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;

    // Match either the GCS legacy form (https://storage.googleapis.com/...)
    // or the R2 presigned form (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?...).
    let pathname = rawPath;
    try {
      const u = new URL(rawPath);
      pathname = u.pathname;
    } catch { /* not a URL \u2014 treat rawPath as-is */ }

    const { bucket, prefix } = readPrivateConfig();
    if (!bucket) return rawPath;

    // Strip leading slash + bucket name (path-style) if present
    let key = pathname.replace(/^\/+/, "");
    if (key.startsWith(`${bucket}/`)) {
      key = key.slice(bucket.length + 1);
    }
    if (prefix) {
      const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
      if (key.startsWith(`${cleanPrefix}/`)) {
        key = key.slice(cleanPrefix.length + 1);
      }
    }
    if (!key) return rawPath;
    return `/objects/${key}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
