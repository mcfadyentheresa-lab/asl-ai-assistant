import { db } from "./db";
import { 
  users, projects, milestones, tasks, photos, documents, timeEntries, messages, checklistItems, boardItems, calendarEvents, planningBoards, canvasElements, activityLog, activityViews,
  type Project, type Milestone, type Task, type Photo, type Document, type TimeEntry, type Message,
  type ChecklistItem, type BoardItem, type CalendarEvent, type PlanningBoard, type CanvasElement, type ActivityLog,
  type InsertProject, type InsertMilestone, type InsertTask, type InsertPhoto, type InsertDocument, 
  type InsertTimeEntry, type InsertMessage, type InsertChecklistItem, type InsertBoardItem, type InsertCalendarEvent, type InsertPlanningBoard, type InsertCanvasElement, type InsertActivityLog
} from "@shared/schema";
import { type User } from "@shared/models/auth";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByClient(clientId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<Project>;

  // Milestones
  getMilestones(projectId: number): Promise<Milestone[]>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;

  // Tasks
  getTasks(projectId: number): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task>;

  // Photos
  getPhotos(projectId: number): Promise<Photo[]>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  deletePhoto(id: number): Promise<void>;

  // Documents
  getDocuments(projectId: number): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  // Messages
  getMessages(projectId: number): Promise<(Message & { sender: User | null })[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // Time Entries
  getTimeEntries(projectId: number): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;

  // Projects - archive & delete
  deleteProject(id: number): Promise<void>;

  // Checklist Items
  getChecklistItems(projectId: number): Promise<ChecklistItem[]>;
  createChecklistItem(item: InsertChecklistItem): Promise<ChecklistItem>;
  updateChecklistItem(id: number, updates: Partial<InsertChecklistItem>): Promise<ChecklistItem>;
  deleteChecklistItem(id: number): Promise<void>;

  // Board Items
  getBoardItems(projectId: number): Promise<BoardItem[]>;
  createBoardItem(item: InsertBoardItem): Promise<BoardItem>;
  updateBoardItem(id: number, updates: Partial<InsertBoardItem>): Promise<BoardItem>;
  deleteBoardItem(id: number): Promise<void>;

  // Calendar Events
  getCalendarEvents(projectId: number): Promise<CalendarEvent[]>;
  getCalendarEvent(id: number): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, updates: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  deleteCalendarEvent(id: number): Promise<void>;

  // Planning Boards
  getPlanningBoards(projectId: number): Promise<PlanningBoard[]>;
  getPlanningBoard(id: number): Promise<PlanningBoard | undefined>;
  createPlanningBoard(board: InsertPlanningBoard): Promise<PlanningBoard>;
  updatePlanningBoard(id: number, updates: Partial<InsertPlanningBoard>): Promise<PlanningBoard>;
  deletePlanningBoard(id: number): Promise<void>;
  savePlanningBoardCanvas(id: number, canvasData: any, updatedBy: string): Promise<PlanningBoard>;

  // Activity Log
  getActivityLog(projectId: number, limit?: number): Promise<ActivityLog[]>;
  createActivityLog(entry: InsertActivityLog): Promise<ActivityLog>;
  getActivityViews(activityIds: number[]): Promise<{ activityId: number; userId: string; viewedAt: Date | null }[]>;
  markActivityViewed(activityId: number, userId: string): Promise<void>;
  cleanupOldActivity(daysOld: number): Promise<number>;
  deleteActivityByTypeAndTitle(projectId: number, type: string, titlePattern: string): Promise<number>;

  // Canvas Elements
  getCanvasElement(id: number): Promise<CanvasElement | undefined>;
  getCanvasElements(boardId: number): Promise<CanvasElement[]>;
  createCanvasElement(element: InsertCanvasElement): Promise<CanvasElement>;
  createCanvasElements(elements: InsertCanvasElement[]): Promise<CanvasElement[]>;
  updateCanvasElement(id: number, updates: Partial<InsertCanvasElement>): Promise<CanvasElement>;
  updateCanvasElementPositions(boardId: number, updates: { id: number; x: number; y: number; width?: number; height?: number; zIndex?: number; parentColumnId?: number | null }[]): Promise<void>;
  deleteCanvasElement(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }
  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
  }
  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }
  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project> {
    const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return updated;
  }

  // Milestones
  async getMilestones(projectId: number): Promise<Milestone[]> {
    return await db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(milestones.date);
  }
  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [newMilestone] = await db.insert(milestones).values(milestone).returning();
    return newMilestone;
  }

  // Tasks
  async getTasks(projectId: number): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(tasks.dueDate);
  }
  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }
  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }

  // Photos
  async getPhotos(projectId: number): Promise<Photo[]> {
    return await db.select().from(photos).where(eq(photos.projectId, projectId)).orderBy(desc(photos.createdAt));
  }
  async createPhoto(photo: InsertPhoto): Promise<Photo> {
    const [newPhoto] = await db.insert(photos).values(photo).returning();
    return newPhoto;
  }
  async deletePhoto(id: number): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }

  // Documents
  async getDocuments(projectId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.createdAt));
  }
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
  }
  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Messages
  async getMessages(projectId: number): Promise<(Message & { sender: User | null })[]> {
    const results = await db.select({
      message: messages,
      sender: users
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.projectId, projectId))
    .orderBy(desc(messages.createdAt));

    return results.map(r => ({ ...r.message, sender: r.sender }));
  }
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  // Time Entries
  async getTimeEntries(projectId: number): Promise<TimeEntry[]> {
    return await db.select().from(timeEntries).where(eq(timeEntries.projectId, projectId)).orderBy(desc(timeEntries.startTime));
  }
  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [newEntry] = await db.insert(timeEntries).values(entry).returning();
    return newEntry;
  }

  // Delete project (cascading deletes handled by cleaning up related data)
  async deleteProject(id: number): Promise<void> {
    const boards = await db.select().from(planningBoards).where(eq(planningBoards.projectId, id));
    for (const board of boards) {
      await db.delete(canvasElements).where(eq(canvasElements.boardId, board.id));
    }
    await db.delete(planningBoards).where(eq(planningBoards.projectId, id));
    await db.delete(calendarEvents).where(eq(calendarEvents.projectId, id));
    await db.delete(checklistItems).where(eq(checklistItems.projectId, id));
    await db.delete(boardItems).where(eq(boardItems.projectId, id));
    await db.delete(messages).where(eq(messages.projectId, id));
    await db.delete(timeEntries).where(eq(timeEntries.projectId, id));
    await db.delete(documents).where(eq(documents.projectId, id));
    await db.delete(photos).where(eq(photos.projectId, id));
    await db.delete(tasks).where(eq(tasks.projectId, id));
    await db.delete(milestones).where(eq(milestones.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Checklist Items
  async getChecklistItems(projectId: number): Promise<ChecklistItem[]> {
    return await db.select().from(checklistItems).where(eq(checklistItems.projectId, projectId)).orderBy(checklistItems.createdAt);
  }
  async createChecklistItem(item: InsertChecklistItem): Promise<ChecklistItem> {
    const [newItem] = await db.insert(checklistItems).values(item).returning();
    return newItem;
  }
  async updateChecklistItem(id: number, updates: Partial<InsertChecklistItem>): Promise<ChecklistItem> {
    const [updated] = await db.update(checklistItems).set(updates).where(eq(checklistItems.id, id)).returning();
    return updated;
  }
  async deleteChecklistItem(id: number): Promise<void> {
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
  }

  // Board Items
  async getBoardItems(projectId: number): Promise<BoardItem[]> {
    return await db.select().from(boardItems).where(eq(boardItems.projectId, projectId)).orderBy(desc(boardItems.createdAt));
  }
  async createBoardItem(item: InsertBoardItem): Promise<BoardItem> {
    const [newItem] = await db.insert(boardItems).values(item).returning();
    return newItem;
  }
  async updateBoardItem(id: number, updates: Partial<InsertBoardItem>): Promise<BoardItem> {
    const [updated] = await db.update(boardItems).set(updates).where(eq(boardItems.id, id)).returning();
    return updated;
  }
  async deleteBoardItem(id: number): Promise<void> {
    await db.delete(boardItems).where(eq(boardItems.id, id));
  }

  // Calendar Events
  async getCalendarEvents(projectId: number): Promise<CalendarEvent[]> {
    return await db.select().from(calendarEvents).where(eq(calendarEvents.projectId, projectId)).orderBy(calendarEvents.date);
  }
  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return event;
  }
  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [newEvent] = await db.insert(calendarEvents).values(event).returning();
    return newEvent;
  }
  async updateCalendarEvent(id: number, updates: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    const [updated] = await db.update(calendarEvents).set(updates).where(eq(calendarEvents.id, id)).returning();
    return updated;
  }
  async deleteCalendarEvent(id: number): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  // Planning Boards
  async getPlanningBoards(projectId: number): Promise<PlanningBoard[]> {
    return db.select().from(planningBoards).where(eq(planningBoards.projectId, projectId)).orderBy(desc(planningBoards.createdAt));
  }
  async getPlanningBoard(id: number): Promise<PlanningBoard | undefined> {
    const [board] = await db.select().from(planningBoards).where(eq(planningBoards.id, id));
    return board;
  }
  async createPlanningBoard(board: InsertPlanningBoard): Promise<PlanningBoard> {
    const [created] = await db.insert(planningBoards).values(board).returning();
    return created;
  }
  async updatePlanningBoard(id: number, updates: Partial<InsertPlanningBoard>): Promise<PlanningBoard> {
    const [updated] = await db.update(planningBoards).set({ ...updates, updatedAt: new Date() }).where(eq(planningBoards.id, id)).returning();
    return updated;
  }
  async deletePlanningBoard(id: number): Promise<void> {
    await db.delete(planningBoards).where(eq(planningBoards.id, id));
  }
  async savePlanningBoardCanvas(id: number, canvasData: any, updatedBy: string): Promise<PlanningBoard> {
    const [updated] = await db.update(planningBoards)
      .set({ canvasData, updatedBy, updatedAt: new Date() })
      .where(eq(planningBoards.id, id))
      .returning();
    return updated;
  }

  // Activity Log
  async getActivityLog(projectId: number, limit = 20): Promise<ActivityLog[]> {
    return db.select().from(activityLog).where(eq(activityLog.projectId, projectId)).orderBy(desc(activityLog.createdAt)).limit(limit);
  }
  async createActivityLog(entry: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  }
  async getActivityViews(activityIds: number[]): Promise<{ activityId: number; userId: string; viewedAt: Date | null }[]> {
    if (activityIds.length === 0) return [];
    const { inArray } = await import("drizzle-orm");
    return db.select({
      activityId: activityViews.activityId,
      userId: activityViews.userId,
      viewedAt: activityViews.viewedAt,
    }).from(activityViews).where(inArray(activityViews.activityId, activityIds));
  }
  async markActivityViewed(activityId: number, userId: string): Promise<void> {
    const existing = await db.select().from(activityViews)
      .where(and(eq(activityViews.activityId, activityId), eq(activityViews.userId, userId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(activityViews).values({ activityId, userId });
    }
  }
  async cleanupOldActivity(daysOld: number): Promise<number> {
    const { lt } = await import("drizzle-orm");
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const deleted = await db.delete(activityLog).where(lt(activityLog.createdAt, cutoff)).returning({ id: activityLog.id });
    return deleted.length;
  }
  async deleteActivityByTypeAndTitle(projectId: number, type: string, titlePattern: string): Promise<number> {
    const deleted = await db.delete(activityLog).where(and(eq(activityLog.projectId, projectId), eq(activityLog.type, type), eq(activityLog.title, titlePattern))).returning({ id: activityLog.id });
    return deleted.length;
  }

  // Canvas Elements
  async getCanvasElement(id: number): Promise<CanvasElement | undefined> {
    const [el] = await db.select().from(canvasElements).where(eq(canvasElements.id, id));
    return el;
  }
  async getCanvasElements(boardId: number): Promise<CanvasElement[]> {
    return db.select().from(canvasElements).where(eq(canvasElements.boardId, boardId)).orderBy(canvasElements.zIndex);
  }
  async createCanvasElement(element: InsertCanvasElement): Promise<CanvasElement> {
    const [created] = await db.insert(canvasElements).values(element).returning();
    return created;
  }
  async createCanvasElements(elements: InsertCanvasElement[]): Promise<CanvasElement[]> {
    if (elements.length === 0) return [];
    return db.insert(canvasElements).values(elements).returning();
  }
  async updateCanvasElement(id: number, updates: Partial<InsertCanvasElement>): Promise<CanvasElement> {
    const [updated] = await db.update(canvasElements).set({ ...updates, updatedAt: new Date() }).where(eq(canvasElements.id, id)).returning();
    return updated;
  }
  async updateCanvasElementPositions(boardId: number, updates: { id: number; x: number; y: number; width?: number; height?: number; zIndex?: number; parentColumnId?: number | null }[]): Promise<void> {
    for (const u of updates) {
      const vals: any = { x: u.x, y: u.y, updatedAt: new Date() };
      if (u.width !== undefined) vals.width = u.width;
      if (u.height !== undefined) vals.height = u.height;
      if (u.zIndex !== undefined) vals.zIndex = u.zIndex;
      if (u.parentColumnId !== undefined) vals.parentColumnId = u.parentColumnId;
      await db.update(canvasElements).set(vals).where(and(eq(canvasElements.id, u.id), eq(canvasElements.boardId, boardId)));
    }
  }
  async deleteCanvasElement(id: number): Promise<void> {
    await db.delete(canvasElements).where(eq(canvasElements.id, id));
  }
}

export const storage = new DatabaseStorage();
