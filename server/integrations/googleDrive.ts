// Direct Google Drive client using googleapis + OAuth refresh token.
//
// Required env vars:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
// Optional:
//   GOOGLE_OAUTH_REDIRECT_URI  (defaults to "http://localhost" — only used at
//                               token-mint time, doesn't matter for refresh
//                               flows)
//
// One-time setup:
//   1. In Google Cloud Console, create an OAuth 2.0 Client ID (Desktop app
//      or Web app) with Drive API enabled.
//   2. Run a one-time consent flow with scope
//        https://www.googleapis.com/auth/drive.file
//      and capture the refresh token.
//   3. Drop the three values into Railway env vars.

import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

let _drive: drive_v3.Drive | null = null;

function getDrive(): drive_v3.Drive {
  if (_drive) return _drive;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive integration not configured. Set GOOGLE_OAUTH_CLIENT_ID, " +
        "GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.",
    );
  }

  const oauth2Client = new google.auth.OAuth2({
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost",
  });
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  _drive = google.drive({ version: "v3", auth: oauth2Client });
  return _drive;
}

export async function ensureFolder(folderName: string): Promise<string> {
  const drive = getDrive();
  const query =
    `name='${folderName.replace(/'/g, "\\'")}' and ` +
    `mimeType='application/vnd.google-apps.folder' and ` +
    `trashed=false`;
  const search = await drive.files.list({
    q: query,
    fields: "files(id,name)",
    pageSize: 1,
  });
  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive folder creation returned no id");
  return created.data.id;
}

export async function uploadText(opts: {
  folderId: string;
  name: string;
  content: string;
  mimeType?: string;
}): Promise<string | null> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: opts.name,
      parents: [opts.folderId],
      mimeType: opts.mimeType || "text/plain",
    },
    media: {
      mimeType: opts.mimeType || "text/plain",
      body: opts.content,
    },
    fields: "id",
  });
  return res.data.id || null;
}

export async function uploadBuffer(opts: {
  folderId: string;
  name: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<string | null> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: opts.name,
      parents: [opts.folderId],
      mimeType: opts.mimeType,
    },
    media: {
      mimeType: opts.mimeType,
      body: Readable.from(opts.buffer),
    },
    fields: "id",
  });
  return res.data.id || null;
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}
