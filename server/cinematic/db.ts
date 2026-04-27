// DB helpers for cinematic_reviews. Kept separate from server/storage.ts so
// the worker pulls only what it needs without inflating the main IStorage.
import { db } from "../db";
import { cinematicReviews, type CinematicReview, type InsertCinematicReview } from "@shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export async function createCinematicReview(row: InsertCinematicReview): Promise<CinematicReview> {
  const [created] = await db.insert(cinematicReviews).values(row).returning();
  return created;
}

export async function getCinematicReview(id: number): Promise<CinematicReview | undefined> {
  const [row] = await db.select().from(cinematicReviews).where(eq(cinematicReviews.id, id)).limit(1);
  return row;
}

export async function updateCinematicReview(
  id: number,
  updates: Partial<InsertCinematicReview>,
): Promise<CinematicReview | undefined> {
  const [row] = await db
    .update(cinematicReviews)
    .set(updates)
    .where(eq(cinematicReviews.id, id))
    .returning();
  return row;
}

export async function listCinematicReviewsForProject(
  projectId: number,
  limit = 20,
): Promise<CinematicReview[]> {
  return db
    .select()
    .from(cinematicReviews)
    .where(eq(cinematicReviews.projectId, projectId))
    .orderBy(desc(cinematicReviews.createdAt))
    .limit(limit);
}

export async function nextQueuedCinematicReview(): Promise<CinematicReview | undefined> {
  const [row] = await db
    .select()
    .from(cinematicReviews)
    .where(eq(cinematicReviews.status, "queued"))
    .orderBy(cinematicReviews.id)
    .limit(1);
  return row;
}

export async function countRecentCinematicReviewsForBoardUser(
  boardId: number,
  userId: string,
  sinceMs: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceMs);
  const rows = await db
    .select({ id: cinematicReviews.id })
    .from(cinematicReviews)
    .where(
      and(
        eq(cinematicReviews.boardId, boardId),
        eq(cinematicReviews.createdBy, userId),
        gte(cinematicReviews.createdAt, since),
      ),
    );
  return rows.length;
}
