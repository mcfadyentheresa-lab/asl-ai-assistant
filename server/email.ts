import nodemailer from "nodemailer";

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

const APP_URL = process.env.REPLIT_DEPLOYMENT_URL
  ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
  : process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://asterandspruce.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!gmailUser || !gmailAppPassword) {
    console.warn("[email] GMAIL_USER or GMAIL_APP_PASSWORD not configured — email sending disabled");
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
  }
  return transporter;
}

export async function notifyTeamEmail(
  projectName: string,
  message: string,
  projectClientId: string | null,
  sentByUserId: string,
  recipientIds?: string[]
): Promise<{ sent: number; failed: number; recipientNames: string[] }> {
  const { authStorage } = await import("./replit_integrations/auth/storage");
  const all = await authStorage.getUsers();
  let recipients = all.filter((u) => {
    if (!u.email) return false;
    if (u.id === sentByUserId) return false;
    if (u.role === "admin" || u.role === "crew") return true;
    if (u.role === "client" && u.id === projectClientId) return true;
    return false;
  });
  if (recipientIds && recipientIds.length > 0) {
    recipients = recipients.filter((u) => recipientIds.includes(u.id));
  }

  const transport = getTransporter();
  let sent = 0;
  let failed = 0;
  const recipientNames: string[] = [];

  for (const u of recipients) {
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email!;
    recipientNames.push(name);
    if (!transport) { failed++; continue; }
    try {
      await transport.sendMail({
        from: `"Aster & Spruce Living" <${gmailUser}>`,
        to: u.email!,
        subject: `Update on "${projectName}" — Aster & Spruce`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f0;font-family:Inter,Helvetica,Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:40px 20px;"><div style="background:#1a3a2a;color:#fff;padding:24px 40px;text-align:center;"><div style="font-size:20px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Aster &amp; Spruce</div><div style="font-size:11px;color:#a8c5b0;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Living</div></div><div style="background:#fff;padding:32px 40px;"><p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">${projectName}</p><p style="margin:0 0 24px;color:#1a3a2a;font-size:15px;line-height:1.7;">${message}</p><p style="margin:0;font-size:12px;color:#999;">You received this because you are a team member on this project.</p></div></div></body></html>`,
        text: `${projectName}\n\n${message}\n\n— Aster & Spruce Living`,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed, recipientNames };
}

export async function sendClientInviteEmail(
  toEmail: string,
  clientFirstName: string,
  projectName: string,
  inviteToken: string
): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  const inviteLink = `${APP_URL}/invite/${inviteToken}`;
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:Inter,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#1a3a2a;color:#fff;padding:32px 40px;text-align:center;">
      <div style="font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Aster &amp; Spruce</div>
      <div style="font-size:11px;color:#a8c5b0;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Living</div>
    </div>
    <div style="background:#fff;padding:40px;">
      <h2 style="margin:0 0 16px;color:#1a3a2a;">Welcome, ${clientFirstName}</h2>
      <p style="margin:0 0 24px;color:#444;line-height:1.6;">
        You've been invited to your project portal for <strong>${projectName}</strong>.
      </p>
      <p style="margin:0 0 32px;">
        <a href="${inviteLink}" style="display:inline-block;background:#1a3a2a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Access Your Portal</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#888;">If the button above doesn't work, copy and paste this link:</p>
      <p style="margin:0 0 24px;font-size:12px;color:#1a3a2a;word-break:break-all;">${inviteLink}</p>
      <p style="margin:0;font-size:12px;color:#999;line-height:1.5;">This invite expires in 7 days.</p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: `"Aster & Spruce Living" <${gmailUser}>`,
      to: toEmail,
      subject: `Your ${projectName} Project Portal — Aster & Spruce`,
      html,
      text: `Hi ${clientFirstName},\n\nYou've been invited to your project portal for "${projectName}".\n\nAccess it here: ${inviteLink}\n\nThis invite expires in 7 days.\n\n— Aster & Spruce Living`,
    });
    return true;
  } catch (error) {
    console.error("[email] Failed to send invite email:", error);
    return false;
  }
}