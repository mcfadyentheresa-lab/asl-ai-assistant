import { Storage } from "@google-cloud/storage";

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

const EXPECTED_IMAGES = [
  "kitchen-cabinets.png",
  "kitchen-countertop.png",
  "kitchen-range.png",
  "kitchen-tile.png",
  "kitchen-pendants.png",
  "bath-tub.png",
  "bath-vanity.png",
  "bath-sconce.png",
  "bath-hex-tile.png",
  "cottage-exterior.png",
  "cottage-trusses.png",
  "cottage-dock.png",
  "cottage-fireplace.png",
  "mood-sofa.png",
  "mood-oak-floor.png",
];

async function main() {
  if (!BUCKET_ID) {
    console.error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
    process.exit(1);
  }

  const bucket = storage.bucket(BUCKET_ID);
  let allOk = true;

  for (const filename of EXPECTED_IMAGES) {
    const objectPath = `public/images/templates/${filename}`;
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();

    if (exists) {
      const [metadata] = await file.getMetadata();
      const size = metadata.size ? `${Math.round(Number(metadata.size) / 1024)}KB` : "unknown size";
      console.log(`  ✓ ${filename} (${size})`);
    } else {
      console.log(`  ✗ ${filename} — MISSING`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log(`\nAll ${EXPECTED_IMAGES.length} template images verified in object storage.`);
  } else {
    console.error("\nSome images are missing! Run: npx tsx scripts/upload-template-images.ts");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
