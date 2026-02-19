# Aster & Spruce Connect

## Overview

Aster & Spruce Connect is a premium client and crew portal web application for a high-end Muskoka cottage renovation company (Aster & Spruce Living). It provides role-based experiences where **clients** (homeowners) can track their renovation projects — viewing progress, timelines, photos, documents, budgets, and messaging — while **crew/field teams** get a mobile-first interface for time tracking, task management, daily logs, and internal communication. An admin role has full access to all projects and reporting.

The app follows a "warm minimalist" luxury aesthetic with a deep forest green primary palette, warm neutrals, and elegant typography (DM Sans + Playfair Display).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Overall Structure

The project uses a **monorepo layout** with three main directories:

- **`client/`** — React SPA (Single Page Application) frontend
- **`server/`** — Express.js backend API server
- **`shared/`** — Shared TypeScript types, database schema, and API route definitions used by both client and server

### Frontend Architecture

- **Framework**: React 18 with TypeScript
- **Bundler**: Vite (with HMR in development, static build for production)
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (Muskoka Modern palette)
- **Animations**: Framer Motion for page transitions and UI animations
- **Forms**: React Hook Form with Zod resolvers for validation
- **Charts**: Recharts for budget visualization and analytics
- **Date Handling**: date-fns + react-day-picker for calendars

Path aliases are configured:
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

### Backend Architecture

- **Runtime**: Node.js with Express.js
- **Language**: TypeScript, executed via `tsx` in development
- **Build**: esbuild bundles server code to `dist/index.cjs` for production; Vite builds the client to `dist/public/`
- **API Pattern**: RESTful JSON API under `/api/*` prefix, with route definitions shared between client and server via `shared/routes.ts`
- **Input Validation**: Zod schemas (generated from Drizzle schemas via `drizzle-zod`) validate all API inputs
- **Dev Server**: Vite middleware serves the frontend in development; in production, Express serves static files from `dist/public/`

### Database & ORM

- **Database**: PostgreSQL (required via `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `drizzle-orm/node-postgres` driver
- **Schema Location**: `shared/schema.ts` and `shared/models/auth.ts`
- **Migrations**: Drizzle Kit with `drizzle-kit push` command (no migration files committed by default)
- **Schema Design**:
  - `users` — User accounts with roles (client, crew, admin)
  - `sessions` — Session storage for authentication (required by Replit Auth)
  - `projects` — Renovation projects with budget, status, dates, client association
  - `milestones` — Project milestones with ordering
  - `tasks` — Tasks linked to projects and optionally milestones, with assignment
  - `photos` — Progress photos linked to projects
  - `documents` — Project documents (contracts, invoices, etc.)
  - `time_entries` — Crew time tracking per project
  - `messages` — Project-scoped messaging with sender references
  - `planning_boards` — Planning boards (Fabric.js canvas) with multiple boards per project, linking to milestones/checklist items/calendar events (replaces legacy `moodboards` table)

### Authentication & Authorization

- **Auth Provider**: Replit Auth (OpenID Connect via `openid-client` and Passport.js)
- **Session Management**: `express-session` with `connect-pg-simple` storing sessions in PostgreSQL
- **Role-Based Access**: Users have a `role` field (client, crew, admin). Clients see only their own projects; crew/admin see all projects.
- **Auth Files**: Located in `server/replit_integrations/auth/` — do NOT modify or delete the `sessions` and `users` tables as they are mandatory for Replit Auth.
- **Client-Side**: `useAuth` hook fetches current user from `/api/auth/user`; unauthenticated users see a landing page; login redirects to `/api/login`.

### Storage Layer

- **Pattern**: Repository/Storage pattern — `server/storage.ts` defines an `IStorage` interface and `DatabaseStorage` implementation
- **Separation**: Auth storage is separate in `server/replit_integrations/auth/storage.ts`

### Shared API Contract

- `shared/routes.ts` defines all API endpoints with their HTTP methods, paths, input schemas, and response schemas
- The client uses a `buildUrl` helper to construct parameterized URLs
- Custom hooks in `client/src/hooks/use-projects.ts` wrap React Query calls for each endpoint

### Build & Development

- **Dev**: `npm run dev` — runs tsx with Vite middleware for HMR
- **Build**: `npm run build` — builds client with Vite, bundles server with esbuild
- **Production**: `npm start` — serves the built `dist/index.cjs`
- **DB Push**: `npm run db:push` — pushes schema changes to the database

## External Dependencies

### Required Services

- **PostgreSQL Database** — Connection string via `DATABASE_URL` environment variable. Used for all data storage including sessions.
- **Replit Auth (OpenID Connect)** — Provides user authentication. Requires `ISSUER_URL` (defaults to `https://replit.com/oidc`), `REPL_ID`, and `SESSION_SECRET` environment variables.

### Key NPM Packages

- **Frontend**: React, Vite, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, Framer Motion, Recharts, date-fns, react-day-picker, react-hook-form, zod
- **Backend**: Express, Passport, openid-client, express-session, connect-pg-simple, Drizzle ORM, pg (node-postgres), drizzle-zod
- **Build Tools**: esbuild, tsx, drizzle-kit

### Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Secret for session encryption
- `REPL_ID` — Replit deployment identifier (set automatically in Replit)
- `ISSUER_URL` — OpenID Connect issuer (defaults to Replit's OIDC)
- `TWILIO_ACCOUNT_SID` — Twilio account identifier
- `TWILIO_AUTH_TOKEN` — Twilio authentication token
- `TWILIO_PHONE_NUMBER` — Twilio sender phone number (+14474274045)

## Twilio SMS Notifications

### Implementation (`server/sms.ts`)
- Twilio SDK sends SMS notifications for key project events
- Secrets configured: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Phone numbers stored in `users.phone` column, editable by admins in Project Access card
- Notifications fire asynchronously (non-blocking) after the API response is sent
- Recipients are determined by role: admins and crew always receive notifications; clients only for their assigned projects
- The sender of an action is excluded from receiving that notification

### SMS Notification Triggers
- **New message** — All project participants (except sender) notified
- **Task created** (with assignee) — Assigned user notified
- **Task status changed** — All project participants notified
- **Milestone created** — All project participants notified
- **Photo uploaded** — All project participants (except uploader) notified
- **Document uploaded** — All project participants (except uploader) notified
- **Calendar event created** — All project participants (except creator) notified
- **Calendar event updated** — All project participants (except updater) notified

### Admin Features
- **Test SMS** button in Project Access card sends a test message to the admin's phone
- Test endpoint: `POST /api/sms/test` (admin-only)

### A2P 10DLC Registration
- Twilio number (+14474274045) should be registered for A2P 10DLC to reduce spam flagging
- Register at Twilio Console > Messaging > Compliance
- Clients (Island, Hangar) prefer text messages over email

## Online Presence System

### Implementation (`server/presence.ts`)
- In-memory Map tracks active users with heartbeat timestamps
- Users are considered online if heartbeat received within last 60 seconds
- Client polls heartbeat every 15 seconds, online list every 15 seconds
- Visibility toggle allows users to appear offline (in-memory state)

### API Endpoints
- `POST /api/presence/heartbeat` — Update user's last-seen timestamp
- `GET /api/presence/online` — Get list of currently online users
- `POST /api/presence/visibility` — Toggle user's online visibility
- `GET /api/presence/visibility` — Get user's current visibility setting

### Frontend Integration
- **Navbar**: Green pulsing dot with online user count; tooltip shows names and roles
- **User dropdown menu**: "Appear Offline" / "Go Online" toggle
- **Project Access card**: Green dots on avatars of online team members
- Hook: `client/src/hooks/use-presence.ts` provides `useOnlineUsers`, `useVisibilityToggle`, `isUserOnline`

### Future Enhancement
- Calendar-based deadline reminders (scheduled job to notify users before upcoming deadlines) still pending