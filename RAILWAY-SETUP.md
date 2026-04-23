# Deploying Aster & Spruce Connect to Railway

Follow these steps exactly. You do not need to know any code.

## What you're about to do

This app was originally built on Replit, and it used Replit's built-in login service. That service does not exist on Railway. To get the app running quickly, we're going to **bypass the login step**.

⚠️ **IMPORTANT:** With login bypassed, ANYONE who opens the Railway URL gets full admin access to your app. **Do not share the URL with clients or anyone else** until a proper login system is added. For now, treat it as a personal tool only.

A follow-up PR can replace Replit Auth with real email/password login (e.g., Google sign-in or a simple username/password) when you're ready to share it.

## Step 1 — Add a Postgres database

1. Open your Railway project.
2. Click **+ New** → **Database** → **Add PostgreSQL**.
3. Wait ~30 seconds until it's green.

## Step 2 — Connect this GitHub repo

If you haven't already:

1. Click **+ New** → **GitHub Repo** → pick `asl-ai-assistant`.
2. Railway will start a build. **Expect the first build to fail** — that's fine, we haven't set the variables yet.

## Step 3 — Set environment variables

1. Click on the Aster & Spruce service (not the Postgres one).
2. Go to the **Variables** tab.
3. Click **+ New Variable** and add each of these:

| Name | Value |
|---|---|
| `DATABASE_URL` | Click **Add Reference** → select Postgres → `DATABASE_URL` |
| `SESSION_SECRET` | Any long random string (32+ chars). Generate one at [1password.com/password-generator](https://1password.com/password-generator) (turn on "Advanced", length 64, letters+digits) |
| `NODE_ENV` | `production` |
| `OPENID_DISABLED` | `true` |

### Optional (add later when you want these features)

| Name | For what |
|---|---|
| `OPENAI_API_KEY` | AI Scope Analyzer in Cost Estimator |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS notifications & client invites |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email notifications |
| `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS` | Photo/document uploads |

> ⚠️ **Do NOT** set `PORT` — Railway provides it automatically.

## Step 4 — Redeploy

1. Click **Deployments** tab → **Deploy** (or push any new commit).
2. Wait for the build (~3-4 minutes — this app has a lot of dependencies).
3. Open the generated URL.

## Step 5 — What you should see

Because login is bypassed, you'll land directly in the app as an admin user. You can browse projects, check the Crew & Trade page, etc.

If you instead see a login page, click any "log in" button — the app will let you through immediately (no credentials needed while `OPENID_DISABLED=true`).

## Troubleshooting

**"FATAL: Missing required environment variables: DATABASE_URL"** in logs
→ You forgot to set `DATABASE_URL` in Step 3, or didn't reference the Postgres plugin correctly.

**"FATAL: Missing required environment variables: SESSION_SECRET"**
→ Generate a long random string and set `SESSION_SECRET`.

**"503 Authentication is not configured"** when clicking log in
→ Make sure `OPENID_DISABLED=true` is set (exactly that — lowercase `true`).

**White page in the browser**
→ Open DevTools (F12) → Console tab. Usually means the server is down. Check Railway logs.

**"relation \"sessions\" does not exist"** in logs
→ Database tables weren't created. The build command includes `npm run db:push`; confirm it ran successfully in the build logs.

## Next steps (when you're ready)

To make this safe for real users, you'll need to replace the bypassed login with proper authentication. Options:

1. **Simple:** Add `passport-local` with email/password (the npm package is already in this project). About 1-2 hours of work.
2. **Polished:** Add Google sign-in via `passport-google-oauth20`. About 2-3 hours.
3. **Client invites via SMS:** The Twilio invite flow already exists in the code — it just needs to be wired to a real password-setting page instead of the old Replit flow.

Open a new issue in this repo when you want to tackle that and I can help.
