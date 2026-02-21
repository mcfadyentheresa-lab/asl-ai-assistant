import { db } from "./db";
import { 
  users, projects, milestones, subMilestones, tasks, photos, documents, timeEntries, messages, checklistItems, boardItems, calendarEvents, planningBoards, canvasElements, activityLog, activityViews, paintColors, boardSnapshots, costCategories, marketRates, projectEstimates, estimateItems, receipts, estimateWarnings,
  type Project, type Milestone, type SubMilestone, type Task, type Photo, type Document, type TimeEntry, type Message,
  type ChecklistItem, type BoardItem, type CalendarEvent, type PlanningBoard, type CanvasElement, type ActivityLog, type PaintColor, type BoardSnapshot, type CostCategory, type MarketRate, type ProjectEstimate, type EstimateItem, type Receipt, type EstimateWarning,
  type InsertProject, type InsertMilestone, type InsertSubMilestone, type InsertTask, type InsertPhoto, type InsertDocument, 
  type InsertTimeEntry, type InsertMessage, type InsertChecklistItem, type InsertBoardItem, type InsertCalendarEvent, type InsertPlanningBoard, type InsertCanvasElement, type InsertActivityLog, type InsertBoardSnapshot, type InsertCostCategory, type InsertMarketRate, type InsertProjectEstimate, type InsertEstimateItem, type InsertReceipt, type InsertEstimateWarning
} from "@shared/schema";
import { type User } from "@shared/models/auth";
import { eq, desc, and, ilike, or, gte, lte, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByClient(clientId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<Project>;

  // Milestones
  getMilestones(projectId: number): Promise<Milestone[]>;
  getMilestone(id: number): Promise<Milestone | undefined>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, data: Partial<InsertMilestone>): Promise<Milestone>;
  deleteMilestone(id: number): Promise<void>;

  // Sub-Milestones
  getSubMilestones(milestoneId: number): Promise<SubMilestone[]>;
  createSubMilestone(sub: InsertSubMilestone): Promise<SubMilestone>;
  updateSubMilestone(id: number, data: Partial<InsertSubMilestone>): Promise<SubMilestone>;
  deleteSubMilestone(id: number): Promise<void>;

  // Tasks
  getTasks(projectId: number): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task>;

  // Photos
  getPhotos(projectId: number): Promise<Photo[]>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  deletePhoto(id: number): Promise<void>;
  tagPhoto(photoId: number, planningBoardId: number | null): Promise<void>;

  // Documents
  getDocuments(projectId: number): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  // Messages
  getMessages(projectId: number): Promise<(Message & { sender: User | null })[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // Time Entries / Timesheets
  getTimeEntries(projectId: number): Promise<TimeEntry[]>;
  getTimeEntriesByUser(userId: string, startDate?: string, endDate?: string): Promise<TimeEntry[]>;
  getTimeEntriesByPeriod(startDate: string, endDate: string): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(id: number): Promise<void>;
  bulkCreateTimeEntries(entries: InsertTimeEntry[]): Promise<TimeEntry[]>;
  approveTimeEntries(ids: number[], approvedBy: string): Promise<TimeEntry[]>;

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
  getCalendarEventsByType(projectId: number, type: string): Promise<CalendarEvent[]>;

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

  // Paint Colors
  getPaintColors(filters?: { brand?: string; colorFamily?: string; search?: string; popular?: boolean }): Promise<PaintColor[]>;
  getPaintColor(id: number): Promise<PaintColor | undefined>;
  getPaintColorFamilies(brand?: string): Promise<string[]>;

  // Canvas Elements
  getCanvasElement(id: number): Promise<CanvasElement | undefined>;
  getCanvasElements(boardId: number): Promise<CanvasElement[]>;
  createCanvasElement(element: InsertCanvasElement): Promise<CanvasElement>;
  createCanvasElements(elements: InsertCanvasElement[]): Promise<CanvasElement[]>;
  updateCanvasElement(id: number, updates: Partial<InsertCanvasElement>): Promise<CanvasElement>;
  updateCanvasElementPositions(boardId: number, updates: { id: number; x: number; y: number; width?: number; height?: number; zIndex?: number; parentColumnId?: number | null }[]): Promise<void>;
  deleteCanvasElement(id: number): Promise<void>;

  // Board Snapshots
  getBoardSnapshots(boardId: number): Promise<BoardSnapshot[]>;
  createBoardSnapshot(snapshot: InsertBoardSnapshot): Promise<BoardSnapshot>;
  getBoardSnapshot(id: number): Promise<BoardSnapshot | undefined>;
  deleteBoardSnapshot(id: number): Promise<void>;

  // Cost Categories
  getCostCategories(): Promise<CostCategory[]>;
  createCostCategory(cat: InsertCostCategory): Promise<CostCategory>;
  updateCostCategory(id: number, updates: Partial<InsertCostCategory>): Promise<CostCategory>;
  deleteCostCategory(id: number): Promise<void>;

  // Market Rates
  getMarketRates(categoryId?: number, activeOnly?: boolean): Promise<MarketRate[]>;
  createMarketRate(rate: InsertMarketRate): Promise<MarketRate>;
  updateMarketRate(id: number, updates: Partial<InsertMarketRate>): Promise<MarketRate>;
  
  // Project Estimates
  getProjectEstimates(projectId: number): Promise<ProjectEstimate[]>;
  getEstimate(id: number): Promise<ProjectEstimate | undefined>;
  createEstimate(estimate: InsertProjectEstimate): Promise<ProjectEstimate>;
  updateEstimate(id: number, updates: Partial<InsertProjectEstimate>): Promise<ProjectEstimate>;
  deleteEstimate(id: number): Promise<void>;

  // Estimate Items
  getEstimateItems(estimateId: number): Promise<EstimateItem[]>;
  createEstimateItem(item: InsertEstimateItem): Promise<EstimateItem>;
  updateEstimateItem(id: number, updates: Partial<InsertEstimateItem>): Promise<EstimateItem>;
  deleteEstimateItem(id: number): Promise<void>;

  // Receipts
  getReceipts(projectId: number): Promise<Receipt[]>;
  createReceipt(receipt: InsertReceipt): Promise<Receipt>;
  deleteReceipt(id: number): Promise<void>;

  // Estimate Warnings
  getEstimateWarnings(estimateItemId: number): Promise<EstimateWarning[]>;
  getWarningsByEstimate(estimateId: number): Promise<EstimateWarning[]>;
  createEstimateWarning(warning: InsertEstimateWarning): Promise<EstimateWarning>;
  ignoreWarning(id: number, userId: string): Promise<EstimateWarning>;
  deleteWarningsByItem(estimateItemId: number): Promise<void>;
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
  async getMilestone(id: number): Promise<Milestone | undefined> {
    const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
    return m;
  }
  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [newMilestone] = await db.insert(milestones).values(milestone).returning();
    return newMilestone;
  }
  async updateMilestone(id: number, data: Partial<InsertMilestone>): Promise<Milestone> {
    const [updated] = await db.update(milestones).set(data).where(eq(milestones.id, id)).returning();
    return updated;
  }
  async deleteMilestone(id: number): Promise<void> {
    await db.delete(milestones).where(eq(milestones.id, id));
  }

  // Sub-Milestones
  async getSubMilestones(milestoneId: number): Promise<SubMilestone[]> {
    return await db.select().from(subMilestones).where(eq(subMilestones.milestoneId, milestoneId)).orderBy(subMilestones.order);
  }
  async createSubMilestone(sub: InsertSubMilestone): Promise<SubMilestone> {
    const [newSub] = await db.insert(subMilestones).values(sub).returning();
    return newSub;
  }
  async updateSubMilestone(id: number, data: Partial<InsertSubMilestone>): Promise<SubMilestone> {
    const [updated] = await db.update(subMilestones).set(data).where(eq(subMilestones.id, id)).returning();
    return updated;
  }
  async deleteSubMilestone(id: number): Promise<void> {
    await db.delete(subMilestones).where(eq(subMilestones.id, id));
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
  async tagPhoto(photoId: number, planningBoardId: number | null): Promise<void> {
    await db.update(photos).set({ planningBoardId }).where(eq(photos.id, photoId));
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

  async getTimeEntriesByUser(userId: string, startDate?: string, endDate?: string): Promise<TimeEntry[]> {
    const conditions = [eq(timeEntries.userId, userId)];
    if (startDate) conditions.push(gte(timeEntries.date, startDate));
    if (endDate) conditions.push(lte(timeEntries.date, endDate));
    return await db.select().from(timeEntries).where(and(...conditions)).orderBy(desc(timeEntries.date));
  }

  async getTimeEntriesByPeriod(startDate: string, endDate: string): Promise<TimeEntry[]> {
    return await db.select().from(timeEntries)
      .where(and(gte(timeEntries.date, startDate), lte(timeEntries.date, endDate)))
      .orderBy(desc(timeEntries.date));
  }

  async updateTimeEntry(id: number, updates: Partial<InsertTimeEntry>): Promise<TimeEntry> {
    const [updated] = await db.update(timeEntries).set(updates).where(eq(timeEntries.id, id)).returning();
    return updated;
  }

  async deleteTimeEntry(id: number): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async bulkCreateTimeEntries(entries: InsertTimeEntry[]): Promise<TimeEntry[]> {
    if (entries.length === 0) return [];
    return await db.insert(timeEntries).values(entries).returning();
  }

  async approveTimeEntries(ids: number[], approvedBy: string): Promise<TimeEntry[]> {
    const now = new Date();
    return await db.update(timeEntries)
      .set({ status: "approved", approvedBy, approvedAt: now })
      .where(inArray(timeEntries.id, ids))
      .returning();
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
    // Clean up cost estimator data
    const estimates = await db.select().from(projectEstimates).where(eq(projectEstimates.projectId, id));
    for (const est of estimates) {
      const items = await db.select().from(estimateItems).where(eq(estimateItems.estimateId, est.id));
      for (const item of items) {
        await db.delete(estimateWarnings).where(eq(estimateWarnings.estimateItemId, item.id));
      }
      await db.delete(estimateItems).where(eq(estimateItems.estimateId, est.id));
    }
    await db.delete(projectEstimates).where(eq(projectEstimates.projectId, id));
    await db.delete(receipts).where(eq(receipts.projectId, id));
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
  async getCalendarEventsByType(projectId: number, type: string): Promise<CalendarEvent[]> {
    return await db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.projectId, projectId), eq(calendarEvents.type, type)));
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

  // Paint Colors
  async getPaintColors(filters?: { brand?: string; colorFamily?: string; search?: string; popular?: boolean }): Promise<PaintColor[]> {
    const conditions = [];
    if (filters?.brand) conditions.push(eq(paintColors.brand, filters.brand));
    if (filters?.colorFamily) conditions.push(eq(paintColors.colorFamily, filters.colorFamily));
    if (filters?.popular) conditions.push(eq(paintColors.isPopular, true));
    if (filters?.search) {
      conditions.push(
        or(
          ilike(paintColors.name, `%${filters.search}%`),
          ilike(paintColors.code, `%${filters.search}%`)
        )!
      );
    }
    if (conditions.length > 0) {
      return db.select().from(paintColors).where(and(...conditions)).orderBy(paintColors.name);
    }
    return db.select().from(paintColors).orderBy(paintColors.name);
  }
  async getPaintColor(id: number): Promise<PaintColor | undefined> {
    const [color] = await db.select().from(paintColors).where(eq(paintColors.id, id));
    return color;
  }
  async getPaintColorFamilies(brand?: string): Promise<string[]> {
    const query = brand
      ? db.selectDistinct({ colorFamily: paintColors.colorFamily }).from(paintColors).where(eq(paintColors.brand, brand))
      : db.selectDistinct({ colorFamily: paintColors.colorFamily }).from(paintColors);
    const results = await query.orderBy(paintColors.colorFamily);
    return results.map(r => r.colorFamily);
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

  // Board Snapshots
  async getBoardSnapshots(boardId: number): Promise<BoardSnapshot[]> {
    return db.select().from(boardSnapshots).where(eq(boardSnapshots.boardId, boardId)).orderBy(desc(boardSnapshots.createdAt));
  }
  async createBoardSnapshot(snapshot: InsertBoardSnapshot): Promise<BoardSnapshot> {
    const [created] = await db.insert(boardSnapshots).values(snapshot).returning();
    return created;
  }
  async getBoardSnapshot(id: number): Promise<BoardSnapshot | undefined> {
    const [snap] = await db.select().from(boardSnapshots).where(eq(boardSnapshots.id, id));
    return snap;
  }
  async deleteBoardSnapshot(id: number): Promise<void> {
    await db.delete(boardSnapshots).where(eq(boardSnapshots.id, id));
  }

  // Cost Categories
  async getCostCategories(): Promise<CostCategory[]> {
    return db.select().from(costCategories).orderBy(costCategories.sortOrder);
  }
  async createCostCategory(cat: InsertCostCategory): Promise<CostCategory> {
    const [created] = await db.insert(costCategories).values(cat).returning();
    return created;
  }
  async updateCostCategory(id: number, updates: Partial<InsertCostCategory>): Promise<CostCategory> {
    const [updated] = await db.update(costCategories).set(updates).where(eq(costCategories.id, id)).returning();
    return updated;
  }
  async deleteCostCategory(id: number): Promise<void> {
    await db.delete(costCategories).where(eq(costCategories.id, id));
  }

  // Market Rates
  async getMarketRates(categoryId?: number, activeOnly?: boolean): Promise<MarketRate[]> {
    const conditions: any[] = [];
    if (categoryId) conditions.push(eq(marketRates.categoryId, categoryId));
    if (activeOnly) conditions.push(eq(marketRates.isActive, true));
    if (conditions.length > 0) {
      return db.select().from(marketRates).where(and(...conditions)).orderBy(desc(marketRates.effectiveDate));
    }
    return db.select().from(marketRates).orderBy(desc(marketRates.effectiveDate));
  }
  async createMarketRate(rate: InsertMarketRate): Promise<MarketRate> {
    const [created] = await db.insert(marketRates).values(rate).returning();
    return created;
  }
  async updateMarketRate(id: number, updates: Partial<InsertMarketRate>): Promise<MarketRate> {
    const [updated] = await db.update(marketRates).set(updates).where(eq(marketRates.id, id)).returning();
    return updated;
  }

  // Project Estimates
  async getProjectEstimates(projectId: number): Promise<ProjectEstimate[]> {
    return db.select().from(projectEstimates).where(eq(projectEstimates.projectId, projectId)).orderBy(desc(projectEstimates.createdAt));
  }
  async getEstimate(id: number): Promise<ProjectEstimate | undefined> {
    const [est] = await db.select().from(projectEstimates).where(eq(projectEstimates.id, id));
    return est;
  }
  async createEstimate(estimate: InsertProjectEstimate): Promise<ProjectEstimate> {
    const [created] = await db.insert(projectEstimates).values(estimate).returning();
    return created;
  }
  async updateEstimate(id: number, updates: Partial<InsertProjectEstimate>): Promise<ProjectEstimate> {
    const [updated] = await db.update(projectEstimates).set(updates).where(eq(projectEstimates.id, id)).returning();
    return updated;
  }
  async deleteEstimate(id: number): Promise<void> {
    await db.delete(projectEstimates).where(eq(projectEstimates.id, id));
  }

  // Estimate Items
  async getEstimateItems(estimateId: number): Promise<EstimateItem[]> {
    return db.select().from(estimateItems).where(eq(estimateItems.estimateId, estimateId)).orderBy(estimateItems.createdAt);
  }
  async createEstimateItem(item: InsertEstimateItem): Promise<EstimateItem> {
    const [created] = await db.insert(estimateItems).values(item).returning();
    return created;
  }
  async updateEstimateItem(id: number, updates: Partial<InsertEstimateItem>): Promise<EstimateItem> {
    const [updated] = await db.update(estimateItems).set(updates).where(eq(estimateItems.id, id)).returning();
    return updated;
  }
  async deleteEstimateItem(id: number): Promise<void> {
    await db.delete(estimateItems).where(eq(estimateItems.id, id));
  }

  // Receipts
  async getReceipts(projectId: number): Promise<Receipt[]> {
    return db.select().from(receipts).where(eq(receipts.projectId, projectId)).orderBy(desc(receipts.date));
  }
  async createReceipt(receipt: InsertReceipt): Promise<Receipt> {
    const [created] = await db.insert(receipts).values(receipt).returning();
    return created;
  }
  async deleteReceipt(id: number): Promise<void> {
    await db.delete(receipts).where(eq(receipts.id, id));
  }

  // Estimate Warnings
  async getEstimateWarnings(estimateItemId: number): Promise<EstimateWarning[]> {
    return db.select().from(estimateWarnings).where(eq(estimateWarnings.estimateItemId, estimateItemId));
  }
  async getWarningsByEstimate(estimateId: number): Promise<EstimateWarning[]> {
    const items = await this.getEstimateItems(estimateId);
    if (items.length === 0) return [];
    const itemIds = items.map(i => i.id);
    return db.select().from(estimateWarnings).where(inArray(estimateWarnings.estimateItemId, itemIds));
  }
  async createEstimateWarning(warning: InsertEstimateWarning): Promise<EstimateWarning> {
    const [created] = await db.insert(estimateWarnings).values(warning).returning();
    return created;
  }
  async ignoreWarning(id: number, userId: string): Promise<EstimateWarning> {
    const [updated] = await db.update(estimateWarnings).set({ ignored: true, ignoredBy: userId, ignoredAt: new Date() }).where(eq(estimateWarnings.id, id)).returning();
    return updated;
  }
  async deleteWarningsByItem(estimateItemId: number): Promise<void> {
    await db.delete(estimateWarnings).where(eq(estimateWarnings.estimateItemId, estimateItemId));
  }
}

export const storage = new DatabaseStorage();
