import twilio from "twilio";
import { authStorage } from "./replit_integrations/auth/storage";
import type { User } from "@shared/models/auth";
import { db } from "./db";
import { queuedSms, tenantSettings, type TenantSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

// Tenant settings cache. Reloaded every 5 minutes to pick up admin changes
// without forcing a server restart. See docs/PRODUCT_PHILOSOPHY.md.
let cachedSettings: TenantSettings | null = null;
let cachedSettingsAt = 0;
const SETTINGS_CACHE_MS = 5 * 60 * 1000;

async function getTenantSettings(): Promise<TenantSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettingsAt < SETTINGS_CACHE_MS) {
    return cachedSettings;
  }
  try {
    const rows = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantKey, "default"))
      .limit(1);
    cachedSettings = rows[0] ?? null;
    cachedSettingsAt = now;
    return cachedSettings;
  } catch (err: any) {
    // Table may not exist yet on a fresh DB — fail closed (no SMS).
    console.warn("tenant_settings unavailable; defaulting to SMS off:", err.message || err);
    return null;
  }
}

export function invalidateTenantSettingsCache(): void {
  cachedSettings = null;
  cachedSettingsAt = 0;
}

/**
 * SMS message kind. Determines which tenant flag gates the send.
 *  - "notification": routine project notifications (off by default — see philosophy doc)
 *  - "invite":       client/crew invite SMS (on by default; high deliverability priority)
 *  - "test":         admin test message (bypasses gates if Twilio is configured)
 */
export type SmsKind = "notification" | "invite" | "test";

const APP_URL = (() => {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "https://asterandspruceliving.ca";
})();

const SMS_FOOTER = `\n\nDo not reply to this number. Log in for updates: ${APP_URL}`;

function getClient(): twilio.Twilio | null {
  if (!accountSid || !authToken || !fromNumber) {
    console.warn("Twilio credentials not configured — SMS disabled");
    return null;
  }
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

function getLocalNow(timezone: string): { day: number; hour: number; minute: number; date: Date } {
  const str = new Date().toLocaleString("en-US", { timeZone: timezone });
  const d = new Date(str);
  return { day: d.getDay(), hour: d.getHours(), minute: d.getMinutes(), date: d };
}

/**
 * Quiet hours check. Returns true when the current local time falls INSIDE the
 * tenant's allowed sending window. Defaults match the product philosophy:
 * 9am–7pm Mon–Fri in the tenant timezone.
 */
function isWithinQuietHours(settings: TenantSettings | null): boolean {
  const tz = settings?.timezone ?? "America/Toronto";
  const startHour = settings?.smsQuietHoursStart ?? 9;
  const endHour = settings?.smsQuietHoursEnd ?? 19;
  const allowedDays = settings?.smsQuietHoursDays ?? [1, 2, 3, 4, 5];
  const { day, hour, minute } = getLocalNow(tz);
  if (!allowedDays.includes(day)) return false;
  const t = hour + minute / 60;
  return t >= startHour && t < endHour;
}

async function sendSmsNow(to: string, body: string): Promise<boolean> {
  const tw = getClient();
  if (!tw) return false;
  try {
    await tw.messages.create({
      body,
      from: fromNumber,
      to: formatPhone(to),
    });
    console.log(`SMS sent to ${to.slice(0, 3)}***`);
    return true;
  } catch (err: any) {
    console.error("SMS send error:", err.message || err);
    return false;
  }
}

/**
 * Master SMS gate. ALL outbound SMS in this app go through here.
 *
 * Decision flow:
 *   1. Twilio configured? → if not, no-op
 *   2. Tenant settings loaded? → if missing, fail closed for notifications
 *   3. Kind allowed by tenant flags?
 *      - notification → requires settings.smsEnabled
 *      - invite       → requires settings.smsInvitesEnabled
 *      - test         → always allowed if Twilio is configured
 *   4. Within quiet hours?
 *      - yes → send now
 *      - no  → queue for later (handled by startSmsQueueProcessor)
 */
async function sendSms(
  to: string,
  body: string,
  kind: SmsKind = "notification"
): Promise<boolean> {
  const settings = await getTenantSettings();

  // Gate by tenant kind-specific flag
  if (kind === "notification") {
    if (!settings?.smsEnabled) {
      console.log(`SMS notification suppressed (smsEnabled=false) for ${to.slice(0, 3)}***`);
      return false;
    }
  } else if (kind === "invite") {
    // Default-on per product philosophy, but respect explicit opt-out.
    if (settings && !settings.smsInvitesEnabled) {
      console.log(`SMS invite suppressed (smsInvitesEnabled=false) for ${to.slice(0, 3)}***`);
      return false;
    }
  }
  // "test" kind passes through; only requires Twilio to be configured.

  const fullBody = body + SMS_FOOTER;

  // Test messages and invites bypass quiet hours — they are explicit user
  // actions, not background notifications.
  if (kind === "test" || kind === "invite" || isWithinQuietHours(settings)) {
    return sendSmsNow(to, fullBody);
  }

  try {
    await db.insert(queuedSms).values({
      toPhone: formatPhone(to),
      body: fullBody,
      sent: false,
    });
    console.log(`SMS queued for ${to.slice(0, 3)}*** (outside quiet hours)`);
    return true;
  } catch (err: any) {
    console.error("SMS queue error:", err.message || err);
    return false;
  }
}

async function processQueuedSms(): Promise<void> {
  const settings = await getTenantSettings();
  if (!isWithinQuietHours(settings)) return;

  try {
    const pending = await db
      .select()
      .from(queuedSms)
      .where(eq(queuedSms.sent, false))
      .limit(20);

    for (const msg of pending) {
      const success = await sendSmsNow(msg.toPhone, msg.body);
      if (success) {
        await db.update(queuedSms).set({ sent: true, sentAt: new Date() }).where(eq(queuedSms.id, msg.id));
      } else {
        await db.update(queuedSms).set({ error: "Send failed" }).where(eq(queuedSms.id, msg.id));
      }
    }

    if (pending.length > 0) {
      console.log(`Processed ${pending.length} queued SMS messages`);
    }
  } catch (err: any) {
    console.error("Queue processing error:", err.message || err);
  }
}

export function startSmsQueueProcessor(): void {
  processQueuedSms();
  setInterval(processQueuedSms, 5 * 60 * 1000);
  console.log("SMS queue processor started (checks every 5 minutes)");
}

async function getUsersWithPhones(userIds?: string[]): Promise<User[]> {
  const all = await authStorage.getUsers();
  return all.filter((u) => u.phone && (!userIds || userIds.includes(u.id)));
}

async function getProjectParticipants(
  projectClientId: string | null,
  excludeUserId?: string
): Promise<User[]> {
  const all = await authStorage.getUsers();
  return all.filter((u) => {
    if (!u.phone) return false;
    if (excludeUserId && u.id === excludeUserId) return false;
    if (u.role === "admin" || u.role === "crew") return true;
    if (u.role === "client" && u.id === projectClientId) return true;
    return false;
  });
}

export async function notifyNewMessage(
  projectId: number,
  projectName: string,
  senderName: string,
  messageContent: string,
  senderId: string,
  projectClientId: string | null
) {
  const recipients = await getProjectParticipants(projectClientId, senderId);
  const preview =
    messageContent.length > 80
      ? messageContent.slice(0, 77) + "..."
      : messageContent;
  const body = `Aster & Spruce: New message from ${senderName} on "${projectName}": ${preview}`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyTaskAssigned(
  projectName: string,
  taskTitle: string,
  assignedToId: string
) {
  const users = await getUsersWithPhones([assignedToId]);
  if (users.length === 0) return;
  const body = `Aster & Spruce: You've been assigned a new task on "${projectName}": ${taskTitle}`;
  await sendSms(users[0].phone!, body);
}

export async function notifyTaskStatusChange(
  projectName: string,
  taskTitle: string,
  newStatus: string,
  projectClientId: string | null,
  updatedByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, updatedByUserId);
  const body = `Aster & Spruce: Task "${taskTitle}" on "${projectName}" is now ${newStatus}`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyProjectUpdate(
  projectName: string,
  updateDescription: string,
  projectClientId: string | null,
  updatedByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, updatedByUserId);
  const body = `Aster & Spruce: ${updateDescription} on "${projectName}"`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyMilestoneCreated(
  projectName: string,
  milestoneName: string,
  projectClientId: string | null
) {
  const recipients = await getProjectParticipants(projectClientId);
  const body = `Aster & Spruce: New milestone added to "${projectName}": ${milestoneName}`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyPhotoUploaded(
  projectName: string,
  projectClientId: string | null,
  uploadedByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, uploadedByUserId);
  const body = `Aster & Spruce: New progress photo added to "${projectName}"`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyDocumentUploaded(
  projectName: string,
  docTitle: string,
  projectClientId: string | null,
  uploadedByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, uploadedByUserId);
  const body = `Aster & Spruce: New document "${docTitle}" added to "${projectName}"`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyCalendarEventCreated(
  projectName: string,
  eventTitle: string,
  eventDate: string,
  projectClientId: string | null,
  createdByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, createdByUserId);
  const body = `Aster & Spruce: New event on "${projectName}": ${eventTitle} (${eventDate})`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyCalendarEventChanged(
  projectName: string,
  eventTitle: string,
  changeDescription: string,
  projectClientId: string | null,
  changedByUserId: string
) {
  const recipients = await getProjectParticipants(projectClientId, changedByUserId);
  const body = `Aster & Spruce: Schedule change on "${projectName}": ${eventTitle} — ${changeDescription}`;
  await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone!, body))
  );
}

export async function notifyTeamCustom(
  projectName: string,
  message: string,
  projectClientId: string | null,
  sentByUserId: string,
  recipientIds?: string[]
): Promise<{ sent: number; failed: number; recipientNames: string[] }> {
  let recipients = await getProjectParticipants(projectClientId, sentByUserId);
  if (recipientIds && recipientIds.length > 0) {
    recipients = recipients.filter((u) => recipientIds.includes(u.id));
  }
  const body = `Aster & Spruce — "${projectName}": ${message}`;
  let sent = 0;
  let failed = 0;
  const recipientNames: string[] = [];
  const results = await Promise.allSettled(
    recipients.map((u) => {
      recipientNames.push(`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id);
      return sendSms(u.phone!, body);
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) sent++;
    else failed++;
  }
  return { sent, failed, recipientNames };
}

export async function notifyBoardLinked(
  boardName: string,
  projectName: string,
  linkedByName: string,
  linkedByUserId: string,
  newUserIds: string[],
  projectId?: number
) {
  const recipients = await getUsersWithPhones(newUserIds);
  const filtered = recipients.filter((u) => u.id !== linkedByUserId);
  if (filtered.length === 0) return;
  const link = projectId ? `${APP_URL}/project/${projectId}?tab=planning` : APP_URL;
  const body = `Aster & Spruce: ${linkedByName} added you to the planning board "${boardName}" on project "${projectName}".\n\nView it here: ${link}`;
  await Promise.allSettled(
    filtered.map((u) => sendSms(u.phone!, body))
  );
}

export async function sendClientInviteSms(
  toPhone: string,
  clientFirstName: string,
  projectName: string,
  inviteToken: string
): Promise<boolean> {
  const inviteLink = `${APP_URL}/invite/${inviteToken}`;
  const body = `Hi ${clientFirstName}, welcome to Aster & Spruce! You've been invited to your project portal for "${projectName}". Access your portal here: ${inviteLink}`;
  return sendSms(toPhone, body, "invite");
}

export async function sendTestSms(toPhone: string): Promise<boolean> {
  return sendSms(
    toPhone,
    `Aster & Spruce Connect: This is a test notification. Your SMS alerts are working!`,
    "test"
  );
}
