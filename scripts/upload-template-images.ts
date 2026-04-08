import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID!;
const SOURCE_DIR = path.join(process.cwd(), "attached_assets/template-images");
const DEST_PREFIX = "public/images/templates";

async function main() {
  if (!BUCKET_ID) {
    console.error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
    process.exit(1);
  }

  const bucket = storage.bucket(BUCKET_ID);
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".png"));

  if (files.length === 0) {
    console.error("No .png files found in", SOURCE_DIR);
    process.exit(1);
  }

  console.log(`Uploading ${files.length} images to ${BUCKET_ID}/${DEST_PREFIX}/...`);

  for (const filename of files) {
    const localPath = path.join(SOURCE_DIR, filename);
    const destPath = `${DEST_PREFIX}/${filename}`;

    await bucket.upload(localPath, {
      destination: destPath,
      metadata: {
        contentType: "image/png",
      },
    });
    console.log(`  ✓ ${destPath}`);
  }

  console.log(`\nDone! ${files.length} images uploaded to object storage.`);
  console.log(`They are served at: /api/public-assets/images/templates/<filename>.png`);
}

main().catch(err => {
  console.error("Upload failed:", err);
  process.exit(1);
});
