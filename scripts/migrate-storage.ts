#!/usr/bin/env node
/**
 * Storage migration helper.
 *
 * Doesn't move data itself — it preflights the env, prints the exact
 * gsutil/rsync commands you should run, and verifies the new bucket is
 * reachable with the new credentials before you cut over.
 *
 * Usage:
 *   npm run migrate:storage -- --from gs://OLD_REPLIT_BUCKET --to gs://NEW_BUCKET
 *
 * Optional flags:
 *   --dry-run      print commands but don't run anything (default)
 *   --execute      actually run gsutil rsync
 *   --skip-verify  skip the post-rsync read check
 *
 * Requires: gsutil installed and authenticated (gcloud auth login or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at the service-account key).
 */

import "dotenv/config";
import { spawnSync } from "child_process";
import { Storage } from "@google-cloud/storage";

interface Args {
  from?: string;
  to?: string;
  execute: boolean;
  skipVerify: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const args: Args = { execute: false, skipVerify: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--from") args.from = a[++i];
    else if (a[i] === "--to") args.to = a[++i];
    else if (a[i] === "--execute") args.execute = true;
    else if (a[i] === "--dry-run") args.execute = false;
    else if (a[i] === "--skip-verify") args.skipVerify = true;
    else if (a[i] === "--help" || a[i] === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
  }
  return args;
}

const USAGE = `
Storage migration helper.

  npm run migrate:storage -- --from gs://OLD --to gs://NEW [--execute] [--skip-verify]

  --from <uri>     source bucket URI
  --to <uri>       destination bucket URI
  --execute        actually run gsutil rsync (default is dry-run preview)
  --skip-verify    skip the read check on the destination
`;

function checkEnv(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GCS_PROJECT_ID) missing.push("GCS_PROJECT_ID");
  if (!process.env.GCS_CREDENTIALS_JSON && !process.env.GCS_KEY_FILE && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    missing.push("GCS_CREDENTIALS_JSON or GCS_KEY_FILE (or GOOGLE_APPLICATION_CREDENTIALS)");
  }
  return { ok: missing.length === 0, missing };
}

function checkGsutil(): boolean {
  const r = spawnSync("gsutil", ["version"], { stdio: "ignore" });
  return r.status === 0;
}

async function listSomeObjects(bucketUri: string): Promise<{ count: number; sample: string[] }> {
  // bucketUri is gs://name[/prefix]
  const m = bucketUri.match(/^gs:\/\/([^\/]+)(?:\/(.*))?$/);
  if (!m) throw new Error(`Invalid GCS URI: ${bucketUri}`);
  const [, bucketName, prefix] = m;

  let storage: Storage;
  if (process.env.GCS_CREDENTIALS_JSON) {
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: JSON.parse(process.env.GCS_CREDENTIALS_JSON),
    });
  } else if (process.env.GCS_KEY_FILE) {
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE,
    });
  } else {
    storage = new Storage({ projectId: process.env.GCS_PROJECT_ID });
  }

  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: prefix || undefined,
    maxResults: 5,
  });
  return { count: files.length, sample: files.map((f) => f.name) };
}

async function main() {
  const args = parseArgs();
  if (!args.from || !args.to) {
    console.error(USAGE);
    process.exit(1);
  }

  console.log("");
  console.log("──────────────────────────────────────────────────────");
  console.log("  Aster & Spruce — storage migration helper");
  console.log("──────────────────────────────────────────────────────");
  console.log("");
  console.log(`  Source:      ${args.from}`);
  console.log(`  Destination: ${args.to}`);
  console.log(`  Mode:        ${args.execute ? "EXECUTE" : "dry-run (use --execute to run for real)"}`);
  console.log("");

  // 1. Env preflight
  const env = checkEnv();
  if (!env.ok) {
    console.error("Missing required env vars for the new bucket:");
    for (const m of env.missing) console.error(`  - ${m}`);
    console.error("");
    console.error("Set these before running, then re-run.");
    process.exit(1);
  }
  console.log("✓ Env vars present (GCS_PROJECT_ID, credentials)");

  // 2. gsutil installed?
  if (!checkGsutil()) {
    console.error("");
    console.error("gsutil is not installed or not on PATH.");
    console.error("Install: https://cloud.google.com/sdk/docs/install");
    console.error("Or run the rsync from a machine that has it (your laptop).");
    process.exit(1);
  }
  console.log("✓ gsutil available");

  // 3. Print the commands
  const rsyncCmd = ["gsutil", "-m", "rsync", "-r", args.from, args.to];
  console.log("");
  console.log("Command:");
  console.log("  " + rsyncCmd.join(" "));
  console.log("");

  if (!args.execute) {
    console.log("This was a dry-run. Re-run with --execute to actually copy files.");
    console.log("");
    console.log("After the rsync completes:");
    console.log("  1. Update PUBLIC_OBJECT_SEARCH_PATHS and PRIVATE_OBJECT_DIR on Railway");
    console.log("  2. Redeploy the app");
    console.log("  3. Verify uploads work end-to-end");
    process.exit(0);
  }

  // 4. Execute
  console.log("Running rsync (this may take a while for large buckets)…");
  const r = spawnSync(rsyncCmd[0], rsyncCmd.slice(1), { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("");
    console.error(`rsync exited with code ${r.status}`);
    process.exit(r.status || 1);
  }

  // 5. Post-verify
  if (!args.skipVerify) {
    console.log("");
    console.log("Verifying destination is readable with the new credentials…");
    try {
      const result = await listSomeObjects(args.to);
      if (result.count === 0) {
        console.warn("⚠  Destination is reachable but appears empty. Check the rsync output above.");
      } else {
        console.log(`✓ Destination is readable. ${result.count} sample objects:`);
        for (const name of result.sample) console.log(`    - ${name}`);
      }
    } catch (err: any) {
      console.error("");
      console.error("⚠  Could not list destination with the new credentials:");
      console.error("   " + (err.message || err));
      console.error("");
      console.error("   The data was copied, but your service account may lack");
      console.error("   Storage Object Admin on the destination bucket.");
      process.exit(2);
    }
  }

  console.log("");
  console.log("Done. Next steps:");
  console.log("  1. Update PUBLIC_OBJECT_SEARCH_PATHS and PRIVATE_OBJECT_DIR on Railway");
  console.log("  2. Redeploy the app");
  console.log("  3. Verify uploads work end-to-end");
  console.log("");
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
