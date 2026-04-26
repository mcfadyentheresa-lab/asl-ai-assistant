/**
 * Idempotent admin bootstrap, run on server startup.
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_FIRST_NAME / ADMIN_LAST_NAME from
 * env. If both ADMIN_EMAIL and ADMIN_PASSWORD are set, ensures a user exists
 * with that email, role='admin', and the given password (bcrypt-hashed).
 *
 * If either var is missing this is a no-op (logs and returns). Any error is
 * caught and logged — the server keeps starting either way, so a bootstrap
 * failure never takes the app down.
 *
 * This replaces the previous Railway preDeployCommand approach, which silently
 * failed because the predeploy container couldn't reach Postgres on the
 * service-internal hostname.
 */

import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/models/auth";

const BCRYPT_ROUNDS = 12;

function line(msg = "") {
  console.log(`[bootstrap-admin] ${msg}`);
}

export async function bootstrapAdminFromEnv(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const firstName = process.env.ADMIN_FIRST_NAME || "";
  const lastName = process.env.ADMIN_LAST_NAME || "";

  if (!email || !password) {
    line("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin bootstrap.");
    return;
  }

  if (password.length < 8) {
    line("ADMIN_PASSWORD is shorter than 8 chars — skipping. Set a longer password and redeploy.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    line(`ADMIN_EMAIL '${email}' is not a valid email — skipping.`);
    return;
  }

  try {
    line("──────────────────────────────────────────────────────");
    line("Aster & Spruce — bootstrap admin user");
    line("──────────────────────────────────────────────────────");
    line(`email=${email}`);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          passwordHash,
          role: "admin",
          firstName: firstName || existing.firstName,
          lastName: lastName || existing.lastName,
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();
      line(`updated admin id=${updated.id}`);
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          role: "admin",
          firstName: firstName || null,
          lastName: lastName || null,
        })
        .returning();
      line(`created admin id=${created.id}`);
    }

    line(`done. sign in at /login with ${email}`);
  } catch (err: any) {
    line(`FAILED: ${err?.message || err}`);
    if (err?.stack) {
      console.error(err.stack);
    }
    // Swallow — server should still start.
  }
}
