import { db } from "./db";
import { 
  users, projects, milestones, tasks, photos, documents, timeEntries, messages, checklistItems, boardItems, calendarEvents,
  type Project, type Milestone, type Task, type Photo, type Document, type TimeEntry, type Message,
  type ChecklistItem, type BoardItem, type CalendarEvent,
  type InsertProject, type InsertMilestone, type InsertTask, type InsertPhoto, type InsertDocument, 
  type InsertTimeEntry, type InsertMessage, type InsertChecklistItem, type InsertBoardItem, type InsertCalendarEvent
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

  // Documents
  getDocuments(projectId: number): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;

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
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, updates: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  deleteCalendarEvent(id: number): Promise<void>;
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

  // Documents
  async getDocuments(projectId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.createdAt));
  }
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
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
}

export const storage = new DatabaseStorage();
