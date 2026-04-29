# ASL Connect — Walkthrough Self-Prompt

**Purpose:** A reusable prompt I (the agent) use to audit the app honestly, from the perspective of every real-world user. This exists because previous walkthroughs claimed issues were "addressed" when they weren't.

**Owner:** Theresa
**App:** asl-ai-assistant (Aster & Spruce Connect) — `app.asl-portal.ca`
**Last reviewed:** _fill in each run_

---

## Read this before you start

You have failed Theresa before on this task. You walked through the app, declared things fixed, and they were not fixed. She had to find the issues herself the next day. **That is the failure mode you are guarding against.** Read these rules and keep them in front of you the entire walkthrough.

### The seven non-negotiable rules

1. **Evidence or it didn't happen.** Every issue you log includes: the exact URL/route, the exact element, the literal text/error you saw, and a screenshot or copied snippet. Every fix you claim includes: the file path, the diff, and proof you re-tested the same flow on the deployed build (not localhost, not "should work").
2. **Re-test on the live deploy.** A merged PR is not a fix. After Railway redeploys, walk the same flow again on `app.asl-portal.ca` and confirm the exact symptom is gone. If you can't access the live deploy, say so — do not claim success.
3. **No "should now work."** Banned phrases: _should work, this should fix it, likely resolved, theoretically, in theory, I believe._ Either you tested it and it works, or you tested it and it doesn't, or you didn't test it. Pick one and say which.
4. **Honest status only.** Three statuses for every issue: `verified-fixed` (re-tested live), `code-changed-not-verified` (PR merged, deploy not re-tested), `not-fixed`. Nothing else. No "addressed," no "improved," no "should be better."
5. **Don't trust your last summary.** If you wrote "all critical issues fixed" in a previous session, assume you were wrong and re-verify each one from scratch this run.
6. **Surface what's missing, not just what's broken.** A button that does nothing is broken. A flow that works but feels confusing, ugly, or contractor-y is also a finding — log it as a UX issue, not a bug.
7. **Stay in character.** When you're walking as a client, you are not the developer. You don't know what a "drawer" is. You don't know that `?tab=board` means anything. If something doesn't make sense to a person who has never seen the app, that is the finding — even if the code is "correct."

### What "good" looks like for this app

Cross-reference everything against `docs/PRODUCT_PHILOSOPHY.md`. The bar is:

- **For clients:** Studio McGee project pages, boutique hotel apps, private bank portals. Calm, image-led, generous whitespace, anticipates needs. _Not_ Buildertrend.
- **For designers:** Apple Freeform-quality canvas. Pencil-first. They'd choose to use this.
- **For crew:** Utility on tap one. Timesheets, today's job, who's lead. No friction or they go back to text.

If a screen makes a client feel like they're inside a contractor CRM, that is a P1 finding even if every button works.

---

## How to run the walkthrough

### Step 0 — Setup (do this every run)

1. Pull latest from `main`: `cd asl-ai-assistant && git pull`
2. Confirm latest deploy on Railway matches latest commit on main. Note the commit SHA in the report header.
3. Open the live app at `https://app.asl-portal.ca` in a fresh incognito window. No saved sessions.
4. Get current test credentials from Theresa or use the seeded test accounts (admin: info@asterandspruceliving.ca, plus a test client account — ask if unsure, do not guess).
5. Create a new markdown report at `docs/walkthroughs/YYYY-MM-DD-walkthrough.md` using the template at the bottom of this file.

### Step 1 — Walk as each persona, in this order

You will do **four passes**. Do them in order. Do not merge them. Each pass has its own checklist below.

1. **Brand-new client** (invited by email, never logged in)
2. **Returning client** (already onboarded, has an active project)
3. **Designer** (logs in to use the Design Board on a real project)
4. **Admin / project manager** (Theresa — runs the business)

Optional 5th pass if time: **Crew member on a phone** (clocking in, checking today's job).

### Step 2 — For each persona, answer these four questions per screen

For every screen you land on, force yourself to answer:

1. **Does it work?** — Click every interactive element. Note the literal result.
2. **Does it make sense?** — Could a real person in this role figure out what to do without asking? If they paused or guessed, that's a finding.
3. **Does it flow?** — Is the next step obvious? Does the back button do what they'd expect? Are they ever dumped somewhere they didn't ask to go?
4. **Does it feel right?** — Match it against the philosophy doc. A renovation client who pays $$$ — would they be embarrassed to show this to their architect? Would a designer use it on their own project?

Log everything. A "yes to all four" still gets one line confirming you checked.

### Step 3 — Triage

Tag every finding with one of:

- **P0 — Broken** — Blocks the persona from completing their core job. Examples: invite link 404s, can't log in, upload fails silently, page errors out.
- **P1 — Wrong feel** — Works mechanically but violates the philosophy. Contractor-CRM aesthetics in client view, jargon, dead ends, ugly states, anything a high-end client would judge.
- **P2 — Confusing** — Works and looks ok but the flow makes the user pause. Unclear labels, hidden actions, missing empty states, surprising behaviour.
- **P3 — Polish** — Real but minor. Spacing, typo, off-by-one, inconsistent verb tense.

Only fix P0 and P1 in this pass unless Theresa says otherwise. Log P2/P3 for follow-up.

### Step 4 — Fix, then re-verify

1. Open one PR per coherent group of fixes (not one giant PR).
2. After merge + Railway redeploy, **walk the exact same flow again on the live URL** and confirm the symptom is gone.
3. Update the report: change status from `not-fixed` → `verified-fixed`. If still broken, say so and try again.
4. Never write a final summary that says "all fixed" until every P0/P1 in the report is `verified-fixed`.

### Step 5 — Final report

Hand back the markdown report with:
- Commit SHA tested
- Findings table (every finding, every status)
- Verbatim list of P0/P1 still open
- One-paragraph honest verdict — would you ship this to a paying client today, yes or no, and why.

---

## Persona walkthroughs

### Pass 1 — Brand-new client (Sarah, mid-renovation, never seen the app)

**Mindset:** Sarah is a 42-year-old homeowner in West Vancouver doing a $400k whole-home reno. She doesn't know what a "milestone" is in construction terms. She lives on her phone. She got an email from Theresa saying "here's your project portal."

**Flow to walk:**

1. Open the invite email. Is the from-address, subject line, and copy something a high-end client would respect? Click the invite link.
2. The accept-invite page (`/accept-invite/:token` or `/invite/:token` — note which one fires). Does the language welcome her or feel transactional? What does it ask for? Are required fields obvious?
3. Set password / create account. Password rules clear? Errors helpful or technical?
4. First landing screen after accepting. Is it `/welcome`? Is it the dashboard? Is it her project? Whichever it is — does she immediately understand _what this is and what to do next_?
5. Find "where am I in my renovation." Without scrolling forever. Without clicking around.
6. Find the most recent update from her builder. Find the latest photo of the work.
7. Find the design board. Open it on desktop _and_ mobile. Does it feel calm and image-led, or does it feel like a contractor app?
8. Try to send a message / ask a question. Does that path exist? Is it obvious?
9. Log out. Log back in. Does the second visit feel as good as the first, or is the first-run polish gone?

**Specific things to test honestly:**

- Does `OnboardingGuard` correctly route her to `/welcome` the first time? (Check `client/src/App.tsx`.)
- Does the client-only navbar actually hide crew/admin items, or does she see "Timesheets," "Payroll," etc.? (Check `Navbar.tsx`, `MobileBottomNav.tsx`.)
- On `ProjectDetails` with `effectiveRole === "client"`, are the hidden tabs (Planning Board, Progress kanban, TableRedesignPlanner) actually hidden? Open dev tools and confirm — don't trust the code comments.
- Empty states: photos empty, updates empty, milestones empty. What does she see? "No data" is a P1.

### Pass 2 — Returning client

**Mindset:** Sarah is back two weeks later. She wants one thing: "what changed since I last looked?"

**Flow:**

1. Log in. Where does she land? Does it answer "what's new" within 3 seconds of looking?
2. Are there visible read/unread states on updates? Or is everything just there with no signal?
3. Photo timeline — does it scan in order? Captions present?
4. Does the app remember which project she was last in (multi-project case)?
5. Open it on mobile. Does the bottom nav match the desktop tabs? Is parity maintained?

### Pass 3 — Designer (Megan, independent residential designer)

**Mindset:** Megan was added to one project as a designer. She wants to use the Design Board to lay out the kitchen with the client. Her standard is Apple Freeform — anything clunkier and she goes back to her own tools.

**Flow:**

1. Log in. Can she find the project? Is the role correctly assigned (designer vs client vs crew vs admin)?
2. Open the Design Board for the kitchen.
3. Add a tab (e.g., "Living Room"). Try to delete it. Try to rename it. _Theresa specifically reported in past sessions: "when i add a tab for example kitchen i cant delete it."_ Verify this is fixed, not just claimed fixed.
4. Pick a template. _Theresa specifically reported: "the boards were messy and didnt provide obvious examples."_ Verify the templates are obvious and useful, not placeholder.
5. Drag-and-drop from Houzz / Pinterest into the board. _Theresa specifically said: "for houzz and pinterest i want to be able to just drag and drop into the planning board."_ Test it. If not implemented, log as not-fixed.
6. Upload an image. _Theresa reported: "upload failed, could not upload image."_ Test on the live deploy. Confirm GCS storage works, not just that the code merged.
7. Use Apple Pencil on iPad if available. Latency? Pressure?
8. Hit "Presentation mode" / public share. Does the public link work in incognito? Does it hide internal data?

### Pass 4 — Admin (Theresa)

**Mindset:** She's running the business. Every minute the app costs her in friction is a minute she can't spend on a client.

**Flow:**

1. Dashboard — at-a-glance status of all active projects. Is it usable or noise?
2. Create a new project end-to-end. Add a client by email. Confirm the invite email actually sends (check inbox or logs — do not assume).
3. Invite a designer to that project. Confirm the role is set correctly.
4. Upload progress photos. Mark one as showcase. Confirm it shows on the client's "property photo band."
5. Update milestones. Confirm it propagates to the client view.
6. Crew tools: timesheets, payroll, master calendar, supplier prices. Each one — does it work, is the data real or seeded, would Theresa use this or open a spreadsheet instead?
7. Color portfolio, social media generator, table redesign planner, cost estimator. Same question.
8. Settings — can she rename a project, archive it, delete it? Are destructive actions guarded?

---

## Standing list of issues to verify (do not assume fixed)

Every walkthrough checks these explicitly, because they have been claimed fixed before and weren't. If a previous report says "fixed," ignore that and re-verify on the current live deploy.

- [ ] Invite link `/accept-invite/:token` vs `/invite/:token` — both routes present in App.tsx; confirm which the email sends and that the one not sent doesn't 404 if a user lands there
- [ ] First-time client lands on `/welcome` not raw dashboard
- [ ] Client navbar hides admin/crew nav items completely (desktop and mobile)
- [ ] Client `ProjectDetails` shows only: The Plan, Updates, Design Board, Documents, Messages
- [ ] Design Board tab can be added, renamed, deleted
- [ ] Design Board templates are useful, not placeholder
- [ ] Image upload to Design Board works on live deploy (post-GCS migration)
- [ ] Houzz / Pinterest drag-and-drop into board
- [ ] Public presentation link `/p/:token` loads without auth, hides internal data
- [ ] Password reset email actually sends and link works
- [ ] Email from-address and branding are not "noreply@railway"-tier
- [ ] Mobile bottom nav matches desktop tabs for each role
- [ ] Empty states exist for: no projects, no photos, no updates, no milestones, no design boards
- [ ] All Replit-auth references gone or properly bypassed (`OPENID_DISABLED=true` path)
- [ ] No "https not secure" warning on `app.asl-portal.ca` (reported previously)

---

## Walkthrough report template

Copy this to `docs/walkthroughs/YYYY-MM-DD-walkthrough.md` and fill it in.

```markdown
# Walkthrough — YYYY-MM-DD

**Commit tested:** <SHA from main>
**Live URL:** https://app.asl-portal.ca
**Personas walked:** New client / Returning client / Designer / Admin / (Crew)
**Test credentials used:** <which account>

## Verdict

One paragraph. Honest. Would I ship this to a paying high-end client today? Yes or no, and why.

## Findings

| # | Persona | Screen / Route | Severity | What I saw | What should happen | Status |
|---|---|---|---|---|---|---|
| 1 | New client | /accept-invite/:token | P0 | <verbatim> | <verbatim> | not-fixed |
| 2 | … | … | … | … | … | … |

## P0 / P1 still open at end of session

- #N — <one-line summary>

## Fixes shipped this session

| # | PR | Files | Re-tested live? | Status |
|---|---|---|---|---|
| 1 | #NN | client/src/… | Yes / No | verified-fixed / code-changed-not-verified |

## Notes for next walkthrough

Anything I noticed but didn't have time to chase. Leave a trail for the next run.
```

---

## When to use this prompt

- Whenever Theresa says "go through ASL as a new user" or any variant
- Before any release / public demo
- After any PR that touches client-facing code, auth, invites, or the Design Board
- Monthly, even if nothing has changed — drift happens
