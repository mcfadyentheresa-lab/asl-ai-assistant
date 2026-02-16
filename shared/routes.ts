import { z } from 'zod';
import { 
  insertProjectSchema, insertMilestoneSchema, insertTaskSchema, 
  insertPhotoSchema, insertDocumentSchema, insertTimeEntrySchema, insertMessageSchema,
  projects, milestones, tasks, photos, documents, timeEntries, messages, users
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
