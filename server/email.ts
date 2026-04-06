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
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;">
          <tr>
            <td style="background-color:#1a3a2a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">
                ASTER &amp; SPRUCE
              </h1>
              <p style="margin:4px 0 0;font-size:11px;color:#a8c5b0;letter-spacing:2px;text-transform:uppercase;">
                LIVING
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:18px;color:#1a3a2a;font-weight:600;">
                Welcome, ${clientFirstName}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.6;">
                You've been invited to your project portal for <strong>${projectName}</strong>. 
                This is where you can track progress, view updates, and collaborate with our team throughout your renovation.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background-color:#1a3a2a;border-radius:4px;padding:14px 32px;text-align:center;">
                    <a href="${inviteLink}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">
                      Access Your Portal
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#888888;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#1a3a2a;word-break:break-all;">
                ${inviteLink}
              </p>
              <hr style="border:none;border-top:1px solid #e8e8e4;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                This invite expires in 7 days. If you have any questions, please contact your project coordinator directly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9f9f7;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#999999;">
                &copy; Aster &amp; Spruce Living &middot; Muskoka, Ontario
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hi ${clientFirstName},\n\nYou've been invited to your project portal for "${projectName}" on Aster & Spruce Connect.\n\nAccess your portal here: ${inviteLink}\n\nThis invite expires in 7 days.\n\n— Aster & Spruce Living`;

  try {
    await transport.sendMail({
      from: `"Aster & Spruce Living" <${gmailUser}>`,
      to: toEmail,
      subject: `Your ${projectName} Project Portal — Aster & Spruce`,
      text,
      html,
    });
    console.log(`[email] Invite email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("[email] Failed to send invite email:", error);
    return false;
  }
}
