import { pgTable, text, serial, integer, boolean, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";
export * from "./models/chat";

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"), // planning, in_progress, completed
  clientId: text("client_id").references(() => users.id), // Owner
  startDate: date("start_date"),
  endDate: date("end_date"),
  address: text("address"),
  thumbnailUrl: text("thumbnail_url"),
  totalBudget: integer("total_budget").default(0),
  budgetUsed: integer("budget_used").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Milestones
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  date: date("date"),
  completed: boolean("completed").default(false),
  order: integer("order").default(0),
});

// Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  milestoneId: integer("milestone_id").references(() => milestones.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("todo"), // todo, in_progress, review, done
  assignedTo: text("assigned_to").references(() => users.id),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Photos
export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  url: text("url").notNull(),
  caption: text("caption"),
  tags: text("tags").array(), // e.g. ["kitchen", "before"]
  isShowcase: boolean("is_showcase").default(false), // For "Project Story"
  isBeforeAfter: boolean("is_before_after").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull(), // contract, invoice, plan, change_order
  createdAt: timestamp("created_at").defaultNow(),
});

// Time Entries (Crew)
export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: text("user_id").notNull().references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  description: text("description"),
});

// Checklist Items (collaborative wish-list / to-do)
export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  completed: boolean("completed").default(false),
  createdBy: text("created_by").references(() => users.id),
  notes: text("notes"),
  priceEstimate: integer("price_estimate"),
  priority: text("priority").default("normal"),
  group: text("group").default("General"),
  status: text("status").default("todo"),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Calendar Events (shared across project for everyone)
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  endDate: date("end_date"),
  type: text("type").default("event"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Canvas Elements (Milanote-style spatial canvas elements per board)
export const canvasElements = pgTable("canvas_elements", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => planningBoards.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // note, todo, column, board_link, link, image, color_swatch, section_header
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(240),
  height: integer("height").notNull().default(160),
  zIndex: integer("z_index").notNull().default(0),
  parentColumnId: integer("parent_column_id"),
  content: jsonb("content"), // type-specific data
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Board Items (moodboard / workboard) - legacy individual items
export const boardItems = pgTable("board_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  type: text("type").notNull().default("note"),
  title: text("title"),
  content: text("content"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  color: text("color").default("#ffffff"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Planning Boards (Fabric.js freeform canvas - multiple per project)
export const planningBoards = pgTable("planning_boards", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  name: text("name").notNull().default("Untitled Board"),
  canvasData: jsonb("canvas_data"),
  linkedMilestoneId: integer("linked_milestone_id").references(() => milestones.id),
  linkedChecklistItemId: integer("linked_checklist_item_id").references(() => checklistItems.id),
  linkedCalendarEventId: integer("linked_calendar_event_id").references(() => calendarEvents.id),
  linkedUserIds: text("linked_user_ids").array().default([]),
  linkedProjectIds: integer("linked_project_ids").array().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages (Chat)
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// RELATIONS
export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(users, {
    fields: [projects.clientId],
    references: [users.id],
  }),
  milestones: many(milestones),
  tasks: many(tasks),
  photos: many(photos),
  documents: many(documents),
  messages: many(messages),
  checklistItems: many(checklistItems),
  boardItems: many(boardItems),
  calendarEvents: many(calendarEvents),
  planningBoards: many(planningBoards),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  project: one(projects, {
    fields: [calendarEvents.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [calendarEvents.createdBy],
    references: [users.id],
  }),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  project: one(projects, {
    fields: [checklistItems.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [checklistItems.createdBy],
    references: [users.id],
  }),
}));

export const canvasElementsRelations = relations(canvasElements, ({ one }) => ({
  board: one(planningBoards, {
    fields: [canvasElements.boardId],
    references: [planningBoards.id],
  }),
  creator: one(users, {
    fields: [canvasElements.createdBy],
    references: [users.id],
  }),
}));

export const boardItemsRelations = relations(boardItems, ({ one }) => ({
  project: one(projects, {
    fields: [boardItems.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [boardItems.createdBy],
    references: [users.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [tasks.milestoneId],
    references: [milestones.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),
}));

export const planningBoardsRelations = relations(planningBoards, ({ one }) => ({
  project: one(projects, {
    fields: [planningBoards.projectId],
    references: [projects.id],
  }),
  linkedMilestone: one(milestones, {
    fields: [planningBoards.linkedMilestoneId],
    references: [milestones.id],
  }),
  linkedChecklistItem: one(checklistItems, {
    fields: [planningBoards.linkedChecklistItemId],
    references: [checklistItems.id],
  }),
  linkedCalendarEvent: one(calendarEvents, {
    fields: [planningBoards.linkedCalendarEventId],
    references: [calendarEvents.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

// Activity Log
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: text("user_id").references(() => users.id),
  type: text("type").notNull(), // notification_sent, task_created, task_completed, photo_uploaded, document_uploaded, message_sent, milestone_created, calendar_event_created
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SCHEMAS
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertChecklistItemSchema = createInsertSchema(checklistItems).omit({ id: true, createdAt: true });
export const insertBoardItemSchema = createInsertSchema(boardItems).omit({ id: true, createdAt: true });
export const insertCanvasElementSchema = createInsertSchema(canvasElements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlanningBoardSchema = createInsertSchema(planningBoards).omit({ id: true, updatedAt: true, createdAt: true });
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });

// TYPES
export type Project = typeof projects.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type BoardItem = typeof boardItems.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type InsertBoardItem = z.infer<typeof insertBoardItemSchema>;
export type CanvasElement = typeof canvasElements.$inferSelect;
export type InsertCanvasElement = z.infer<typeof insertCanvasElementSchema>;
export type PlanningBoard = typeof planningBoards.$inferSelect;
export type InsertPlanningBoard = z.infer<typeof insertPlanningBoardSchema>;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
