# Client View Alignment — Implementation Plan

**Status:** Draft — planning only, no code changes yet
**Branch:** `feat/client-view-alignment`
**Goal:** Bring the client-facing surfaces into visual + IA alignment with the [portal mockup](https://www.perplexity.ai/computer/a/aster-spruce-client-portal-moc-6OMnG69MTDCa12SALgf7MA), without changing crew/admin views and without adding new business features.

This PR is intentionally narrow. Net-new features (Decisions log, Selections ledger, Budget pulse, Change orders, Site visit log, Documents shelf) ship in **separate follow-up PRs** in priority order — see the roadmap at the bottom.

---

## Context: what's already aligned

The repo's design system is largely there. No system rewrite needed.

| Already aligned | Where |
|---|---|
| Inter + Inter Tight loaded | `client/src/index.css` line 1 |
| Warm-paper background, sage/spruce primary | `client/src/index.css` `:root` |
| Tight tracking baked in | `--tracking-normal: -0.015em` |
| Per-role dashboards already isolated | `client/src/components/dashboard/{Client,Crew,Admin}DashboardView.tsx` |
| Canadian English vocabulary standard | `replit.md` |

So this PR tunes the **client surface** inside an existing system — not the system itself.

---

## Scope — three concerns

### 1. Client shell & navigation
*Make a client feel like they're in a portal, not a CRM.*

**Files:**
- `client/src/components/layout/Navbar.tsx` — when `user.role === "client"`, render flat underlined tabs (The Plan / Updates / Design Board), strip crew/admin nav items, simplify logo lockup
- `client/src/components/layout/MobileBottomNav.tsx` — client-only items
- `client/src/components/layout/AppShell.tsx` — for client role, hide left sidebar; centered max-w container (~1100px) with generous side padding

### 2. Client Dashboard → "The Plan" home
*Replace the generic dashboard with the mockup's home structure.*

**File:** `client/src/components/dashboard/ClientDashboardView.tsx`

**Layout (top → bottom), single-project case:**
1. **Property photo band** — full-width, ~240px tall, `object-fit: cover`, `filter: saturate(0.85) contrast(0.96)`, `PROJECT · CITY` chip bottom-right. Source: `projects.thumbnailUrl` (already exists), fall back to most recent `photos.isShowcase` photo, then to neutral placeholder.
2. **Project header strip** — `PROJECT · {code} · {STATUS}` chip, large title (Inter Tight 600, ~44px), 4-column metadata row (Phase / Schedule / Last visit / Next walkthrough)
3. **"This week" card** — current focus + 1–3 line note + most recent project photo on the right
4. **Milestone strip** — 8-ish milestone cards, active one expanded (existing `useMilestones` data)
5. **Reference cards** — links to Design Board, Documents, Messages
6. **Footer chip** — "Updated {date} · Aster & Spruce · West Vancouver"

**Multi-project case:** if a client has multiple active projects, top-of-page project switcher (small select styled as the project chip), then the layout above for the selected project.

### 3. ProjectDetails client view
*Strip back tabs, re-skin to match the mockup's calm record-keeping voice.*

**File:** `client/src/pages/ProjectDetails.tsx`

When `effectiveRole === "client"`:
- **Tabs visible:** The Plan, Updates (activity log + photo timeline), Design Board, Documents, Messages
- **Tabs hidden:** Planning Board, Progress (kanban), TableRedesignPlanner, internal-only tabs
- **Tab styling:** sentence case, file-tab style (underlined active), via lightweight CSS scoped to `[data-role="client"]`
- **Voice copy pass:** "What's happening now" → "This week", "Around the project" → "Reference", remove emoji, no italics
- **Design Board tab:** render existing `boardItems` + colour data in **inspiration collage + selections list** layout. Two new presentational components — no new endpoints

---

## Schema migration (small, additive)

Three additive columns on `projects` — no breaking changes, all nullable.

```ts
// shared/schema.ts — projects table additions
code: text("code"),                                   // human-readable, e.g. "HWR-204"
currentFocusText: text("current_focus_text"),         // weekly status sentence
currentFocusPhotoId: integer("current_focus_photo_id").references(() => photos.id),
```

Drizzle Kit: `npm run db:push`.

`photos.isShowcase` already exists — no change needed there.

---

## Components added (presentational only, no new server work)

```
client/src/components/client/
  PropertyPhotoBand.tsx
  ProjectHeaderStrip.tsx
  ThisWeekCard.tsx
  MilestoneStrip.tsx
  ReferenceCardGrid.tsx
  ClientInspirationGrid.tsx
  ClientSelectionsList.tsx
  ProjectSwitcher.tsx           // multi-project case only
  client-tabs.css                // file-tab visual override scoped to data-role="client"
```

All read from existing hooks: `useProject`, `useMilestones`, `usePhotos`, `useBoardItems`, `useActivityLog`.

---

## Files NOT touched (explicit non-scope)

- Any crew-only page (`Timesheets`, `Payroll`, `CrewAndTrade`, `MasterCalendar`, `SupplierPrices`)
- Any admin tooling (`AdminDashboardView`, market rates, labour rates)
- Server routes, auth flows
- Shared design tokens in `index.css` (already match)
- Crew or admin dashboard views

---

## Acceptance criteria

A `role === "client"` user logging in:
1. Sees a clean shell with three tabs (Plan / Updates / Design Board), no crew/admin items
2. Lands on a Plan page that visually matches the mockup at desktop and mobile
3. Can navigate to Design Board and see inspiration + selections in the two-zone layout
4. All existing client functionality (messages, documents, photos) still works — nothing regresses

A `role === "crew"` or `role === "admin"` user sees **zero changes** anywhere.

Other:
- Lighthouse a11y score on `/` for client role ≥ 95
- Three new nullable columns on `projects` — no breaking schema change
- No new dependencies (Inter is already loaded)

---

## Estimated size

~10 new presentational components, ~3 modified pages, 1 small migration, ~150–250 net new LOC. Reviewable in one sitting.

---

## Roadmap — follow-up PRs (not in this PR)

In priority order, each its own focused PR:

1. **Decisions log** — new `decisions` table + client-facing list. Highest-trust addition. *"What's been decided and when, so we never have to ask 'I thought we said…' again."*
2. **"Your action items" card** — client-only filter on existing tasks/checklist where assignee = client. Surfaces above This Week.
3. **Selections ledger** — operational view of `boardItems` with vendor / lead time / status fields (schema extension on `boardItems`).
4. **Budget pulse card** — restyle existing `BudgetSnapshot.tsx` for client view; show only the four numbers (contract / approved COs / spent / remaining). Respects `projects.budgetVisibleToClient`.
5. **Change orders inbox** — new `change_orders` table with approve/decline flow.
6. **Site visit log** — group existing photos by visit date with notes.
7. **Documents shelf** — restyle existing documents tab with category folders (Drawings / Finishes / Permits / Warranties).
