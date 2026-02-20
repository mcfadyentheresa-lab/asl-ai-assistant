import { z } from 'zod';
import { 
  insertProjectSchema, insertMilestoneSchema, insertTaskSchema, 
  insertPhotoSchema, insertDocumentSchema, insertTimeEntrySchema, insertMessageSchema,
  insertChecklistItemSchema, insertBoardItemSchema, insertCalendarEventSchema, insertPlanningBoardSchema, insertCanvasElementSchema,
  projects, milestones, tasks, photos, documents, timeEntries, messages, users, checklistItems, boardItems, calendarEvents, planningBoards, canvasElements
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  // Projects
  projects: {
    list: {
      method: 'GET' as const,
      path: '/api/projects' as const,
      responses: {
        200: z.array(z.custom<typeof projects.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/projects/:id' as const,
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects' as const,
      input: insertProjectSchema,
      responses: {
        201: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/projects/:id' as const,
      input: insertProjectSchema.partial(),
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/projects/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  
  // Tasks
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/tasks' as const,
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/tasks' as const,
      input: insertTaskSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id' as const,
      input: insertTaskSchema.partial(),
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Milestones
  milestones: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/milestones' as const,
      responses: {
        200: z.array(z.custom<typeof milestones.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/milestones' as const,
      input: insertMilestoneSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof milestones.$inferSelect>(),
      },
    },
  },

  // Photos
  photos: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/photos' as const,
      responses: {
        200: z.array(z.custom<typeof photos.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/photos' as const,
      input: insertPhotoSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof photos.$inferSelect>(),
      },
    },
  },

  // Documents
  documents: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/documents' as const,
      responses: {
        200: z.array(z.custom<typeof documents.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/documents' as const,
      input: insertDocumentSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof documents.$inferSelect>(),
      },
    },
  },

  // Messages (Chat)
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/messages' as const,
      responses: {
        200: z.array(z.custom<typeof messages.$inferSelect & { sender?: typeof users.$inferSelect }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/messages' as const,
      input: insertMessageSchema.omit({ projectId: true, senderId: true }),
      responses: {
        201: z.custom<typeof messages.$inferSelect>(),
      },
    },
  },

  // Time Entries
  timeEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/time-entries' as const,
      responses: {
        200: z.array(z.custom<typeof timeEntries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/time-entries' as const,
      input: insertTimeEntrySchema.omit({ projectId: true, userId: true }),
      responses: {
        201: z.custom<typeof timeEntries.$inferSelect>(),
      },
    },
  },

  // Checklist Items
  checklist: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/checklist' as const,
      responses: {
        200: z.array(z.custom<typeof checklistItems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/checklist' as const,
      input: insertChecklistItemSchema.omit({ projectId: true, createdBy: true }),
      responses: {
        201: z.custom<typeof checklistItems.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/checklist/:id' as const,
      input: insertChecklistItemSchema.partial(),
      responses: {
        200: z.custom<typeof checklistItems.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/checklist/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },

  // Board Items (Moodboard)
  board: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/board' as const,
      responses: {
        200: z.array(z.custom<typeof boardItems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/board' as const,
      input: insertBoardItemSchema.omit({ projectId: true, createdBy: true }),
      responses: {
        201: z.custom<typeof boardItems.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/board/:id' as const,
      input: insertBoardItemSchema.partial(),
      responses: {
        200: z.custom<typeof boardItems.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/board/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },

  // Planning Boards
  planningBoards: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/planning-boards' as const,
      responses: {
        200: z.array(z.custom<typeof planningBoards.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/planning-boards/:id' as const,
      responses: {
        200: z.custom<typeof planningBoards.$inferSelect>(),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/planning-boards' as const,
      input: insertPlanningBoardSchema.pick({ name: true, linkedMilestoneId: true, linkedChecklistItemId: true, linkedCalendarEventId: true, linkedUserIds: true, linkedProjectIds: true }).partial(),
      responses: {
        201: z.custom<typeof planningBoards.$inferSelect>(),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/planning-boards/:id' as const,
      input: insertPlanningBoardSchema.pick({ name: true, linkedMilestoneId: true, linkedChecklistItemId: true, linkedCalendarEventId: true, linkedUserIds: true, linkedProjectIds: true, colorTagId: true }).partial(),
      responses: {
        200: z.custom<typeof planningBoards.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/planning-boards/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    saveCanvas: {
      method: 'PUT' as const,
      path: '/api/planning-boards/:id/canvas' as const,
      input: z.object({ canvasData: z.any() }),
      responses: {
        200: z.custom<typeof planningBoards.$inferSelect>(),
      },
    },
  },

  // Canvas Elements
  canvasElements: {
    list: {
      method: 'GET' as const,
      path: '/api/planning-boards/:boardId/elements' as const,
      responses: {
        200: z.array(z.custom<typeof canvasElements.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/planning-boards/:boardId/elements' as const,
      input: insertCanvasElementSchema.omit({ boardId: true }),
      responses: {
        201: z.custom<typeof canvasElements.$inferSelect>(),
      },
    },
    createBatch: {
      method: 'POST' as const,
      path: '/api/planning-boards/:boardId/elements/batch' as const,
      input: z.object({ elements: z.array(insertCanvasElementSchema.omit({ boardId: true })) }),
      responses: {
        201: z.array(z.custom<typeof canvasElements.$inferSelect>()),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/canvas-elements/:id' as const,
      input: insertCanvasElementSchema.partial(),
      responses: {
        200: z.custom<typeof canvasElements.$inferSelect>(),
      },
    },
    updatePositions: {
      method: 'PATCH' as const,
      path: '/api/planning-boards/:boardId/elements/positions' as const,
      input: z.object({
        updates: z.array(z.object({
          id: z.number(),
          x: z.number(),
          y: z.number(),
          width: z.number().optional(),
          height: z.number().optional(),
          zIndex: z.number().optional(),
          parentColumnId: z.number().nullable().optional(),
        })),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/canvas-elements/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },

  // Calendar Events
  calendar: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/calendar' as const,
      responses: {
        200: z.array(z.custom<typeof calendarEvents.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/calendar' as const,
      input: insertCalendarEventSchema.omit({ projectId: true, createdBy: true }),
      responses: {
        201: z.custom<typeof calendarEvents.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/calendar/:id' as const,
      input: insertCalendarEventSchema.partial(),
      responses: {
        200: z.custom<typeof calendarEvents.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/calendar/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },

  // Reports
  reports: {
    generate: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/reports' as const,
      responses: {
        200: z.object({ url: z.string() }),
      },
    },
  },

  // Weather
  weather: {
    get: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/weather' as const,
      responses: {
        200: z.object({
          temp: z.number(),
          condition: z.string(),
          impact: z.string(),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
