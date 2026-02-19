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
  updateUserProfile(id: string, data: { firstName?: string; lastName?: string; email?: string; role?: string; phone?: string | null }): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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

  async updateUserProfile(id: string, data: { firstName?: string; lastName?: string; email?: string; role?: string; phone?: string | null }): Promise<User | undefined> {
    const setData: any = { updatedAt: new Date() };
    if (data.firstName !== undefined) setData.firstName = data.firstName;
    if (data.lastName !== undefined) setData.lastName = data.lastName;
    if (data.email !== undefined) setData.email = data.email;
    if (data.role !== undefined) setData.role = data.role;
    if (data.phone !== undefined) setData.phone = data.phone;
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

  async deleteUser(id: string): Promise<boolean> {
    await db.execute(sql`UPDATE projects SET client_id = NULL WHERE client_id = ${id}`);
    await db.execute(sql`UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ${id}`);
    await db.execute(sql`UPDATE photos SET created_by = NULL WHERE created_by = ${id}`);
    await db.execute(sql`UPDATE documents SET created_by = NULL WHERE created_by = ${id}`);
    await db.execute(sql`DELETE FROM time_entries WHERE user_id = ${id}`);
    await db.execute(sql`UPDATE planning_boards SET created_by = NULL WHERE created_by = ${id}`);
    await db.execute(sql`DELETE FROM messages WHERE sender_id = ${id}`);
    await db.execute(sql`DELETE FROM activity_log WHERE user_id = ${id}`);
    await db.execute(sql`DELETE FROM activity_views WHERE user_id = ${id}`);
    await db.execute(sql`DELETE FROM sessions WHERE "sess" ::jsonb -> 'passport' ->> 'user' = ${id}`);
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}

export const authStorage = new AuthStorage();
