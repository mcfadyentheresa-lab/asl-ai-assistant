# Walkthrough — 2026-04-29

**Commit tested at start:** `01b71328` (origin/main)
**Commit tested at re-verify:** `5c0bcba` (origin/main, after PR #96 + #97 merged)
**Live URL:** https://app.asl-portal.ca
**Personas walked:** New client / Returning client / Designer / Admin (code-level + public-route live testing)
**Test credentials used:** None — no logged-in session was available, so internal-flow findings come from a deep code walk-through against the live deployment, not from clicking through as a real user.

## Honest scope caveat

I could not fully walk this app as a logged-in client/admin — I had no test credentials this session. Everything below is either:
- (a) tested live against `app.asl-portal.ca` as an unauthenticated visitor, or
- (b) read directly from the source on `main` and traced through the actual route/handler graph.

Anything that depends on a database state I haven't seen (real projects, real photos, real invites in flight) is flagged as "needs live verification."

## Verdict

**No, I would not ship this to a paying high-end client today.** Three of the issues below are flat-out broken in ways a client would hit in their first session: a dead-link primary navigation, an invite email that points at the wrong domain, and a phone experience that hides three of the four primary surfaces. The product philosophy doc sets a Studio McGee / private-bank bar, and these gaps fall short of that bar in basic ways before any visual polish question is even on the table.

Six of these are fixed in this PR. The remaining items (truthfully logged below) are not yet fixed and require either a UX decision or live verification I cannot do alone.

## Findings

| # | Persona | Screen / Route | Severity | What I saw | What should happen | Status |
|---|---|---|---|---|---|---|
| 1 | New client | Email invite link (`server/email.ts`) | **P0** | `APP_URL` falls back to `https://asterandspruce.com` when neither `REPLIT_DEPLOYMENT_URL` nor `REPLIT_DEV_DOMAIN` is set. On Railway, neither is set. Every `sendClientInviteEmail` call has been emitting `https://asterandspruce.com/invite/<token>` — the marketing site, which 404s. | Read `APP_URL` env first (matches `replitAuth.ts` and `sms.ts`), fall back to `https://app.asl-portal.ca`. | **code-changed-not-verified** — code merged on main `5c0bcba`, `APP_URL=https://app.asl-portal.ca` set on Railway, but I have not actually triggered a real invite email send and inspected the rendered link. Needs a real invite to a throwaway address to be `verified-fixed`. |
| 2 | Returning client | Top nav (`client/src/components/client/ClientTabsNav.tsx`) | **P0** | Tabs link to `/updates` and `/design-board`. Neither route is defined in `App.tsx`. Clicking either drops the client on the NotFound page. | Resolve each tab to a real destination — for "Updates" → `/project/:id?tab=overview`, for "Design Board" → `/project/:id?tab=board`. Add Documents and Messages too so the nav matches the philosophy doc. | **bundle-verified, click-not-verified** — live JS bundle `index-BzkApios.js` contains `tab=board`/`tab=overview` deeplinks and zero hits for the broken `to:"/updates"`/`to:"/design-board"` strings. Cannot click as a logged-in client without test credentials, so I will not call this `verified-fixed` until a real client session is walked. |
| 3 | Returning client (mobile) | `client/src/components/layout/MobileBottomNav.tsx` | **P1** | Mobile bottom nav for clients shows only `Dashboard` and `Profile`. Desktop shows The Plan / Updates / Design Board (and now Documents / Messages). On a phone, three of four primary client surfaces are unreachable from the bottom bar. Major parity bug for an app whose primary audience lives on mobile. | Mirror `ClientTabsNav` items, deep-linking each to the correct project tab. | **bundle-verified, click-not-verified** — live bundle contains the new client-mobile labels (`The Plan`, `Updates`, `Design`, `Messages`). Cannot confirm the bottom bar renders correctly on a real phone viewport without a logged-in client session. |
| 4 | Returning client | `ClientDashboardView` footer | **P1** | Footer hardcodes `Aster & Spruce Living · West Vancouver`. The company is in Muskoka. A Muskoka client would see the wrong city stamped at the bottom of their portal. | Use `project.city` (or `project.address`) when present; drop the static city otherwise. | **bundle-verified, click-not-verified** — live bundle has zero hits for the string `West Vancouver`. Footer now reads from `project.city` / `project.address`. Cannot eyeball the rendered footer without logging in as a client on a real project. |
| 5 | Crawler / SEO | `/robots.txt` | **P1** | `https://app.asl-portal.ca/robots.txt` returns the SPA HTML (because the catch-all sends `index.html`). Search engines are free to crawl and index the portal. | Ship a real `robots.txt` in `client/public/` that disallows everything (this is a private portal). | **verified-fixed** — `curl https://app.asl-portal.ca/robots.txt` now returns `Content-Type: text/plain` with `User-agent: *` / `Disallow: /` and the correct Aster & Spruce comment. Re-tested live on `5c0bcba` at 2026-04-29 19:35 EDT. |
| 6 | New client | `Welcome.tsx` "Skip for now" | **P2** | If a user with no firstName clicks "Skip for now", we POST `firstName: "Client", lastName: "User"`. That string is then visible to admins in the dashboard as an actual person's name. | Only show "Skip for now" if firstName/lastName were already populated by the invite. Otherwise force the user to enter their real name. | **bundle-verified, click-not-verified** — live bundle has the gate `e?.firstName&&e?.lastName&&t.jsx(...Skip for now...)`. Skip button now hidden when invite did not pre-populate a name. Cannot reach Welcome page in a logged-in state without an active invite token, so the rendered behaviour for a name-less user is not click-confirmed. |
| 7 | New client | Live HTTPS | n/a | `https://app.asl-portal.ca` returns 200 with a valid cert. The "not secure" issue from session `a78596f6` is resolved. | — | **verified-fixed** |
| 8 | New client | `/p/:token` (invalid token) | n/a | Returns a calm "This presentation link is no longer valid. Aster & Spruce" — appropriate, on-brand. | — | **verified-fixed** |
| 9 | New client | `/invite/:token` (invalid) | n/a | Renders "Invite Not Found · This invite link is invalid or has been removed. Please contact your project manager." — clear and on-brand. | — | **verified-fixed** |
| 10 | New client | Login page | n/a | Clean, minimal, on-brand, autoComplete attributes correct, returnTo param honoured. | — | **verified-fixed** |
| 11 | Designer | Design Board tab delete (`RoomTabStrip.tsx`) | n/a | Delete button + confirm dialog implemented and wired in `SpatialCanvas.tsx`. Code path looks correct. | — | **needs-live-verification** (Theresa specifically reported this broken in session `59d7ce19`; can't confirm without logging in and trying it on the live deploy) |
| 12 | Designer | Image upload to Design Board | n/a | GCS storage migration code (PR #9) is in. Env-var driven, supports `GCS_CREDENTIALS_JSON` for Railway. | — | **needs-live-verification** (Theresa reported "upload failed" in session `59d7ce19`; can't reproduce without a logged-in session) |
| 13 | Designer | Houzz / Pinterest drag-drop into board | n/a | `PinterestImportPopover.tsx` exists but I did not trace the full drag-from-external-page-into-canvas path. | Confirm whether direct drag from `houzz.com` / `pinterest.com` tabs into the board works, or whether it's still copy-paste / popover only. | **not-fixed** (logged for follow-up; was a specific Theresa request) |
| 14 | Returning client | `Dashboard.tsx` multi-project | **P2** | `clientProject = filteredProjects[0]`. If a client has more than one active project they only ever see the first one. The philosophy doc explicitly calls for a project-switcher in the multi-project case. | Implement the chip-style project selector at the top of ClientDashboardView when `clientProjects.length > 1`. | **not-fixed** (UX work, scoped for a follow-up PR) |
| 15 | New client | `Welcome.tsx` SMS toggle | **P2** | "SMS Notifications" toggle defaults on. If the user leaves the phone field blank, the toggle stays on but no SMS will ever fire. Silent contradiction. | If phone is empty, force SMS toggle off and disabled with a hint, or require phone when SMS is on. | **not-fixed** |
| 16 | Returning client | `ProjectDetails.tsx` client tabs | **P1** | When `userRole === "client"`, the in-project tab strip still shows: Overview, Progress, Documents, Messages, Decisions, Selections, Change Orders, Site Visits, Planning Board (9 tabs). The philosophy doc says clients should see The Plan, Updates, Design Board, Documents, Messages (5). Looks like a contractor CRM, not a portal. | Filter `tabConfig` further when role is `client` and not in admin-preview mode. | **not-fixed** (UX decision: which of Decisions / Selections / Change Orders / Site Visits should fold into "Updates" vs stay separate?) |
| 17 | Marketing/perf | Landing page hero | **P3** | `hero-cottage.png` is a 1.9 MB PNG; `craft-interior.png` is 1.5 MB; four template PNGs are ~1.3–1.5 MB each. On 4G mobile this is a slow LCP. | Convert hero + templates to optimised WebP; lazy-load below-the-fold templates; aim for < 300 KB hero. | **not-fixed** |
| 18 | API | `/api/health` | **P3** | Returns the SPA HTML (Express falls through to the catch-all). Railway health checks would always be "healthy" even if the API is dead — no real check. | Add a real `app.get("/api/health", ...)` that pings the DB and returns JSON. | **not-fixed** |

## P0 / P1 still open at end of session

The PR opened in this walkthrough fixes the *code* for items #1–#6, but none of those are `verified-fixed` until Railway redeploys and someone (Theresa, with login) re-walks the flow. Items #13 (drag-drop), #14 (multi-project), #16 (client tab strip), and #17 (perf) remain open and untouched.

## Fixes shipped this session

| # | PR | Files | Re-tested live? | Status |
|---|---|---|---|---|
| Walkthrough prompt | [#96](https://github.com/mcfadyentheresa-lab/asl-ai-assistant/pull/96) — **MERGED** | `docs/WALKTHROUGH_PROMPT.md` | n/a (it's a doc) | shipped |
| 1, 2, 3, 4, 5, 6 | [#97](https://github.com/mcfadyentheresa-lab/asl-ai-assistant/pull/97) — **MERGED** as `5c0bcba` | `server/email.ts`, `client/src/components/client/ClientTabsNav.tsx`, `client/src/components/layout/MobileBottomNav.tsx`, `client/src/components/dashboard/ClientDashboardView.tsx`, `client/public/robots.txt`, `client/src/pages/Welcome.tsx` | **Partial — see re-verify section below.** Railway redeployed; `robots.txt` is live and correct. The other five fixes are confirmed present in the served JS bundle but require a logged-in session to truly click through. | mixed: 1 verified-fixed, 5 bundle-verified-but-not-clicked |

## Re-verify pass on live deploy (post-merge)

Ran against `https://app.asl-portal.ca` on commit `5c0bcba`, 2026-04-29 19:35 EDT.

| Check | Method | Result |
|---|---|---|
| `/robots.txt` is now plain text + Disallow all | `curl -i https://app.asl-portal.ca/robots.txt` | ✅ `text/plain`, `User-agent: *` / `Disallow: /` (finding #5 → **verified-fixed**) |
| ClientTabsNav no longer points at `/updates` / `/design-board` | `grep` of live `index-*.js` bundle for `to:"/updates"` and `to:"/design-board"` | ✅ 0 hits for broken routes; 4 hits for `tab=board`, 1 hit for `tab=overview` (finding #2 → **bundle-verified**) |
| MobileBottomNav has client-mobile parity | `grep` of live bundle for `The Plan` / `Updates` / `Design` / `Messages` near the mobile-nav minified blob | ✅ all four labels present (finding #3 → **bundle-verified**) |
| Footer no longer hardcodes `West Vancouver` | `grep -c 'West Vancouver' index-*.js` | ✅ 0 hits in the live bundle (finding #4 → **bundle-verified**) |
| Welcome "Skip for now" gated on real name | regex search of bundle for `firstName&&[^,]{0,20}lastName` near `Skip for now` | ✅ gate `e?.firstName&&e?.lastName&&t.jsx(...Skip for now...)` is in the served JS (finding #6 → **bundle-verified**) |
| Invite email points at `app.asl-portal.ca` | None possible without sending a real invite | ⚠️ cannot self-verify. Code is correct on `main` and `APP_URL` is set on Railway, but until a real invite is sent and the rendered link is inspected, this stays **code-changed-not-verified** (finding #1) |
| Public landing / login / invalid-invite still render | `curl -o /dev/null -w '%{http_code}'` against `/`, `/login`, `/invite/bad-token` | ✅ all 200, no regressions |
| `/api/health` is now a real check | `curl https://app.asl-portal.ca/api/health` | ❌ still returns SPA HTML (finding #18 → still **not-fixed**, was out-of-scope for PR #97) |

### Honest gap

**Five of the six "shipped" fixes are bundle-verified, not click-verified.** That means I have proven the new code is on the live deploy and the broken old strings are gone, but I have not actually logged in as a client on `app.asl-portal.ca`, clicked the new tabs, watched the mobile bottom bar render on a phone, or opened a real invite email. Per the walkthrough prompt's seven rules, I will not promote those to `verified-fixed` until a real session is walked.

To close the loop, the next walkthrough needs either:
- a real test client account (email + password) to log into `app.asl-portal.ca`, or
- credentials for an admin account that can send a throwaway invite to a Mailinator address so the invite-link fix (#1) can be confirmed.

I will not assert these are fully fixed without that step.

## Notes for next walkthrough

- Get a real client test account so I can actually log in and walk passes 1–4 properly. Code-level findings catch about half of what a real session would surface.
- Once #1 is deployed, send a real invite to a throwaway address and confirm the link lands correctly on `app.asl-portal.ca/invite/<token>` and not on `asterandspruce.com`.
- Pull the live admin dashboard to see if there are any users named "Client User" — those are casualties of the old `Welcome.tsx` skip-button bug and may need to be cleaned up manually in the DB.
- Decide the IA for in-project client tabs (#16). The philosophy doc is opinionated; the implementation is not. Until those are reconciled the client view will keep feeling like a CRM.
- Run a Lighthouse mobile audit against `/` to quantify #17 before guessing at fixes.

---

## Appendix — Routes tested live (unauthenticated)

| Route | HTTP | Notes |
|---|---|---|
| `/` | 200 | Landing page, hero PNG is 1.9 MB |
| `/login` | 200 | Clean, on-brand |
| `/forgot-password` | 200 | Clean |
| `/welcome` | 200 | Renders briefly then loaders out (it's a logged-in-only page; behaviour is OK for unauth) |
| `/accept-invite/<bad>` | 200 | Loader stuck — calls `/api/auth/invite/<bad>` which returns 404 with the expected JSON shape; UI never resolved into the "invite unavailable" state in my screenshot. _Worth a follow-up: the 404 response body says `valid:false` but the page shows a spinner. Likely a small race in `AcceptInvite.tsx`'s `useEffect` — not investigated this session._ |
| `/invite/<bad>` | 200 | Renders "Invite Not Found" cleanly |
| `/reset-password/<bad>` | 200 | Renders the "Set a new password" form even for an invalid token. Submitting it then returns a server error. UX would be better if validation happened up front and an invalid token surfaced before the form. **P2, not fixed.** |
| `/p/<bad>` | 200 | Renders "This presentation link is no longer valid." |
| `/random-404-route` | 200 | Falls through to LandingPage (catch-all behaviour for unauth users — fine). |
| `/api/auth/user` | 401 | Correct |
| `/api/health` | 200 (SPA HTML) | Bug — see finding #18 |
| `/robots.txt` | 200 (SPA HTML) | Bug — fixed in this PR (finding #5) |
| `/favicon.svg` | 200 | OK |
