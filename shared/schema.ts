import { pgTable, text, serial, integer, boolean, timestamp, date, jsonb, uniqueIndex, real } from "drizzle-orm/pg-core";
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
  city: text("city"), // shown in client view photo-band credit chip
  code: text("code"), // human-readable project code, e.g. "HWR-204"
  phase: text("phase"), // human-readable current phase, e.g. "Cabinetry installation"
  currentFocusText: text("current_focus_text"), // weekly status sentence shown in "This week" card
  currentFocusPhotoId: integer("current_focus_photo_id"), // FK to photos.id (no .references() to avoid circular dep at table-decl time)
  thumbnailUrl: text("thumbnail_url"),
  heroFocalX: real("hero_focal_x").default(0.5),
  heroFocalY: real("hero_focal_y").default(0.5),
  heroZoom: real("hero_zoom").default(1.0),
  totalBudget: integer("total_budget").default(0),
  budgetUsed: integer("budget_used").default(0),
  budgetVisibleToClient: boolean("budget_visible_to_client").default(false),
  colorTagId: integer("color_tag_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Milestones
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  date: date("date"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  completed: boolean("completed").default(false),
  completedBy: text("completed_by").references(() => users.id),
  order: integer("order").default(0),
  colorHex: text("color_hex"),
  paintColorIds: integer("paint_color_ids").array(),
});

// Sub-Milestones
export const subMilestones = pgTable("sub_milestones", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id").notNull().references(() => milestones.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").default(false),
  order: integer("order").default(0),
});

// Sections (WBS grouping under phases/milestones)
export const sections = pgTable("sections", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id").notNull().references(() => milestones.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  completed: boolean("completed").default(false),
  order: integer("order").default(0),
});

// Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  milestoneId: integer("milestone_id").references(() => milestones.id),
  sectionId: integer("section_id").references(() => sections.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("todo"), // todo, in_progress, review, done
  assignedTo: text("assigned_to").references(() => users.id),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  order: integer("order").default(0),
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
  planningBoardId: integer("planning_board_id"),
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
  date: date("date").notNull(),
  hours: text("hours").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  description: text("description"),
  milestoneId: integer("milestone_id").references(() => milestones.id),
  calendarEventId: integer("calendar_event_id").references(() => calendarEvents.id),
  status: text("status").notNull().default("draft"),
  payPeriodStart: date("pay_period_start"),
  payPeriodEnd: date("pay_period_end"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
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
  // When true, this item is something the CLIENT needs to decide or do
  // (e.g. "approve hardware finish"). Surfaced on the client's Plan home
  // as 'Your action items'. Defaults false so existing items don't all
  // suddenly appear in the client's face.
  requiresClient: boolean("requires_client").default(false),
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
  imageUrl: text("image_url"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Canvas Elements (Milanote-style spatial canvas elements per board)
export const canvasElements = pgTable("canvas_elements", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => planningBoards.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // text, surface, todo, column, board_link, link, image, room_zone, draw, hardware, product, connector. Legacy: note, plain_text, callout, section_header (-> text), color_swatch, material (-> surface) — lazy-migrated on read
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

// Board Snapshots (version snapshots of a board's canvas state)
export const boardSnapshots = pgTable("board_snapshots", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => planningBoards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  canvasData: jsonb("canvas_data").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
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
  // 'project' = organized by room (Kitchen, Powder); 'library' = organized by
  // category (Fabric, Stone, Hardware). Existing rows stay 'project'.
  mode: text("mode").notNull().default("project"),
  canvasData: jsonb("canvas_data"),
  linkedMilestoneId: integer("linked_milestone_id").references(() => milestones.id),
  linkedChecklistItemId: integer("linked_checklist_item_id").references(() => checklistItems.id),
  linkedCalendarEventId: integer("linked_calendar_event_id").references(() => calendarEvents.id),
  linkedUserIds: text("linked_user_ids").array().default([]),
  linkedProjectIds: integer("linked_project_ids").array().default([]),
  colorTagId: integer("color_tag_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Decisions log
// A permanent record of choices made on a project. Visible to client; recorded by crew/admin.
export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(), // e.g. "Cabinet hardware"
  decision: text("decision").notNull(), // e.g. "Emtek Stock pulls in matte black"
  context: text("context"), // optional why/where it came up
  decidedOn: date("decided_on").notNull(), // the date the decision was made (not entered)
  decidedBy: text("decided_by").references(() => users.id), // who recorded it
  category: text("category"), // optional grouping: finishes, schedule, scope, budget, materials
  relatedMilestoneId: integer("related_milestone_id").references(() => milestones.id),
  attachmentPhotoId: integer("attachment_photo_id"), // optional photo (FK to photos.id, no .references to avoid circular dep)
  archived: boolean("archived").default(false), // soft-hide without deleting
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Selections ledger
// Operational record of what's being specified, ordered, and installed on a project.
// Distinct from boardItems (inspiration/notes) and decisions (permanent choices).
// Visible to client; managed by crew/admin.
export const selections = pgTable("selections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  room: text("room"), // e.g. "Kitchen", "Primary bath", "Powder"
  category: text("category"), // e.g. "Plumbing", "Hardware", "Tile", "Lighting", "Appliances"
  item: text("item").notNull(), // e.g. "Cabinet pulls", "Kitchen faucet"
  product: text("product"), // e.g. "Emtek Stock pull, 4 in. matte black"
  vendor: text("vendor"), // e.g. "Robinson Lighting & Bath"
  sku: text("sku"), // optional product code
  quantity: text("quantity"), // free-form ("24", "~12 lf", "as required")
  // status drives the client-visible label and ordering
  // proposed: still being considered
  // approved: client has signed off
  // ordered: PO placed
  // installed: fully installed on site
  status: text("status").notNull().default("proposed"),
  leadTimeDays: integer("lead_time_days"), // estimated/actual lead time
  orderedOn: date("ordered_on"),
  expectedOn: date("expected_on"),
  installedOn: date("installed_on"),
  notes: text("notes"),
  attachmentPhotoId: integer("attachment_photo_id"), // optional photo (FK to photos.id, no .references to avoid circular dep)
  relatedDecisionId: integer("related_decision_id").references(() => decisions.id),
  archived: boolean("archived").default(false), // soft-hide without deleting
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  decisions: many(decisions),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  project: one(projects, {
    fields: [decisions.projectId],
    references: [projects.id],
  }),
  decidedByUser: one(users, {
    fields: [decisions.decidedBy],
    references: [users.id],
  }),
  relatedMilestone: one(milestones, {
    fields: [decisions.relatedMilestoneId],
    references: [milestones.id],
  }),
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

export const selectionsRelations = relations(selections, ({ one }) => ({
  project: one(projects, {
    fields: [selections.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [selections.createdBy],
    references: [users.id],
  }),
  relatedDecision: one(decisions, {
    fields: [selections.relatedDecisionId],
    references: [decisions.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
  subMilestones: many(subMilestones),
  sections: many(sections),
}));

export const subMilestonesRelations = relations(subMilestones, ({ one }) => ({
  milestone: one(milestones, {
    fields: [subMilestones.milestoneId],
    references: [milestones.id],
  }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  milestone: one(milestones, {
    fields: [sections.milestoneId],
    references: [milestones.id],
  }),
  project: one(projects, {
    fields: [sections.projectId],
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
  section: one(sections, {
    fields: [tasks.sectionId],
    references: [sections.id],
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

// Paint Colors
export const paintColors = pgTable("paint_colors", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  hex: text("hex").notNull(),
  colorFamily: text("color_family").notNull(),
  collection: text("collection"),
  lrv: integer("lrv"),
  isPopular: boolean("is_popular").default(false),
});

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

// Activity Views (tracks who has seen each activity)
export const activityViews = pgTable("activity_views", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => activityLog.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  viewedAt: timestamp("viewed_at").defaultNow(),
}, (table) => []);

// Queued SMS (business-hours queue)
export const queuedSms = pgTable("queued_sms", {
  id: serial("id").primaryKey(),
  toPhone: text("to_phone").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  scheduledFor: timestamp("scheduled_for"),
  sent: boolean("sent").default(false),
  sentAt: timestamp("sent_at"),
  error: text("error"),
});

export const insertQueuedSmsSchema = createInsertSchema(queuedSms).omit({ id: true, sentAt: true, error: true });

// Cost Categories (renovation work types)
export const costCategories = pgTable("cost_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultUnitType: text("default_unit_type").notNull().default("sq_ft"),
  sortOrder: integer("sort_order").default(0),
});

// Market Rates (baseline pricing for categories)
export const marketRates = pgTable("market_rates", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => costCategories.id, { onDelete: "cascade" }),
  unitType: text("unit_type").notNull().default("sq_ft"),
  lowRate: text("low_rate").notNull(),
  highRate: text("high_rate").notNull(),
  typicalRate: text("typical_rate").notNull(),
  effectiveDate: date("effective_date").notNull(),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Estimates (per-project cost estimates)
export const projectEstimates = pgTable("project_estimates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Main Estimate"),
  status: text("status").notNull().default("draft"),
  markupEnabled: boolean("markup_enabled").default(true),
  markupPercent: text("markup_percent").notNull().default("25"),
  budget: text("budget"),
  contingencyPercent: text("contingency_percent").default("0"),
  managementFeeEnabled: boolean("management_fee_enabled").default(false),
  managementFeePercent: text("management_fee_percent").notNull().default("25"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Estimate Items (individual line items in an estimate)
export const estimateItems = pgTable("estimate_items", {
  id: serial("id").primaryKey(),
  estimateId: integer("estimate_id").notNull().references(() => projectEstimates.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => costCategories.id),
  customCategory: text("custom_category"),
  room: text("room"),
  productUrl: text("product_url"),
  unitType: text("unit_type").notNull().default("sq_ft"),
  quantity: text("quantity").notNull(),
  unitCost: text("unit_cost").notNull(),
  materialCost: text("material_cost").notNull().default("0"),
  laborCost: text("labor_cost").notNull().default("0"),
  isCustomRate: boolean("is_custom_rate").default(false),
  marketRateId: integer("market_rate_id").references(() => marketRates.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  crewRateId: integer("crew_rate_id").references(() => crewRates.id),
  subcontractorId: integer("subcontractor_id").references(() => subcontractors.id),
});

// Receipts (actual expenses to compare against estimates)
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  estimateItemId: integer("estimate_item_id").references(() => estimateItems.id),
  vendor: text("vendor").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  amount: text("amount").notNull(),
  fileUrl: text("file_url"),
  lineItems: jsonb("line_items").$type<Array<{ description: string; qty: number; unitPrice: number; subtotal: number }>>(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Estimate Warnings (price variance alerts)
export const estimateWarnings = pgTable("estimate_warnings", {
  id: serial("id").primaryKey(),
  estimateItemId: integer("estimate_item_id").notNull().references(() => estimateItems.id, { onDelete: "cascade" }),
  warningType: text("warning_type").notNull(),
  message: text("message").notNull(),
  percentDiff: text("percent_diff"),
  ignored: boolean("ignored").default(false),
  ignoredBy: text("ignored_by").references(() => users.id),
  ignoredAt: timestamp("ignored_at"),
});

// Crew Rates (hourly rates for crew members)
export const crewRates = pgTable("crew_rates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(), // display name if no userId linked
  role: text("role"), // e.g., "Lead Carpenter", "Labourer"
  payRate: text("pay_rate").notNull(), // hourly rate paid to crew (CAD)
  billableRate: text("billable_rate").notNull(), // hourly rate charged to client (CAD)
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subcontractors (subcontractor information and rates)
export const subcontractors = pgTable("subcontractors", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  categoryId: integer("category_id").references(() => costCategories.id),
  trade: text("trade"), // free text trade type if no category
  hourlyRate: text("hourly_rate"),
  dailyRate: text("daily_rate"),
  unitRate: text("unit_rate"), // per sq ft or per unit rate if applicable
  unitType: text("unit_type"), // "hour", "day", "sq_ft", "unit"
  isPreferred: boolean("is_preferred").default(false),
  isActive: boolean("is_active").default(true),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Suppliers (material suppliers / vendors)
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  isPreferred: boolean("is_preferred").default(false),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Client Invites (secure onboarding tokens)
export const clientInvites = pgTable("client_invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  userId: text("user_id").references(() => users.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Social Posts (content library)
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  copy: text("copy").notNull(),
  platform: text("platform").notNull().default("instagram"),
  tone: text("tone").default("Warm"),
  photoUrl: text("photo_url"),
  photoId: integer("photo_id"),
  status: text("status").notNull().default("draft"),
  source: text("source").default("manual"),
  seenAt: timestamp("seen_at"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Supplier Prices (price book built from receipts)
export const supplierPrices = pgTable("supplier_prices", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  categoryId: integer("category_id").references(() => costCategories.id),
  unitPrice: text("unit_price").notNull(),
  unitType: text("unit_type").notNull().default("unit"),
  productCode: text("product_code"),
  productUrl: text("product_url"),
  sourceReceiptId: integer("source_receipt_id").references(() => receipts.id),
  notes: text("notes"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Table Redesign Plans
export const tableRedesignPlans = pgTable("table_redesign_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  pieceType: text("piece_type").notNull(), // table, desk, console, coffee_table
  pieceName: text("piece_name").notNull(),
  beforeImageUrl: text("before_image_url"),
  inspirationImageUrl: text("inspiration_image_url"),
  conceptImageUrl: text("concept_image_url"),
  tableShape: text("table_shape").notNull(), // rectangular, round, oval, square
  lengthInches: integer("length_inches"),
  widthInches: integer("width_inches"),
  heightInches: integer("height_inches"),
  thicknessInches: integer("thickness_inches"),
  weightClass: text("weight_class").notNull().default("unknown"), // light, medium, heavy, unknown
  existingMaterial: text("existing_material"),
  redesignScope: text("redesign_scope").notNull().default("full"), // base_only, finish, full
  proposedBaseType: text("proposed_base_type"), // pedestal, trestle, four_leg, plinth, custom
  styleDirection: text("style_direction"),
  finishDirection: text("finish_direction"),
  notes: text("notes"),
  conceptTitle: text("concept_title"),
  conceptDescription: text("concept_description"),
  baseSizeMinInches: integer("base_size_min_inches"),
  baseSizeMaxInches: integer("base_size_max_inches"),
  baseSizeNotes: text("base_size_notes"),
  buildNotes: text("build_notes"),
  tag: text("tag"),
  intendedUse: text("intended_use"),
  priorityConstraint: text("priority_constraint"),
  approvalStatus: text("approval_status").notNull().default("draft"),
  status: text("status").notNull().default("draft"), // draft, complete
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Table Redesign Materials
export const tableRedesignMaterials = pgTable("table_redesign_materials", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => tableRedesignPlans.id, { onDelete: "cascade" }),
  component: text("component").notNull(),
  material: text("material"),
  finish: text("finish"),
  dimensions: text("dimensions"),
  quantity: integer("quantity").default(1),
  notes: text("notes"),
  supplier: text("supplier"),
  webLink: text("web_link"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SCHEMAS
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertSubMilestoneSchema = createInsertSchema(subMilestones).omit({ id: true });
export const insertSectionSchema = createInsertSchema(sections).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertDecisionSchema = createInsertSchema(decisions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSelectionSchema = createInsertSchema(selections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChecklistItemSchema = createInsertSchema(checklistItems).omit({ id: true, createdAt: true });
export const insertBoardItemSchema = createInsertSchema(boardItems).omit({ id: true, createdAt: true });
export const insertCanvasElementSchema = createInsertSchema(canvasElements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlanningBoardSchema = createInsertSchema(planningBoards).omit({ id: true, updatedAt: true, createdAt: true });
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export const insertPaintColorSchema = createInsertSchema(paintColors).omit({ id: true });
export const insertBoardSnapshotSchema = createInsertSchema(boardSnapshots).omit({ id: true, createdAt: true });
export const insertCostCategorySchema = createInsertSchema(costCategories).omit({ id: true });
export const insertMarketRateSchema = createInsertSchema(marketRates).omit({ id: true, createdAt: true });
export const insertProjectEstimateSchema = createInsertSchema(projectEstimates).omit({ id: true, createdAt: true });
export const insertEstimateItemSchema = createInsertSchema(estimateItems).omit({ id: true, createdAt: true });
export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true, createdAt: true });
export const insertEstimateWarningSchema = createInsertSchema(estimateWarnings).omit({ id: true });
export const insertCrewRateSchema = createInsertSchema(crewRates).omit({ id: true, createdAt: true });
export const insertSubcontractorSchema = createInsertSchema(subcontractors).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertClientInviteSchema = createInsertSchema(clientInvites).omit({ id: true, createdAt: true });
export const insertSupplierPriceSchema = createInsertSchema(supplierPrices).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTableRedesignPlanSchema = createInsertSchema(tableRedesignPlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTableRedesignMaterialSchema = createInsertSchema(tableRedesignMaterials).omit({ id: true, createdAt: true });

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
export type Decision = typeof decisions.$inferSelect;
export type InsertDecision = z.infer<typeof insertDecisionSchema>;
export type Selection = typeof selections.$inferSelect;
export type InsertSelection = z.infer<typeof insertSelectionSchema>;
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
export type PaintColor = typeof paintColors.$inferSelect;
export type InsertPaintColor = z.infer<typeof insertPaintColorSchema>;
export type SubMilestone = typeof subMilestones.$inferSelect;
export type InsertSubMilestone = z.infer<typeof insertSubMilestoneSchema>;
export type Section = typeof sections.$inferSelect;
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type QueuedSms = typeof queuedSms.$inferSelect;
export type InsertQueuedSms = z.infer<typeof insertQueuedSmsSchema>;
export type BoardSnapshot = typeof boardSnapshots.$inferSelect;
export type InsertBoardSnapshot = z.infer<typeof insertBoardSnapshotSchema>;
export type CostCategory = typeof costCategories.$inferSelect;
export type InsertCostCategory = z.infer<typeof insertCostCategorySchema>;
export type MarketRate = typeof marketRates.$inferSelect;
export type InsertMarketRate = z.infer<typeof insertMarketRateSchema>;
export type ProjectEstimate = typeof projectEstimates.$inferSelect;
export type InsertProjectEstimate = z.infer<typeof insertProjectEstimateSchema>;
export type EstimateItem = typeof estimateItems.$inferSelect;
export type InsertEstimateItem = z.infer<typeof insertEstimateItemSchema>;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type EstimateWarning = typeof estimateWarnings.$inferSelect;
export type InsertEstimateWarning = z.infer<typeof insertEstimateWarningSchema>;
export type CrewRate = typeof crewRates.$inferSelect;
export type InsertCrewRate = z.infer<typeof insertCrewRateSchema>;
export type Subcontractor = typeof subcontractors.$inferSelect;
export type InsertSubcontractor = z.infer<typeof insertSubcontractorSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type SupplierPrice = typeof supplierPrices.$inferSelect;
export type InsertSupplierPrice = z.infer<typeof insertSupplierPriceSchema>;
export type ClientInvite = typeof clientInvites.$inferSelect;
export type InsertClientInvite = z.infer<typeof insertClientInviteSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type TableRedesignPlan = typeof tableRedesignPlans.$inferSelect;
export type InsertTableRedesignPlan = z.infer<typeof insertTableRedesignPlanSchema>;
export type TableRedesignMaterial = typeof tableRedesignMaterials.$inferSelect;
export type InsertTableRedesignMaterial = z.infer<typeof insertTableRedesignMaterialSchema>;

// Cinematic Reviews — short Ken-Burns / AI-cinematic videos rendered for a room
export const cinematicReviews = pgTable("cinematic_reviews", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  boardId: integer("board_id").references(() => planningBoards.id, { onDelete: "set null" }),
  roomName: text("room_name").notNull(),
  format: text("format").notNull(), // 'ken-burns' | 'ai-cinematic'
  status: text("status").notNull().default("queued"), // queued | rendering | completed | failed
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  durationSec: real("duration_sec"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by").references(() => users.id),
});

export const insertCinematicReviewSchema = createInsertSchema(cinematicReviews).omit({
  id: true,
  createdAt: true,
});

export type CinematicReview = typeof cinematicReviews.$inferSelect;
export type InsertCinematicReview = z.infer<typeof insertCinematicReviewSchema>;

// Room Renders — one rendered "vision" image per room (PR-S). The cinematic
// table from PR-N1 stays in place; this is the new headline AI feature.
export const roomRenders = pgTable("room_renders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  boardId: integer("board_id").references(() => planningBoards.id, { onDelete: "set null" }),
  roomName: text("room_name").notNull(),
  mode: text("mode").notNull(), // 'restyle' | 'imagine'
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  prompt: text("prompt").notNull().default(""),
  status: text("status").notNull().default("queued"), // queued | rendering | completed | failed
  errorMessage: text("error_message"),
  costEstimateCents: integer("cost_estimate_cents"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by").references(() => users.id),
});

export const insertRoomRenderSchema = createInsertSchema(roomRenders).omit({
  id: true,
  createdAt: true,
});

export type RoomRender = typeof roomRenders.$inferSelect;
export type InsertRoomRender = z.infer<typeof insertRoomRenderSchema>;

// Recent Project Views (server-side per-user history)
export const recentProjectViews = pgTable("recent_project_views", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("recent_project_views_user_project_idx").on(table.userId, table.projectId),
]);

export type RecentProjectView = typeof recentProjectViews.$inferSelect;

// ============================================================================
// Tenant communication settings
// One row per tenant. For now, single-tenant; designed for future multi-tenancy.
// Controls SMS gating, quiet hours, invite SMS toggle, and per-tenant brand info.
// See docs/PRODUCT_PHILOSOPHY.md — "SMS policy" and "White-label readiness".
// ============================================================================
export const tenantSettings = pgTable("tenant_settings", {
  id: serial("id").primaryKey(),
  tenantKey: text("tenant_key").notNull().unique().default("default"),

  // Brand
  brandName: text("brand_name").notNull().default("Aster & Spruce"),
  brandWebsite: text("brand_website").default("https://asterandspruceliving.ca"),
  supportEmail: text("support_email").default("info@asterandspruceliving.ca"),

  // SMS gating (off by default per product philosophy)
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  smsInvitesEnabled: boolean("sms_invites_enabled").notNull().default(true),
  smsRequireApproval: boolean("sms_require_approval").notNull().default(true),

  // Quiet hours (24h, in tenant timezone). Default 9am–7pm.
  smsQuietHoursStart: integer("sms_quiet_hours_start").notNull().default(9),
  smsQuietHoursEnd: integer("sms_quiet_hours_end").notNull().default(19),
  smsQuietHoursDays: jsonb("sms_quiet_hours_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  timezone: text("timezone").notNull().default("America/Toronto"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = typeof tenantSettings.$inferInsert;

// ============================================================================
// Feature flags
// Per-tenant feature toggles. Used to stage rollouts (e.g., design-board v0.1
// vs v1.0, AI co-pilot, presentation mode).
// ============================================================================
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  tenantKey: text("tenant_key").notNull().default("default"),
  flagKey: text("flag_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("feature_flags_tenant_key_idx").on(table.tenantKey, table.flagKey),
]);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;
