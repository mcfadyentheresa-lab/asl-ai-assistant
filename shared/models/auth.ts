import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  // bcrypt hash of the user's password. Null until they complete an invite
  // or password-reset flow.
  passwordHash: varchar("password_hash"),
  // Optional TOTP secret. When set + mfaEnabled=true, login requires a 6-digit code.
  mfaSecret: varchar("mfa_secret"),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("client").notNull(),
  onboardingCompleted: timestamp("onboarding_completed"),
  smsNotifications: boolean("sms_notifications").default(true),
  emailNotifications: boolean("email_notifications").default(true),
  archivedAt: timestamp("archived_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Generic invite tokens (covers crew invites, password resets, etc).
// Client invites continue to live in the existing client_invites table.
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  // "crew_invite" | "password_reset" | "email_verify"
  kind: varchar("kind", { length: 32 }).notNull(),
  email: varchar("email").notNull(),
  // Pre-assigned role for invite tokens ("crew" | "client" | "admin").
  role: varchar("role"),
  // For password resets, the user this token belongs to.
  userId: varchar("user_id"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  // Audit: who created the invite (admin user id). Null for self-service resets.
  createdBy: varchar("created_by"),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
