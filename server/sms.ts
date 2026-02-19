import twilio from "twilio";
import { authStorage } from "./replit_integrations/auth/storage";
import type { User } from "@shared/models/auth";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

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

async function sendSms(to: string, body: string): Promise<boolean> {
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

export async function sendTestSms(toPhone: string): Promise<boolean> {
  return sendSms(
    toPhone,
    "Aster & Spruce Connect: This is a test notification. Your SMS alerts are working!"
  );
}
