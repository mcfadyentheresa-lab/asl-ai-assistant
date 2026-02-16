import { pgTable, text, serial, integer, boolean, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

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

// Messages (Chat)
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
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

// SCHEMAS
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

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
