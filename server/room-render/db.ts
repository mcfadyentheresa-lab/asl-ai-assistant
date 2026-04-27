// DB helpers for room_renders. Mirrors the cinematic db helpers — kept thin so
// the worker only depends on what it needs.
import { db } from "../db";
import { roomRenders, type RoomRender, type InsertRoomRender } from "@shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export async function createRoomRender(row: InsertRoomRender): Promise<RoomRender> {
  const [created] = await db.insert(roomRenders).values(row).returning();
  return created;
}

export async function getRoomRender(id: number): Promise<RoomRender | undefined> {
  const [row] = await db.select().from(roomRenders).where(eq(roomRenders.id, id)).limit(1);
  return row;
}

export async function updateRoomRender(
  id: number,
  updates: Partial<InsertRoomRender>,
): Promise<RoomRender | undefined> {
  const [row] = await db
    .update(roomRenders)
    .set(updates)
    .where(eq(roomRenders.id, id))
    .returning();
  return row;
}

export async function deleteRoomRender(id: number): Promise<void> {
  await db.delete(roomRenders).where(eq(roomRenders.id, id));
}

export async function listRoomRendersForProject(
  projectId: number,
  limit = 20,
): Promise<RoomRender[]> {
  return db
    .select()
    .from(roomRenders)
    .where(eq(roomRenders.projectId, projectId))
    .orderBy(desc(roomRenders.createdAt))
    .limit(limit);
}

export async function listRoomRendersForRoom(
  projectId: number,
  roomName: string,
  limit = 20,
): Promise<RoomRender[]> {
  return db
    .select()
    .from(roomRenders)
    .where(and(eq(roomRenders.projectId, projectId), eq(roomRenders.roomName, roomName)))
    .orderBy(desc(roomRenders.createdAt))
    .limit(limit);
}

export async function nextQueuedRoomRender(): Promise<RoomRender | undefined> {
  const [row] = await db
    .select()
    .from(roomRenders)
    .where(eq(roomRenders.status, "queued"))
    .orderBy(roomRenders.id)
    .limit(1);
  return row;
}

export async function countRecentRoomRendersForBoardUser(
  boardId: number,
  userId: string,
  sinceMs: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  const rows = await db
    .select({ id: roomRenders.id })
    .from(roomRenders)
    .where(
      and(
        eq(roomRenders.boardId, boardId),
        eq(roomRenders.createdBy, userId),
        gte(roomRenders.createdAt, since),
      ),
    );
  return rows.length;
}
