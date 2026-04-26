# Deploying Aster & Spruce Connect to Railway

Follow these steps in order. You don't need to know any code.

## What you're about to do

Move the app off Replit and onto Railway, where it can live on a real domain (`app.asl-portal.ca`) and accept real client logins. Auth uses email + password (passport-local) — no Replit Auth, no third-party login provider needed.

You'll do five things:

1. Create a Railway project + Postgres database
2. Connect this GitHub repo
3. Paste a few environment variables
4. Deploy
5. Create your first admin login

Total time: ~15 minutes.

---

## Step 1 — Create the Railway project + Postgres

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Empty Project** (give it a name like `asl-connect`)
3. Inside the project: **+ New** → **Database** → **Add PostgreSQL**
4. Wait until the Postgres tile is green (~30 seconds)

---

## Step 2 — Connect the GitHub repo

1. Inside the same project: **+ New** → **GitHub Repo**
2. Pick **`mcfadyentheresa-lab/asl-ai-assistant`**
3. **Branch:** leave on `main`
4. Railway will start a build immediately. **Expect this first build to fail** — env vars aren't set yet. Ignore the failure.

---

## Step 3 — Set environment variables

1. Click on the Aster & Spruce service (not the Postgres one)
2. Go to the **Variables** tab
3. Add each of these. **The four required ones** must be set; the optional ones can wait.

### Required

| Name | Value |
|---|---|
| `DATABASE_URL` | Click **Add Reference** → select Postgres → `DATABASE_URL` |
| `SESSION_SECRET` | A long random string (64+ chars). [I'll give you one below.](#session-secret) |
| `NODE_ENV` | `production` |
| `APP_URL` | Your eventual public URL — for now, the Railway-generated URL. Update later when DNS is pointed. |

### Recommended (set during this same step if you can)

| Name | Value | What it enables |
|---|---|---|
| `GMAIL_USER` | `info@asterandspruceliving.ca` | Sending invite + password-reset emails |
| `GMAIL_APP_PASSWORD` | A Gmail app password ([create here](https://myaccount.google.com/apppasswords)) | Same |

### Optional (add later, when needed)

| Name | For what |
|---|---|
| `OPENAI_API_KEY` | AI Scope Analyzer in Cost Estimator |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS notifications & client invites |
| `GCS_PROJECT_ID`, `GCS_CREDENTIALS_JSON`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | Photo & document uploads to Google Cloud Storage |

> ⚠️ **Do NOT** set `PORT` — Railway provides it automatically.
> ⚠️ **Do NOT** set `AUTH_DEV_BYPASS` in production — it's only honored when `NODE_ENV != production`.

### Session secret

If you need a generated value, use this one (or generate your own with `openssl rand -base64 48`):

```
<paste the value the agent gave you here, or click "Generate" in Railway>
```

---

## Step 4 — Redeploy

1. **Deployments** tab → **Deploy** (or push any commit to `main`)
2. Wait for the build (~3–4 minutes — this app has lots of dependencies)
3. The build runs three things in order:
   - `npm ci` — install
   - `npm run build` — bundle the client + server
   - `npm run db:push` — create / update the database tables
4. When it shows **Active** with a green dot, click the generated URL

---

## Step 5 — Create your admin login

The app is now live but has zero users. Create the first admin:

### Option A — Use the Railway shell (easiest)

1. In your service, click the **Settings** tab → scroll to **Service** → click the terminal icon to open a shell
2. Paste:
   ```bash
   ADMIN_EMAIL='info@asterandspruceliving.ca' \
   ADMIN_PASSWORD='your-strong-password-here' \
   ADMIN_FIRST_NAME='Theresa' \
   ADMIN_LAST_NAME='McFadyen' \
   npm run bootstrap:admin
   ```
3. You should see `Admin user created with id: <uuid>`

### Option B — Set ADMIN_* env vars and redeploy

1. Add `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` to the service variables
2. Open a Railway shell and run `npm run bootstrap:admin`
3. **Remove the four `ADMIN_*` vars** from Railway after the user is created (they're no longer needed and shouldn't sit in the env)

---

## Step 6 — Log in

1. Open the Railway URL
2. Go to `/login`
3. Use the email + password you just bootstrapped
4. You should land on the admin dashboard

---

## Step 7 — Point your domain (later)

When you're ready to use `app.asl-portal.ca`:

1. In the Railway service, go to **Settings** → **Networking** → **+ Custom Domain**
2. Add `app.asl-portal.ca` — Railway will show you a CNAME record
3. In your domain registrar's DNS settings, add the CNAME record exactly as shown
4. Wait ~10–60 min for DNS to propagate
5. Update the `APP_URL` env var to `https://app.asl-portal.ca` and redeploy

---

## Troubleshooting

**`FATAL: Missing required environment variables: DATABASE_URL`** in logs
→ You forgot to set `DATABASE_URL` in Step 3, or didn't reference the Postgres plugin correctly. It must be `Add Reference` → Postgres → `DATABASE_URL`, not a typed-in value.

**`FATAL: Missing required environment variables: SESSION_SECRET`**
→ Generate a long random string (32+ chars) and set `SESSION_SECRET`.

**`{"message":"Authentication is not configured"}` when clicking log in**
→ This means you're hitting an endpoint that expects the old Replit OpenID flow. The current code uses passport-local (email/password). You should NOT see this on Railway after a clean deploy. If you do:
  1. Clear browser cache / cookies for the site
  2. Confirm you're hitting the Railway URL, not a Replit URL
  3. Check Railway logs for the actual server error

**White page in the browser**
→ Open DevTools (F12) → Console. Usually means the server crashed on boot. Check Railway logs.

**`relation "sessions" does not exist`** in logs
→ The `db:push` step didn't run. In the build log, search for `db:push` — if missing, redeploy and watch for it.

**Login page shows "Invalid email or password" when you know they're right**
→ The user wasn't created. Re-run `npm run bootstrap:admin` (Step 5).

**Build fails with TypeScript or module errors**
→ Check the build log. Most often a Node version issue. The project uses Node 20+.

---

## What's different from Replit

| Replit | Railway |
|---|---|
| Replit Auth (OpenID) | passport-local (email/password) |
| Auto-restart on file change | Redeploy on git push to `main` |
| Replit-managed Postgres | Railway-managed Postgres |
| `*.replit.app` URL | Custom domain (`app.asl-portal.ca`) |
| `OPENID_DISABLED=true` workaround | Not needed — proper auth in place |

The codebase was migrated from Replit Auth to passport-local during the SMS tenant-gate work. The legacy `/api/login` GET endpoint redirects to the SPA login page; the actual login form posts to `/api/auth/login`.
