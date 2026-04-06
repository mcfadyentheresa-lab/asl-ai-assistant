# Aster & Spruce Connect

## Overview

Aster & Spruce Connect is a premium web application designed for Aster & Spruce Living, a high-end Muskoka cottage renovation company. It serves as a dual-purpose portal, providing tailored experiences for both clients and internal crew/field teams. Clients can track their renovation projects, accessing progress updates, timelines, photos, documents, budgets, and communication tools. Crew members benefit from a mobile-first interface for time tracking, task management, daily logs, and internal messaging. An administrative role offers comprehensive project oversight and reporting capabilities. The application aims for a "warm minimalist" luxury aesthetic, utilizing a deep forest green, warm neutrals, and elegant typography.

The long-term vision includes transitioning Aster & Spruce Connect into a SaaS offering for other renovation companies, featuring a multi-tenant architecture, tiered subscriptions, and integrated billing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Overall Structure

The project employs a monorepo structure, separating the React SPA frontend (`client/`), the Express.js backend API (`server/`), and shared TypeScript assets (`shared/`) including types, database schema, and API route definitions.

### Frontend Architecture

The frontend is a React 18 SPA built with TypeScript, using Vite for bundling, Wouter for routing, and TanStack React Query for state management. UI components are built with shadcn/ui on Radix UI primitives, styled with Tailwind CSS and custom properties for theming. Animations are handled by Framer Motion, forms by React Hook Form with Zod validation, and charts by Recharts. Date handling is managed with date-fns and react-day-picker.

### Backend Architecture

The backend utilizes Node.js with Express.js and TypeScript. It provides a RESTful JSON API under the `/api/*` prefix, with shared route definitions. Input validation is enforced using Zod schemas derived from Drizzle schemas. The development server uses Vite middleware for frontend serving, while production serves static files from a built client.

### Database & ORM

PostgreSQL is the chosen database, accessed via Drizzle ORM. The schema, defined in `shared/schema.ts` and `shared/models/auth.ts`, includes tables for users (with roles), sessions, projects, milestones, tasks, photos, documents, time entries, messages, and planning boards. Drizzle Kit is used for schema management.

### Authentication & Authorization

Replit Auth provides authentication via OpenID Connect, with session management handled by `express-session` storing data in PostgreSQL. Role-based access control (client, crew, admin) ensures appropriate data visibility. The `users` and `sessions` tables are critical for Replit Auth and should not be modified.

### Storage Layer

A Repository/Storage pattern is implemented in `server/storage.ts` for data persistence, with a separate storage module for authentication.

### Shared API Contract

`shared/routes.ts` defines the API contract, specifying all endpoints, HTTP methods, input, and response schemas, ensuring type-safe communication between client and server.

### Build & Development

Development uses `npm run dev` for HMR, `npm run build` compiles both client and server for production, and `npm start` runs the production build. `npm run db:push` handles database schema updates.

### Feature Specifications

*   **Twilio SMS Notifications**: Automated SMS notifications for key project events (e.g., new messages, task assignments, photo uploads). Notifications respect business hours (Monday-Friday, specific times), with messages outside these hours queued and sent later. Admin features include a test SMS capability.
*   **Online Presence System**: Tracks active users with heartbeats and displays online status. Users can toggle their online visibility.
*   **Paint Color Portfolio**: Manages a database of paint colors (e.g., Benjamin Moore), allowing users to browse, search, and filter colors. Integrated into planning boards for color tagging of projects and boards.
*   **Planning Board Designer Tools**: A spatial canvas (`SpatialCanvas.tsx`) supporting various element types for design and collaboration, including notes, links, to-dos, images, color swatches, material swatches, and drawing tools.
*   **Board Version Snapshots**: Allows users to save and restore named versions of planning boards.
*   **Text Size Accessibility**: Provides a text zoom feature with multiple scaling options, persistent across sessions.
*   **Crew Timesheets & Admin Payroll**: Bi-weekly timesheet system (anchored Jan 6, 2025) for crew time tracking with draft/submitted/approved workflow. Admin payroll view with period navigation, crew hour summaries, and bulk approval. Role-gated access (crew sees timesheets, admin sees payroll).
*   **Cost Estimator**: Per-project cost estimation tool at `/project/:id/estimate` with line items priced per square foot or per board/unit. Features 25% material markup toggle, market rate auto-fill from 20 seeded Muskoka renovation categories, price variance warnings (too low/too high with ignore option), and receipt tracking with actual-vs-estimated variance analysis. AI Scope Analyzer powered by OpenAI (gpt-5-mini via Replit AI Integrations) generates estimated quantities per trade category from a natural language project description. Labor cost tracking with crew rate and subcontractor rate auto-fill in line items. "Import from Board" feature pulls material and product elements from project planning boards directly into estimate line items with auto-populated fields. Client budget tracking with progress bar, over/under budget indicators, and AI-powered "Suggest Cost-Saving Alternatives" that analyzes line items vs budget to recommend cheaper material alternatives with estimated savings and trade-off explanations. Admin market rates page at `/market-rates` for updating baseline pricing. Schema: cost_categories, market_rates, project_estimates (with budget field), estimate_items, receipts, estimate_warnings.
*   **Labor & Contractors**: Admin page at `/labor-rates` for managing crew pay/billable rates and subcontractor vendor directory. Tracks crew member hourly pay vs. client billing rates with margin calculations. Subcontractor directory with contact info, trade categories, hourly/daily/unit rates, preferred vendor flagging. Seeded with 6 crew roles and 10 Muskoka-area subcontractors (plumbing, electrical, HVAC, roofing, drywall, countertops, tile, septic, docks, landscaping). Integrated into Cost Estimator for auto-filling labor costs from crew or subcontractor rates. Schema: crew_rates, subcontractors.
*   **Trade Contacts**: Quick-reference directory at `/trade-contacts` for crew and admin. Shows subcontractors organized by trade with go-to/preferred contacts highlighted at top. Features search filtering by name/trade/phone/email and trade category filter badges. Mobile-friendly card layout with clickable phone and email links for on-site use.
*   **Supplier Price Book**: Admin-only material pricing database at `/supplier-prices`. Manages suppliers (seeded with Muskoka Lumber) and their product prices built from actual receipts. Features supplier pill/tab selector, price CRUD with product name/code/URL/unit type/category, "Add from Receipt" quick-entry flow, search/filter, and edit supplier details. Integrated into Cost Estimator's Add Item dialog via "Fill from Price Book" auto-fill that populates unit cost, unit type, material cost, product URL, and notes from saved supplier prices. Schema: suppliers, supplier_prices tables with FK relationships to cost_categories and receipts.
*   **Gantt Chart / Progress Tab (Buildings → Rooms Nested Timeline)**: The "Progress" tab in ProjectDetails combines three sub-views: Timeline (Gantt chart), Checklist, and Calendar. The Gantt chart (`client/src/components/GanttChart.tsx`) uses a **nested expandable tree** with Buildings as top-level rows (mapped to milestones DB table) and Rooms (mapped to sections DB table) indented below each building with expand/collapse toggles. Both building and room bars display simultaneously on the Gantt timeline. Clicking a room drills into its Work Categories / Tasks view. Breadcrumb navigation: All Buildings > Building > Room. Buildings have `startDate`/`endDate`, `colorHex` (custom building colour), and `paintColorIds` (integer array linking to paintColors table for paint colour notes). Each building row has 3px left accent border using its colour, expand/collapse chevron, progress bar, room count, paint colour swatches, drag-to-reorder, and context menu (Add Room, Add Task). Room rows are indented with smaller font and drill into work categories on click. Dates rendered on Gantt bars (>80px = full range, 40–80px = start only). Building colour picker popover, paint colour panel with searchable add/remove in drill-down header. Trade preset chips shown when adding a work category. Drag-to-reorder at building, room, and task levels. Role-gated: clients see read-only, crew/admin can add buildings/rooms/tasks, reorder, and check off tasks. Schema: milestones table with `colorHex` text and `paintColorIds` integer array columns. Sections table stores rooms.
*   **Budget Snapshot (Overview Tab)**: At-a-glance budget card in the project Overview tab sidebar showing client budget, amount spent (from receipts), progress bar, and color-coded status indicator (On Track / Under Budget / Over Budget). Admin/crew users have a toggle switch to control whether clients can see the budget snapshot (`budgetVisibleToClient` on projects table, default hidden). Backend endpoints: `GET /api/projects/:id/budget-summary` and `PATCH /api/projects/:id/budget-visibility`. `budgetVisibleToClient` is stripped from the generic project update route for security.
*   **Back Navigation**: All admin/utility pages (Market Rates, Labor & Contractors, Timesheets, Payroll, Supplier Price Book, Trade Contacts) include a back arrow button in the page header that navigates to the dashboard (`/`).
*   **Real-time Collaboration**: WebSocket-based project rooms that enable live updates across all project data (tasks, milestones, photos, documents, messages, estimates, receipts, calendar, checklist, board items). Extended `server/websocket.ts` with project rooms alongside existing planning board rooms. `useProjectRealtime` hook (`client/src/hooks/use-project-realtime.ts`) manages WebSocket connection, tracks active project viewers, and invalidates React Query cache on incoming updates. Active viewers displayed as avatars in ProjectDetails header. Conflict resolution via last-write-wins with toast notifications when another user modifies project data (throttled to 3-second intervals). ~25 API mutation routes broadcast changes via `broadcastProjectChange()` with sourceUserId for own-change suppression.

## External Dependencies

### Required Services

*   **PostgreSQL Database**: Essential for all data storage. Connection string via `DATABASE_URL`.
*   **Replit Auth**: Provides user authentication. Requires `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables.
*   **Twilio**: Used for SMS notifications. Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.

### Key NPM Packages

*   **Frontend**: React, Vite, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS, Framer Motion, Recharts, date-fns, react-day-picker, react-hook-form, zod.
*   **Backend**: Express, Passport, openid-client, express-session, connect-pg-simple, Drizzle ORM, pg (node-postgres), drizzle-zod.
*   **Build Tools**: esbuild, tsx, drizzle-kit.

### Environment Variables Required

*   `DATABASE_URL`
*   `SESSION_SECRET`
*   `REPL_ID`
*   `ISSUER_URL`
*   `TWILIO_ACCOUNT_SID`
*   `TWILIO_AUTH_TOKEN`
*   `TWILIO_PHONE_NUMBER`

### Feature Specifications (continued)

*   **Client Onboarding System**: Admin-initiated client invite flow via SMS. Schema: `client_invites` table (token, projectId, firstName/lastName/email/phone, userId, createdBy, expiresAt, acceptedAt, status). `onboardingCompleted` field on `users` table. API: `POST /api/projects/:id/invite-client` (admin-only, creates user + invite, sends SMS via Twilio), `GET /api/invites/:token/validate` (public, returns project name + invite status), `POST /api/invites/:token/accept` (authenticated, email-verified, marks accepted, links user to project), `POST /api/auth/complete-onboarding` (authenticated, Zod-validated profile completion), `GET /api/projects/:id/invites` (admin-only invite list). Frontend: `InviteAccept.tsx` at `/invite/:token` (validates + accepts invites, handles expired/accepted/invalid states), `Welcome.tsx` at `/welcome` (profile completion for new clients). Invite UI in ProjectDetails sidebar with invite dialog and status badges (pending/accepted/expired). Auth `returnTo` redirect support for post-login invite acceptance. Landing page button changed from "Team Login" to "Log In".