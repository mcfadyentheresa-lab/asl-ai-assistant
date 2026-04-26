# ASL Connect — Product Philosophy

*Last updated: April 25, 2026*

This document captures the foundational decisions about what ASL Connect is, who it's for, and how it should feel. It exists so every future feature decision can be checked against the same point of view.

---

## What we're building

ASL Connect is a renovation portal for **high-end residential clients**, built first for Aster & Spruce Living, designed from day one to be **white-label ready** for other contractors.

It's also — quietly — a designer-grade collaboration tool. The design board is good enough that working interior designers would choose to use it even on projects that aren't with us.

---

## Who it's for

### Primary audience: high-end clients

- Affluent homeowners undertaking custom renovations
- Often first-time renovators — they don't know the language or rhythm of the process
- Hold the app to the same standard as the rest of their life: Apple, private banking, boutique services
- Will judge it on aesthetics the same way they judge millwork
- Have probably tried Buildertrend / CoConstruct and found them clunky and contractor-first

### Secondary audience: interior designers

- Independent / boutique residential designers (Studio McGee tier) and in-house designers at builder firms
- Brand-conscious; want a tool that makes them look professional to clients
- Will reject anything that feels like construction software
- A tool they love becomes a recruitment lever for our business

### Tertiary audience: crew

- The people doing the work on site
- Need utility on tap one — timesheets, today's job, who's the lead
- Most likely to revert to old habits (text, paper) if the app friction is too high

### White-label audience (future): other contractors

- Eventual paying customers using ASL Connect as a SaaS for their own businesses
- Their clients should never see "ASL Connect" branding
- Their designers should be able to plug in seamlessly

---

## What success looks like

> "Clients feel confident and comfortable with how their project is coming along. They know what's next."

Not status reports. Not data dashboards. **Confidence and clarity** for people navigating an unfamiliar process.

Specifically:
- Clients stop pinging us for updates because the portal answers their questions
- Clients refer us to friends because the experience felt like part of the craft
- We can confidently demo this to white-label prospects
- Designers ask if they can use the board on projects of their own

---

## The feel

### Reference points (good)

- Studio McGee's project pages — editorial, photographic, calm
- Boutique hotel / hospitality apps — warm, considered, "we anticipate your needs"
- Private bank client portals — quiet, confident, generous whitespace
- Apple product pages — minimal, image-led, almost no chrome
- Apple Freeform — Pencil-quality canvas without ceremony

### Reference points (bad)

- **Buildertrend, CoConstruct** — busy, dated, contractor-first
- **Houzz Ideabooks** — consumer-grade, not designer-grade
- Generic SaaS dashboards with cards-on-cards-on-cards

### Tone — adaptive, not fixed

The same data should be surfaced differently depending on who's reading and what they need:

- **Insider** — assume they know the basics. Light captions.
- **Insightful** — explain context, not vocabulary. "Why this stage matters" not "What demolition means."
- **Curated** — show only what needs attention; hide complexity by default.

We don't talk down. Ever.

---

## The communication model

The portal is one of four concentric rings of communication. Each ring has a job; they don't compete.

| Ring | What it owns | Cadence |
|---|---|---|
| **Portal** | The canonical record of work — milestones, photos, decisions, selections, financials | Always available |
| **Email** | The heartbeat — beautiful, AI-drafted, admin-approved updates that point back to the portal | Weekly + event-driven |
| **SMS** | Rare urgent signals only — never a constant background hum | Off by default |
| **Direct human** | Relationship and logistics — Terry's "running 30 min late" texts, your check-in calls | Untouched by the system |

**The rule:** anything a future client would want to see if they took over the project lives in the portal. Anything that's about the human relationship between us and them stays direct.

### What we replace

| Today | Goes where |
|---|---|
| Theresa's random update emails | → Portal weekly update (AI-drafted, admin approves) + email notification |
| Terry's "we'll be there at 8" texts | → Stays as text. Logistics ≠ portal. |
| QuickBooks invoices via email | → Portal Finance section + email notification |
| "We hit a snag" calls | → Phone call first, then portal note with framing |
| Photos shared via text or Drive | → Portal gallery, attached to the relevant milestone |
| Selection approvals over email | → Portal "decisions awaiting you" queue |

---

## SMS policy

- **Off by default** at the tenant level
- When on, every message goes through:
  - **Approval gate** — admin must approve before send
  - **Quiet hours** — 9am–7pm client local time
  - **Per-client opt-out** — respected without asking each time
- **Invite SMS** is a separate toggle (worth keeping ON because of missed-invite risk)
- **No automated SMS on CRUD events** — kill the audit's finding

---

## Email reply policy

- **Primary CTA on every email: "View in portal →"**
- **Some emails (updates, decisions) include a "Reply via email" link** that opens a fresh email pre-addressed to `info@asterandspruceliving.ca`
- **Subject line tagged with project code:** `[MCK-K1] Subject — Date`
- **No copy explaining the reply mechanism** — replies just work the way email always works
- **Replies land in the admin inbox**; substantive ones get promoted to the portal thread by the admin (or AI co-pilot suggests promotion)
- **No automated inbound email parsing in v1** — that's a v2 upgrade once volume justifies it

---

## Transparency

> "If there's a problem, address it internally first, then share with the client framed accordingly."

Implications:
- **No raw status changes auto-publish** to client-facing surfaces
- **Draft → admin approval → publish** workflow for anything client-facing
- **AI co-pilot drafts to admin**, not directly to client
- Delays and blocks are shown honestly, but **the framing is chosen by admin per situation**

---

## The three client surfaces

Three distinct surfaces, each with a different design language. Not seven tabs.

### 1. The Plan
**For:** clients (primary), crew
**What it answers:** "What's happening with my project?"
**Feel:** calm, structured, editorial
**Devices:** all, phone-friendly

The home page of the client portal. A vertical list of milestones with status text (Complete / In progress / Upcoming) and dates. No progress bars or percentages — the position in the list does the visual work.

**Layout, top to bottom:**
1. Hero header — photo of the home, project name, "Week 7 of 12 · On track for June 18"
2. **What's happening now** — single calm card naming the in-progress milestone, expected completion, and the next milestone
3. **The plan** — vertical list of all milestones with status text
4. **Supporting sections** (collapsed by default): Decisions awaiting input, Budget, Documents, Team

**Click a milestone:** expands inline to show the latest AI-drafted update for that milestone + its photos.

**Vocabulary:** "Milestones." Tasks stay internal — clients don't see them.

### 2. Updates
**For:** clients (primary), admin (drafts)
**What it answers:** "What just happened? What does it mean?"
**Feel:** editorial article
**Devices:** all

Each update lives attached to its milestone. Editorial copy, photos, and a forward-looking "next" preview at the end. AI-drafted, admin-approved, then both a portal entry AND an email notification go out.

The weekly update is **the centerpiece** of the relationship. It's why clients open the portal weekly.

### 3. The Design Board
**For:** designer (primary), admin, client
**What it answers:** "What is this going to look like?"
**Feel:** creative, visual, freeform
**Devices:** iPad / desktop primary; phone is read-only / simplified

A compositional canvas — not a Pinterest grid. The designer composes; the client peeks at the brainstorm and pins their own inspiration.

**Item types:**
- Images (camera roll upload)
- Links (paste a URL, auto-fetch preview)
- Color chips (paint codes, fabric tones)
- Sketches (Apple Pencil — both free drawing layer over the canvas AND attached annotations on items)

**Organization:** one board per project, sectioned by room (Kitchen / Primary Bath / Mudroom).

**Two-tier item model (for copyright safety):**
- **Inspiration** items: linked, thumbnail-only, click opens source. Like Pinterest's model. Low legal risk.
- **Selections** items: embedded, owned-rights only (own photos, supplier-approved product shots, paint chips).
- Subtle visual distinction between the two (e.g., tiny external-link arrow on inspiration items).

**Permissions:**
- Designer: full control of layout and content
- Admin: can comment, can promote items from Inspiration to Selections (which feeds the project's selection sheet)
- Client: can pin to a "client wishlist" zone, can comment on items, **cannot rearrange the designer's layout**

**Hero feature: Presentation mode.**
The same board, viewed in present mode, becomes a clean walkthrough — no UI, just the design spread across the screen, navigated like a slideshow. This is what designers show clients in meetings, post on Instagram, and use to convert future clients.

**Build staging:**
- v0.1: Static moodboard (images, links, color chips), no Pencil — validate the structure
- v0.5: Pencil sketches, presentation mode — first version that earns "designer love"
- v1.0: Selections-flow (inspiration → selection → order metadata) + multi-author permissions

---

## The AI co-pilot

The AI assists the **admin**, not the client. It is approval-gated everywhere — nothing goes out to a client without a human review.

Four roles, all of them admin-facing:

1. **Drafter** — writes weekly updates, decision-explanation notes, change-order framings, in the brand voice. You tweak and approve.
2. **Spotter** — watches the project context (inspiration, selections, photos, milestone notes) and surfaces opportunities to elevate the experience. *"Their inspiration board mentioned a reading nook — want to flag this corner during framing?"*
3. **Anticipator** — catches problems before the client does. *"Material delivery is 4 days late, want me to draft an explanation before they ask?"*
4. **Tone-matcher** — rewrites your drafts to match brand voice and the appropriate tone (insider/insightful/curated) for the recipient.

**Workflow:** AI drafts → admin reviews and edits → admin publishes. AI gives 2-3 options when the message matters; AI drafts in the admin's voice for routine updates; AI surfaces bullet points when the human wants to write the prose.

This is what makes the entire portal sustainable for one operator. Without it, the weekly-updates promise burns out the admin within a quarter.

---

## White-label readiness

The portal is **tenant-aware from day one**, even though there's only one tenant today (Aster & Spruce).

This means:
- All copy reads from tenant config (brand name, contact, brand colors)
- Greeting reads "Welcome to your project with **{tenant.brandName}**" — never hardcoded
- Footer links to tenant's marketing website
- Per-tenant subdomains planned: `asterandspruce.asl-portal.ca`, `acmeconstruction.asl-portal.ca`
- Custom domains as a paid upgrade tier later (e.g., `clients.acmeconstruction.com`)

**Login URL pattern:** decided during cutover. Single shared, per-tenant subdomain (recommended), or custom domain — to be locked in when we provision Railway.

---

## What we are *not* building

Some explicit non-goals to keep scope honest:

- **Not a Buildertrend competitor.** We are not selling to volume builders or budget-conscious GCs.
- **Not a project management tool for the contractor industry at large.** ASL Connect is for *high-end* residential firms who care about how the work is presented to clients.
- **Not a Pinterest replacement.** The design board is for working professionals, not casual collectors.
- **Not a real-time collaboration platform.** Updates are a curated, reviewed cadence, not a live feed.

---

## Decisions log (April 25, 2026 brainstorm)

| Decision | Choice |
|---|---|
| Audience | High-end residential clients, first-timers but not patronized |
| Primary feel | Editorial, calm, photographic — Studio McGee meets boutique-hotel-app |
| Visit cadence assumption | Weekly |
| Communication model | Concentric circles (Portal / Email / SMS / Direct human) |
| SMS policy | Off by default; approval-gated; quiet hours 9am–7pm; invite SMS optional |
| Email replies | Hybrid with subject-line tagging; replies to admin inbox; no auto-parse in v1 |
| Transparency | Address internally, share externally with framing |
| AI co-pilot scope | Drafter / Spotter / Anticipator / Tone-matcher; admin-facing; approval-gated |
| Client surfaces | The Plan / Updates / Design Board (three, not seven tabs) |
| Plan view structure | Milestone list with status text; no progress bars; click expands to update + photos |
| Plan vocabulary | "Milestones" (tasks stay internal) |
| Design Board scope | Designer-grade; iPad/Pencil primary; presentation mode is the conversion lever |
| Design Board copyright model | Two-tier: Inspiration (linked) vs Selections (owned/embedded) |
| White-label | Tenant-aware from day one |

---

*This document supersedes ad-hoc decisions made elsewhere. When in doubt, check this first.*
