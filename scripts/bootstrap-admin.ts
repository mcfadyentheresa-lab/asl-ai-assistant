#!/usr/bin/env node
/**
 * Interactive CLI to create (or reset) the first admin user.
 *
 * Usage:
 *   npm run bootstrap:admin
 *
 * Or non-interactively (CI / one-liner):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='s3cret!' \
 *     ADMIN_FIRST_NAME=Theresa ADMIN_LAST_NAME=McFadyen \
 *     npm run bootstrap:admin
 *
 * What it does:
 *   - Connects to DATABASE_URL
 *   - Prompts for email + password (or reads env)
 *   - Hashes the password with bcrypt (12 rounds)
 *   - Inserts (or updates if email already exists) the user with role='admin'
 *   - Prints the user id when done
 *
 * Safe to run multiple times. If the email already has a user, it will:
 *   - update the password
 *   - promote the user to role='admin'
 *   - clear archivedAt
 */

import "dotenv/config";
import readline from "readline";
import { Writable } from "stream";
import bcrypt from "bcrypt";
import { db } from "../server/db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const BCRYPT_ROUNDS = 12;

function prompt(question: string, opts: { masked?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    const muted = new Writable({
      write(chunk, _enc, cb) {
        if (!opts.masked) {
          process.stdout.write(chunk);
        }
        cb();
      },
    });
    const rl = readline.createInterface({
      input: process.stdin,
      output: muted as any,
      terminal: true,
    });
    process.stdout.write(question);
    rl.question("", (answer) => {
      if (opts.masked) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set. Source your .env or export it before running.");
    process.exit(1);
  }

  console.log("");
  console.log("──────────────────────────────────────────────────────");
  console.log("  Aster & Spruce — bootstrap admin user");
  console.log("──────────────────────────────────────────────────────");
  console.log("");

  let email = process.env.ADMIN_EMAIL || "";
  let password = process.env.ADMIN_PASSWORD || "";
  let firstName = process.env.ADMIN_FIRST_NAME || "";
  let lastName = process.env.ADMIN_LAST_NAME || "";

  if (!email) {
    email = await prompt("Email:        ");
  }
  email = email.toLowerCase().trim();
  if (!isValidEmail(email)) {
    console.error("Invalid email address.");
    process.exit(1);
  }

  if (!firstName) firstName = await prompt("First name:   ");
  if (!lastName) lastName = await prompt("Last name:    ");

  if (!password) {
    password = await prompt("Password:     ", { masked: true });
    const confirm = await prompt("Confirm:      ", { masked: true });
    if (password !== confirm) {
      console.error("Passwords don't match.");
      process.exit(1);
    }
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  console.log("");
  console.log("Hashing password (bcrypt, 12 rounds)…");
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Check for existing user
  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    console.log(`User ${email} already exists (id=${existing.id}). Updating password and ensuring role='admin'.`);
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
    console.log("");
    console.log(`  Done. id=${updated.id}`);
    console.log(`  Sign in at /login with ${email}.`);
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
    console.log("");
    console.log(`  Done. id=${created.id}`);
    console.log(`  Sign in at /login with ${email}.`);
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("Failed:", err.message || err);
  process.exit(1);
});
