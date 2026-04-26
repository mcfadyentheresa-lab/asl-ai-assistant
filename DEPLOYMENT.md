# Deployment guide — cutting over from Replit to your own infra

This is the playbook for replacing your Replit subscription with self-hosted
infrastructure. End state: app on Railway (or any Node host), Postgres on a
managed DB, files in your own GCS bucket, login by email + password.

---

## TL;DR

1. **Merge** the four PRs (auth, storage, drive, tooling).
2. **Provision** Postgres + GCS bucket + Google OAuth client.
3. **Set env vars** on Railway from `.env.example`.
4. **Run** `npm run db:push` to apply the schema.
5. **Run** `npm run bootstrap:admin` to create your admin user.
6. **Run** `npm run migrate:storage -- --from gs://OLD --to gs://NEW --execute`.
7. **Update** `PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR` to the new bucket and redeploy.
8. **Cancel** Replit.

---

## 1. Provision infrastructure

### Postgres

Pick one:
- **Railway Postgres** — easiest, same dashboard as the app
- **Neon** — generous free tier, branching for previews
- **Supabase** — free tier, includes file storage if you want to skip GCS later

Copy the connection string into `DATABASE_URL`.

### Google Cloud Storage bucket

```bash
# Replace PROJECT_ID and BUCKET_NAME
gcloud config set project PROJECT_ID
gsutil mb -l us-central1 gs://BUCKET_NAME

# Create a service account
gcloud iam service-accounts create asl-storage \
  --display-name="Aster & Spruce storage"

# Grant Storage Object Admin on just this bucket
gsutil iam ch \
  serviceAccount:asl-storage@PROJECT_ID.iam.gserviceaccount.com:objectAdmin \
  gs://BUCKET_NAME

# Download a key
gcloud iam service-accounts keys create asl-storage-key.json \
  --iam-account=asl-storage@PROJECT_ID.iam.gserviceaccount.com
```

The contents of `asl-storage-key.json` go into `GCS_CREDENTIALS_JSON`.
Set `GCS_PROJECT_ID` to your project id.

### Google OAuth client (only if you want Drive export)

In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

1. Enable the **Google Drive API** for your project.
2. Create an **OAuth 2.0 Client ID** (Desktop app is simplest).
3. Configure the OAuth consent screen — add yourself as a test user, scope
   `https://www.googleapis.com/auth/drive.file`.
4. Get a refresh token. Easiest: run [Google's OAuth Playground](https://developers.google.com/oauthplayground/),
   paste your client id/secret in the gear icon, authorize the `drive.file`
   scope, exchange the auth code for a refresh token. Copy the refresh token.

Drop `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`GOOGLE_OAUTH_REFRESH_TOKEN` into your env.

---

## 2. Configure Railway (or your host of choice)

Set every variable from `.env.example` that applies. At minimum:

| Var | Source |
|---|---|
| `DATABASE_URL` | Postgres provider |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `APP_URL` | Your public URL (e.g. `https://app.asterandspruce.com`) |
| `NODE_ENV` | `production` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Your Gmail + App Password |
| `GCS_PROJECT_ID` | GCP project |
| `GCS_CREDENTIALS_JSON` | Service-account JSON, pasted as a single value |
| `PRIVATE_OBJECT_DIR` | `/your-bucket/private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | `/your-bucket/public` |
| `OPENAI_API_KEY` | OpenAI dashboard (if using AI features) |
| `GOOGLE_OAUTH_*` | Optional, for Drive export |

**Remove these old Replit vars if present:**
- `OPENID_CLIENT_ID`
- `OPENID_ISSUER_URL`
- `OPENID_DISABLED`
- `REPLIT_DEPLOYMENT_URL`
- `REPLIT_DEV_DOMAIN`

---

## 3. Apply the schema

From your laptop with the production `DATABASE_URL` exported:

```bash
npm install
npm run db:push
```

This adds `password_hash`, `mfa_secret`, `mfa_enabled`, `last_login_at` to
`users`, and creates the new `auth_tokens` table.

---

## 4. Create your first admin

Interactive (recommended):

```bash
npm run bootstrap:admin
```

You'll be prompted for email, name, and a password. The password is hashed
with bcrypt (12 rounds) before being stored. **Do not** put your real
password in shell history.

Non-interactive (CI):

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD='temporaryPassword123' \
ADMIN_FIRST_NAME=Your \
ADMIN_LAST_NAME=Name \
npm run bootstrap:admin
```

The script is idempotent — re-running it on an existing email updates the
password and ensures the user is `role='admin'` and not archived.

---

## 5. Migrate file data

If the old Replit bucket has data you want to keep:

```bash
# Dry run first — prints the command, makes no changes
npm run migrate:storage -- --from gs://OLD_REPLIT_BUCKET --to gs://YOUR_NEW_BUCKET

# Execute when you're ready
npm run migrate:storage -- --from gs://OLD_REPLIT_BUCKET --to gs://YOUR_NEW_BUCKET --execute
```

The script:
- Verifies your new credentials work
- Checks `gsutil` is installed
- Runs `gsutil -m rsync -r` (parallel, recursive)
- Reads back a sample from the destination to confirm permissions

Run it from a machine that's authenticated to *both* buckets — likely your
laptop, with `gcloud auth login` for the source and the new service-account
key for the destination.

After it finishes, update `PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR`
on Railway to point at the new bucket and redeploy.

---

## 6. Smoke test the production deployment

After Railway is live with the new env:

1. Hit `/login` — the page should render.
2. Log in with the admin account from step 4.
3. From the admin UI, invite yourself a fake "crew" account at a different
   email. Open the email, accept, set a password, get auto-logged-in.
4. Create a project and invite a "client" via the existing client-invite UI.
5. Upload a project photo. It should land in `PRIVATE_OBJECT_DIR` of the new
   bucket.
6. (Optional) Export a social post to Drive — the feature will return 503
   with a clear message if the OAuth env isn't set, otherwise it should
   create a folder named "Aster & Spruce Social".

Anything failing at step 5 means GCS credentials are wrong. Anything failing
at step 1–3 means session/cookie config — check `APP_URL` and that
`NODE_ENV=production` so the cookie is `secure: true` only over HTTPS.

---

## 7. Cancel Replit

Once smoke tests pass:

1. Replit Dashboard → check there are no autoscale deployments still serving
   `*.replit.app` traffic.
2. Replit Object Storage → confirm the bucket is empty or doesn't matter
   (you've already rsynced what you need).
3. Replit Secrets → screenshot for posterity, then forget about it.
4. Cancel the subscription.

---

## Rollback plan

If something goes wrong on Railway, the Replit deployment is still there.
Point your domain DNS back at the Replit URL. The old auth stub will still
work for as long as you keep the Replit subscription active.

The schema changes from PR #1 are **additive only** (new columns, new table)
— they don't break the old Replit deployment. Old data continues to work
both places until you cancel.

---

## Future enhancements (post-cutover)

- **TOTP MFA** — the `mfa_enabled` and `mfa_secret` columns are scaffolded.
  Drop in `speakeasy` to verify codes.
- **Audit log** — `last_login_at` is wired. Consider adding a
  `user_login_events` table.
- **Self-service signup** — currently invite-only. If you want a public
  `/signup` page, add it as a route and have it call the same accept-invite
  logic.
- **SSO for white-label customers** — if a paying customer asks for SSO,
  swap the local strategy for a SAML strategy on a per-tenant basis.
