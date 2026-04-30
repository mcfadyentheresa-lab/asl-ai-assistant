# Walkthrough — 2026-04-29

**Commit tested at start:** `01b71328` (origin/main, latest at start of session)
**Commit tested at first re-verify (bundle-grep only):** `5c0bcba` (after PR #96 + #97 merged)
**Commit tested at click-through verify:** `5661a17` (after PR #99 merged) — bundle `index-DUPSVpF-.js`
**Live URL:** https://app.asl-portal.ca
**Personas walked:** New client / Returning client / Designer / Admin
**Test credentials used:** `info@asterandspruceliving.ca` (admin) — provided mid-session, enabling the click-through pass that caught a real bug bundle-verify had missed.

## Honest scope caveat

This walkthrough went through three phases:
1. **Code-level + unauthenticated route audit** (no login). Found 8 unambiguous bugs.
2. **Bundle-grep verification** after PR #96 + #97 merged. Confirmed new code was on the live deploy and old broken strings were gone.
3. **Click-through verification** after admin creds were provided. **Caught a real P0 bug that bundle-grep missed** (ClientTabsNav was navigating to the wrong project), shipped PR #99 to fix it, then re-verified the fix click-through.

Phases 1 + 2 alone would have rubber-stamped a broken nav as fixed. The click-through is what actually proved the fix.

## Verdict

**Closer to ship-ready than at session start, but I would still not ship to a paying high-end client today.** Four of the original P0/P1 client-facing bugs are now click-verified fixed. But three new follow-up findings surfaced during the click-through, and the original "invite email URL" fix is **still unverified** because invite emails are not arriving in the test inbox at all (likely a separate email-delivery problem).

The portal philosophy doc sets a Studio McGee / private-bank bar. The fixes shipped today close the most basic gaps (dead nav links, wrong city, broken invite URL config). What's still open is the in-project client tab strip showing 9 contractor-CRM tabs (#16), email delivery reliability (#22), and the half-rendered admin client preview (#19).

## Findings

| # | Persona | Screen / Route | Severity | What I saw | What should happen | Status |
|---|---|---|---|---|---|---|
| 1 | New client | Email invite link (`server/email.ts`) | **P0** | `APP_URL` falls back to `https://asterandspruce.com` when neither `REPLIT_DEPLOYMENT_URL` nor `REPLIT_DEV_DOMAIN` is set. On Railway, neither is set. Every `sendClientInviteEmail` call has been emitting `https://asterandspruce.com/invite/<token>` — the marketing site, which 404s. | Read `APP_URL` env first (matches `replitAuth.ts` and `sms.ts`), fall back to `https://app.asl-portal.ca`. | **code-changed-not-verified** — code merged on `5661a17`, `APP_URL=https://app.asl-portal.ca` set on Railway. Two test invites sent during the click-through; neither arrived in Mailinator (see #22). The URL-domain code is correct but the rendered email itself was never inspected because no email arrived. |
| 2 | Returning client | Top nav (`ClientTabsNav.tsx`) | **P0** | Tabs link to `/updates` and `/design-board`. Neither route is defined in `App.tsx`. Clicking either drops the client on the NotFound page. | Resolve each tab to a real destination — for "Updates" → `/project/:id?tab=overview`, for "Design Board" → `/project/:id?tab=board`. Add Documents and Messages too so the nav matches the philosophy doc. | **verified-fixed** (after PR #99). Click-tested live on `5661a17`: from `/project/5` (The Valley) in Client Preview, all 5 tabs (The Plan, Updates, Design Board, Documents, Messages) navigate to `/project/5?tab=...`. _PR #97 alone had a project-context bug (linked everything to `/project/6`); PR #99 fixed it by reading project id from the URL._ |
| 3 | Returning client (mobile) | `MobileBottomNav.tsx` | **P1** | Mobile bottom nav for clients shows only `Dashboard` and `Profile`. Three of four primary client surfaces are unreachable from a phone. | Mirror `ClientTabsNav` items, deep-linking each to the correct project tab. | **bundle-verified** — same project-context fix from PR #99 applies here. Mobile viewport click-test was blocked (cloud browser couldn't toggle dev-tools mobile mode). Desktop click-test of the same code path passed, so the URL resolution logic is proven; rendering of the mobile bar itself is unconfirmed. |
| 4 | Returning client | `ClientDashboardView` footer | **P1** | Footer hardcodes `Aster & Spruce Living · West Vancouver`. The company is in Muskoka. | Use `project.city` (or `project.address`) when present. | **verified-fixed** — footer on The Valley project reads "Designed by Aster & Spruce Living • Muskoka, Ontario". |
| 5 | Crawler / SEO | `/robots.txt` | **P1** | Returns the SPA HTML — search engines could index the portal. | Ship a real Disallow-all `robots.txt`. | **verified-fixed** — `curl https://app.asl-portal.ca/robots.txt` returns `text/plain` with `User-agent: *` / `Disallow: /`. |
| 6 | New client | `Welcome.tsx` "Skip for now" | **P2** | If a user with no firstName clicks "Skip for now", we POST `firstName: "Client", lastName: "User"`. That string is then visible to admins as a phantom name. | Only show "Skip for now" if firstName/lastName were already populated by the invite. | **verified-fixed** — logged into `/welcome` as Theresa (firstName="Theresa", lastName=""). Skip button correctly hidden; only "Go to My Project" CTA visible. |
| 7 | New client | Live HTTPS | n/a | Returns 200 with valid cert. | — | **verified-fixed** |
| 8 | New client | `/p/:token` (invalid token) | n/a | Returns "This presentation link is no longer valid." | — | **verified-fixed** |
| 9 | New client | `/invite/:token` (invalid) | n/a | Renders "Invite Not Found · This invite link is invalid or has been removed." | — | **verified-fixed** |
| 10 | New client | Login page | n/a | Clean, minimal, on-brand. | — | **verified-fixed** |
| 11 | Designer | Design Board tab delete | n/a | Code path looks correct. | — | **needs-live-verification** (Theresa reported broken in session `59d7ce19`) |
| 12 | Designer | Image upload to Design Board | n/a | GCS migration is in. | — | **needs-live-verification** (Theresa reported "upload failed") |
| 13 | Designer | Houzz / Pinterest drag-drop into board | n/a | Pinterest popover exists; full external-tab drag not traced. | Confirm direct drag from `houzz.com`/`pinterest.com` works. | **not-fixed** |
| 14 | Returning client | Multi-project switcher | **P2** | `clientProject = filteredProjects[0]`. Multi-project clients only see the first one. | Implement chip-style project selector. | **not-fixed** |
| 15 | New client | `Welcome.tsx` SMS toggle | **P2** | "SMS Notifications" defaults on but no phone validation. | _Now moot_ — entire SMS UI hidden in PR #99 per product decision. | **resolved-by-hide** — toggle removed from Welcome. |
| 16 | Returning client | `ProjectDetails.tsx` client tabs | **P1** | Client view still shows 9 contractor-CRM tabs vs philosophy doc's 5. Looks like a CRM, not a portal. | Filter `tabConfig` further when role is `client`. | **not-fixed** (UX decision needed) |
| 17 | Marketing/perf | Landing page hero | **P3** | Hero PNG 1.9 MB. | Convert to WebP, lazy-load. | **not-fixed** |
| 18 | API | `/api/health` | **P3** | Returns SPA HTML — Railway health check is fake. | Real DB-pinging endpoint. | **not-fixed** |
| 19 | Admin | "View as Client" preview body | **P2** | Top tab nav switches to client view, but main page body still renders the admin "Progress / Project Timeline" — admin sees a Frankenstein view, not what the client actually sees. | Render the matching client pane in the main body when in preview mode, OR rename the affordance so the limitation is honest. | **not-fixed** (uncovered during click-through) |
| 20 | Any | `/dashboard` direct navigation | **P3** | Renders developer-flavoured "404 Page Not Found · Did you forget to add the page to the router?" — internal copy that should never be user-facing. | Either redirect `/dashboard` → `/`, or use the on-brand 404 already used elsewhere. | **not-fixed** (uncovered during click-through) |
| 21 | Admin | Two different "client preview" affordances | **P3** | Top-bar admin toggle says "CLIENT VIEW PREVIEW — THIS IS WHAT YOUR CLIENT SEES." In-project menu says "Previewing as Client · Exit". Same concept, two UIs, two wordings. | Pick one. | **not-fixed** (uncovered during click-through) |
| 22 | Admin → New client | Invite email delivery | **P1** | Sent two invites via the UI to public Mailinator inboxes during this session. Neither arrived (waited 30+s each). Code-side `sendClientInviteEmail` is hooked up; the failure is upstream of URL formatting. | Send a real test invite to a Gmail. Check Resend/SES logs and sender domain reputation. | **not-fixed** (uncovered during click-through; blocks onboarding for real clients) |

## P0 / P1 still open at end of session

- **#1 invite email URL** — code-changed but unverified because no test email is arriving (#22 is the new blocker).
- **#16 in-project client tab strip** — UX decision needed: which of Decisions / Selections / Change Orders / Site Visits should fold into "Updates" vs stay separate.
- **#22 invite email delivery** — newly uncovered; portal can't onboard a client if invites don't arrive.

## Fixes shipped this session

| PR | Files | Status |
|---|---|---|
| [#96](https://github.com/mcfadyentheresa-lab/assistant/pull/96) — **MERGED** | `docs/WALKTHROUGH_PROMPT.md` | reusable self-prompt with seven non-negotiable honesty rules |
| [#97](https://github.com/mcfadyentheresa-lab/asl-ai-assistant/pull/97) — **MERGED** as `5c0bcba` | `server/email.ts`, `client/src/components/client/ClientTabsNav.tsx`, `client/src/components/layout/MobileBottomNav.tsx`, `client/src/components/dashboard/ClientDashboardView.tsx`, `client/public/robots.txt`, `client/src/pages/Welcome.tsx` | initial fixes for #1–#6. Bundle-verified; one fix had a project-context bug that #99 fixed. |
| [#99](https://github.com/mcfadyentheresa-lab/asl-ai-assistant/pull/99) — **MERGED** as `5661a17` | `client/src/components/client/ClientTabsNav.tsx`, `client/src/components/layout/MobileBottomNav.tsx`, `server/routes.ts`, `client/src/pages/Welcome.tsx`, `client/src/pages/Profile.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/components/SpatialCanvas.tsx` | follow-up: project-context fix on both navs, invite phone genuinely optional, all SMS UI hidden across the app (server SMS plumbing intentionally left in place for future re-enable) |

## Re-verify pass: bundle grep on `5c0bcba` (after PR #97)

| Check | Result |
|---|---|
| `/robots.txt` plain text | ✅ verified-fixed |
| ClientTabsNav no longer points at `/updates` / `/design-board` | ✅ bundle had `tab=board`/`tab=overview`, zero hits for old broken routes |
| MobileBottomNav has client-mobile labels | ✅ all four labels in bundle |
| Footer no longer hardcodes "West Vancouver" | ✅ 0 hits |
| Welcome Skip-for-now gated on real name | ✅ `e?.firstName&&e?.lastName&&...` gate confirmed |
| `/api/health` is a real check | ❌ still SPA HTML (out of scope) |

**Looked clean. Was actually still broken** — bundle-grep can't see that the project id being interpolated is wrong.

## Click-through verify pass on `5661a17` (after PR #99)

Logged in as `info@asterandspruceliving.ca`, walked the actual flows.

| Check | Method | Result |
|---|---|---|
| Tab nav stays on project 5 | `/project/5` Client Preview, clicked all 5 tabs | ✅ PASS — every tab kept project id 5 |
| The Plan deep-links to current project | reload `/project/5` | ✅ PASS — "The Plan" active, URL stable |
| Footer city correct | The Valley project | ✅ PASS — "Muskoka, Ontario" |
| Welcome SMS toggle hidden | `/welcome` | ✅ PASS — toggle and "Notification Preferences" heading both gone |
| Welcome Skip-for-now gated | `/welcome` as Theresa (lastName empty) | ✅ PASS — Skip button hidden |
| Profile SMS copy hidden | `/profile` | ✅ PASS — phone helper rewritten |
| Dashboard "via SMS" copy hidden | New Project dialog | ✅ PASS — "by email" everywhere |
| Invite without phone succeeds | submitted blank phone | ✅ PASS — invite created, no 400 |
| SpatialCanvas "Notify" chip | data path not reachable in seed projects | ⚠️ CANT-TEST (bundle confirms `SMS alert` removed, `Notify` shipped) |
| Invite email lands at correct domain | sent invite to Mailinator | ⚠️ CANT-TEST — **email never arrived** (see #22) |

## What this walkthrough proved about the prompt itself

The reusable walkthrough self-prompt (PR #96) was worth shipping. Specifically:

- Rule #1 (evidence-or-it-didn't-happen) caught the #2 ClientTabsNav project-context bug that bundle-verify had marked as good. Without the click-through requirement, PR #97 would have shipped as "fixed" while clients on multiple projects were still broken.
- Rule #5 (honest three-state status) made the difference between bundle-verified and click-verified explicit and forced the second pass.
- Rule #7 (stay in user persona) is what surfaced findings #19, #20, #21 — bugs you only see when you actually try to use the product.

## Notes for next walkthrough

- **#22 is the most urgent.** A portal whose invites don't arrive doesn't onboard. Send one to a real Gmail before any more cosmetic work.
- **#16 needs your IA call** — which of Decisions / Selections / Change Orders / Site Visits should fold into "Updates" or "Documents" vs stay as their own tab? Until that's decided the client view stays CRM-flavoured.
- **#19 needs a UX call** — should "View as Client" actually render the client body, or should it be renamed "Show client nav" to be honest about the limitation?
- **#11 + #12** still need a real designer-level click-through (delete a tab, upload an image to a board). Theresa flagged both broken in session `59d7ce19`; haven't been re-verified.
- **#14 multi-project switcher** is real product work, scoped for a separate PR.

---

## Appendix — Routes tested live (unauthenticated)

| Route | HTTP | Notes |
|---|---|---|
| `/` | 200 | Landing page, hero PNG is 1.9 MB |
| `/login` | 200 | Clean, on-brand |
| `/forgot-password` | 200 | Clean |
| `/welcome` | 200 | Renders briefly then loaders out (logged-in-only page; behaviour OK for unauth) |
| `/accept-invite/<bad>` | 200 | Loader stuck — calls `/api/auth/invite/<bad>` which returns 404 with the expected JSON shape; UI never resolved into "invite unavailable". Worth a follow-up. |
| `/invite/<bad>` | 200 | Renders "Invite Not Found" cleanly |
| `/reset-password/<bad>` | 200 | Renders the form even for an invalid token. Submitting then returns a server error. UX would be better if validation happened up front. **P2, not fixed.** |
| `/p/<bad>` | 200 | Renders "This presentation link is no longer valid." |
| `/random-404-route` | 200 | Falls through to LandingPage (catch-all behaviour for unauth users — fine). |
| `/dashboard` (auth) | 200 | Renders developer 404 — see finding #20 |
| `/api/auth/user` | 401 | Correct |
| `/api/health` | 200 (SPA HTML) | Bug — finding #18 |
| `/robots.txt` | 200 (text/plain) | Fixed — finding #5 |
