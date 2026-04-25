import { users, sessions, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  updateUserPhone(id: string, phone: string | null): Promise<User | undefined>;
  updateUserProfile(id: string, data: { firstName?: string | null; lastName?: string | null; email?: string; role?: string; phone?: string | null; onboardingCompleted?: Date; smsNotifications?: boolean; emailNotifications?: boolean }): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  archiveUser(id: string): Promise<User | undefined>;
  unarchiveUser(id: string): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    if (userData.email) {
      const [existingByEmail] = await db.select().from(users).where(eq(users.email, userData.email));
      if (existingByEmail && existingByEmail.id !== userData.id) {
        const oldId = existingByEmail.id;
        const newId = userData.id!;
        await db.update(users).set({ email: null }).where(eq(users.id, oldId));
        const [user] = await db
          .insert(users)
          .values({
            ...userData,
            role: existingByEmail.role,
            phone: existingByEmail.phone ?? userData.phone,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              ...userData,
              role: existingByEmail.role,
              phone: existingByEmail.phone ?? userData.phone,
              updatedAt: new Date(),
            },
          })
          .returning();

        const { projects, clientInvites } = await import("@shared/schema");
        await db.update(projects).set({ clientId: newId }).where(eq(projects.clientId, oldId));
        await db.update(clientInvites).set({ userId: newId }).where(eq(clientInvites.userId, oldId));

        try {
          await db.delete(users).where(eq(users.id, oldId));
        } catch {}

        return user;
      }
    }
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPhone(id: string, phone: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ phone, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserProfile(id: string, data: { firstName?: string | null; lastName?: string | null; email?: string; role?: string; phone?: string | null; onboardingCompleted?: Date; smsNotifications?: boolean; emailNotifications?: boolean }): Promise<User | undefined> {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.firstName !== undefined) setData.firstName = data.firstName;
    if (data.lastName !== undefined) setData.lastName = data.lastName;
    if (data.email !== undefined) setData.email = data.email;
    if (data.role !== undefined) setData.role = data.role;
    if (data.phone !== undefined) setData.phone = data.phone;
    if (data.onboardingCompleted !== undefined) setData.onboardingCompleted = data.onboardingCompleted;
    if (data.smsNotifications !== undefined) setData.smsNotifications = data.smsNotifications;
    if (data.emailNotifications !== undefined) setData.emailNotifications = data.emailNotifications;
    const [user] = await db
      .update(users)
      .set(setData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async archiveUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async unarchiveUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.execute(sql`UPDATE projects SET client_id = NULL WHERE client_id = ${id}`);
    await db.execute(sql`UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ${id}`);
    await db.execute(sql`DELETE FROM time_entries WHERE user_id = ${id}`);
    await db.execute(sql`UPDATE planning_boards SET updated_by = NULL WHERE updated_by = ${id}`);
    await db.execute(sql`DELETE FROM messages WHERE sender_id = ${id}`);
    await db.execute(sql`DELETE FROM activity_views WHERE user_id = ${id}`);
    await db.execute(sql`DELETE FROM activity_log WHERE user_id = ${id}`);
    await db.execute(sql`DELETE FROM sessions WHERE "sess" ::jsonb -> 'passport' ->> 'user' = ${id}`);
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}

export const authStorage = new AuthStorage();
