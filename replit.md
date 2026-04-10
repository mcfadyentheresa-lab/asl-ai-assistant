# Aster & Spruce Connect

## Overview

Aster & Spruce Connect is a premium web application for Aster & Spruce Living, a high-end renovation company. It provides a dual-purpose portal for clients to track renovation projects and for internal crew/field teams to manage time, tasks, and communications. An administrative role offers comprehensive project oversight. The application aims for a "warm minimalist" luxury aesthetic.

The long-term vision is to transition Aster & Spruce Connect into a SaaS offering for other renovation companies, featuring a multi-tenant architecture, tiered subscriptions, and integrated billing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Overall Structure

The project uses a monorepo structure with a React SPA frontend (`client/`), an Express.js backend API (`server/`), and shared TypeScript assets (`shared/`) for types, database schema, and API route definitions.

### Frontend Architecture

The frontend is a React 18 SPA with TypeScript, Vite, Wouter for routing, and TanStack React Query for state management. UI components are built with shadcn/ui on Radix UI primitives, styled with Tailwind CSS. Animations use Framer Motion, forms use React Hook Form with Zod, and charts use Recharts.

### Backend Architecture

The backend uses Node.js with Express.js and TypeScript, providing a RESTful JSON API. Input validation is done with Zod schemas derived from Drizzle.

### Database & ORM

PostgreSQL is the database, accessed via Drizzle ORM. The schema includes tables for users, sessions, projects, milestones, tasks, photos, documents, time entries, messages, and planning boards. Drizzle Kit is used for schema management.

### Authentication & Authorization

Replit Auth provides authentication via OpenID Connect, with session management in PostgreSQL. Role-based access control (client, crew, admin) is implemented. The `users` and `sessions` tables are managed by Replit Auth.

### Shared API Contract

`shared/routes.ts` defines the API contract, ensuring type-safe communication between client and server.

### Key Features

*   **Twilio SMS Notifications**: Automated notifications for project events, respecting business hours.
*   **Online Presence System**: Tracks and displays active users.
*   **Paint Colour Portfolio**: Manages a database of paint colours for browsing. The colour tag feature (tagging boards with paint colours) has been removed.
*   **Planning Board Designer Tools**: A spatial canvas for design collaboration with various element types and drawing tools.
*   **Board Version Snapshots**: Allows saving and restoring planning board versions.
*   **Planning Board Templates**: Two pre-built board templates (Collage Concept Board, Material Inspiration Board) that seed new boards with labelled zones and placeholder elements. Template data is defined in `server/board-templates.ts` as Fabric.js JSON.
*   **Text Size Accessibility**: Provides a persistent text zoom feature.
*   **Crew Timesheets & Admin Payroll**: Bi-weekly timesheet system with draft/submitted/approved workflow, pay period navigation (prev/next), crew-friendly language, and admin payroll view.
*   **Crew "My Day" Dashboard**: When in crew view mode, the dashboard shows a "Your Assignments" panel with tasks grouped by project, inline status toggling (To Do → In Progress → Done), quick links to Timesheets and Master Calendar, and a personalised subtitle with open assignment count. Backend `GET /api/my-tasks` endpoint fetches tasks assigned to the logged-in user.
*   **Cost Estimator**: Per-project estimation tool with line items, material markup, market rate auto-fill, variance warnings, and receipt tracking. Includes an AI Scope Analyzer (OpenAI/gpt-5-mini), an "Import from Board" feature, and a toggleable management fee (default 25%) applied before HST. Accessible from the Budget Snapshot card on each project via `/project/:id/estimate`.
*   **Labor & Contractors**: Admin page for managing crew pay/billable rates and a subcontractor directory.
*   **Supplier Price Book**: Admin-only material pricing database with supplier and product management, integrated with the Cost Estimator.
*   **Gantt Chart / Progress Tab**: A nested expandable tree view of projects with buildings, rooms, and tasks, supporting drag-and-drop scheduling and progress tracking.
*   **Overview Tab — Project Snapshot**: Condensed cards for project milestones and checklist status.
*   **Move Checklist to Timeline**: Admin-only action to promote checklist items to the Gantt timeline.
*   **Budget Snapshot (Overview Tab)**: At-a-glance budget card with client visibility toggle.
*   **Back Navigation**: Consistent back navigation on admin/utility pages.
*   **Real-time Collaboration**: WebSocket-based project rooms for live updates across all project data, with active viewer tracking and conflict resolution.
*   **Client Onboarding System**: Admin-initiated client invite flow via SMS, including invite validation and profile completion.
*   **Unified Calendar View**: Per-project calendar shows timeline bars (milestones, rooms, tasks) from the Gantt chart alongside calendar events, with layer toggles. A Master Calendar page (`/master-calendar`) aggregates data across all projects for admin/crew, with project filtering.
*   **Social Media Content Library**: Admin-only page (`/social-media`) with Generate and Library tabs. Generate tab: AI-powered caption generation (Controlled, Random, Before/After, Batch, Seasonal modes) using OpenAI gpt-5-mini. All generated posts auto-save to a `social_posts` DB table with paired project photos. Library tab: browsable grid of saved posts with project/platform/status filters, inline editing, status workflow (Draft → Ready → Posted), copy-to-clipboard, and Google Drive export. Milestone completions auto-trigger draft social posts. Seasonal prompts suggest timely Muskoka cottage content ideas.
*   **Table Redesign Planner**: Admin-only page (`/table-redesign`) for creating structured furniture redesign concepts. Supports piece types: table, desk, console, coffee table. Inputs include before/inspiration image uploads, dimensions, shape, weight class, existing material, redesign scope, proposed base type (pedestal/trestle/four-leg/plinth/custom), style/finish direction, and notes. Outputs editable concept title, description, recommended base size range (planning guidance only), materials/spec list, build notes, and disclaimer. Heavy/stone/glass/concrete tops trigger a visible warning. "Add to Planning Board" pushes a clean card (image + title + description + optional tag) to a selected board. Client Share View provides a presentation-ready summary with copy-to-clipboard. Data stored in `table_redesign_plans` and `table_redesign_materials` tables.

## External Dependencies

*   **PostgreSQL Database**: For all data storage.
*   **Replit Auth**: For user authentication.
*   **Twilio**: For SMS notifications.
*   **OpenAI (via Replit AI Integrations)**: Powers the Cost Estimator's AI Scope Analyzer and the Social Media Content Library (gpt-5-mini).
*   **Google Drive (via Replit Connectors)**: Exports social media posts to Google Drive using `@replit/connectors-sdk` proxy pattern.

### Key NPM Packages

*   **Frontend**: React, Vite, Wouter, TanStack React Query, shadcn/ui, Radix UI, Tailwind CSS, Framer Motion, Recharts, date-fns, react-day-picker, react-hook-form, zod.
*   **Backend**: Express, Passport, openid-client, express-session, connect-pg-simple, Drizzle ORM, pg, drizzle-zod.
*   **Build Tools**: esbuild, tsx, drizzle-kit.

### Environment Variables Required

*   `DATABASE_URL`
*   `SESSION_SECRET`
*   `REPL_ID`
*   `ISSUER_URL`
*   `TWILIO_ACCOUNT_SID`
*   `TWILIO_AUTH_TOKEN`
*   `TWILIO_PHONE_NUMBER`

## Manual Setup Steps

### Rename Replit Project
The Replit project should be renamed from "AI Assistant Helper" to "Aster & Spruce Living" so the Replit login screen shows the correct brand name. To do this: go to Replit project settings and change the project name to "Aster & Spruce Living".