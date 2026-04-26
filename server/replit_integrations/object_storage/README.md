# Object storage

This module wraps Google Cloud Storage. The folder name is a historical
artifact from when it ran on the Replit sidecar — there is no Replit
runtime dependency anymore.

## Required env vars

| Var | Purpose |
|---|---|
| `GCS_PROJECT_ID` | Your GCP project id |
| `GCS_CREDENTIALS_JSON` *or* `GCS_KEY_FILE` | Service-account credentials. JSON form is convenient on Railway; key-file form is convenient locally. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated `/<bucket>/<prefix>` list searched by `searchPublicObject`. |
| `PRIVATE_OBJECT_DIR` | `/<bucket>/<prefix>` where new uploads go. |

## Service account permissions

The service account needs **Storage Object Admin** on the bucket(s) you point
`PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR` at.

## Migrating data from a Replit Object Storage bucket

```
# from your laptop, signed in to gcloud as the service-account or yourself
gsutil -m rsync -r gs://OLD_BUCKET gs://NEW_BUCKET
```

Then update the two env vars on Railway to point at `NEW_BUCKET` and redeploy.

## Signed URLs

The module uses native v4 signed URLs from `@google-cloud/storage`. No sidecar
process is required.
