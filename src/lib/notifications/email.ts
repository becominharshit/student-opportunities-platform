export interface EmailPayload {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  notificationId: string;
  idempotencyKey: string;
}

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
}

export interface EmailSender {
  send(payload: EmailPayload): Promise<SendResult>;
}

export class DevelopmentEmailSender implements EmailSender {
  private sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<SendResult> {
    this.sent.push({ ...payload });
    // Safe non-sensitive diagnostic log (no recipient email or body text)
    if (process.env.NODE_ENV !== "test") {
      console.log(`[DevelopmentEmailSender] Simulated email dispatch for notification ${payload.notificationId}`);
    }
    return {
      success: true,
      providerMessageId: `dev-msg-${payload.notificationId}-${Date.now()}`,
      retryable: false,
    };
  }

  getSentEmails(): EmailPayload[] {
    return [...this.sent];
  }

  clear(): void {
    this.sent = [];
  }
}

export class TransactionalApiEmailSender implements EmailSender {
  private apiKey: string | undefined;
  private fromAddress: string | undefined;
  private endpoint: string | undefined;

  constructor(options?: { apiKey?: string; fromAddress?: string; endpoint?: string }) {
    this.apiKey = options?.apiKey ?? process.env.NOTIFICATION_EMAIL_API_KEY;
    this.fromAddress = options?.fromAddress ?? process.env.NOTIFICATION_EMAIL_FROM;
    this.endpoint = options?.endpoint ?? process.env.NOTIFICATION_EMAIL_ENDPOINT;
  }

  async send(payload: EmailPayload): Promise<SendResult> {
    if (!this.apiKey || !this.fromAddress) {
      return {
        success: false,
        errorCode: "EMAIL_NOT_CONFIGURED",
        errorMessage: "Transactional email provider is not configured with API key and from address",
        retryable: false,
      };
    }

    try {
      const endpoint = this.endpoint || "https://api.resend.com/emails";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [payload.to],
          subject: payload.subject,
          text: payload.textBody,
          html: payload.htmlBody,
          headers: {
            "X-Entity-Ref-ID": payload.idempotencyKey,
          },
        }),
      });

      if (!response.ok) {
        const status = response.status;
        const retryable = status === 429 || (status >= 500 && status < 600);
        return {
          success: false,
          errorCode: `HTTP_${status}`,
          errorMessage: `Provider returned HTTP status ${status}`,
          retryable,
        };
      }

      const data = (await response.json()) as { id?: string };
      return {
        success: true,
        providerMessageId: data.id || `msg-${Date.now()}`,
        retryable: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error during email dispatch";
      return {
        success: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: message.slice(0, 200),
        retryable: true,
      };
    }
  }
}

export function renderNotificationEmail(params: {
  title: string;
  body: string;
  actionUrl?: string | null;
  appBaseUrl?: string;
}): { subject: string; textBody: string; htmlBody: string } {
  const { title, body, actionUrl } = params;
  const baseUrl = (params.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://studentopportunities.platform").replace(/\/$/, "");
  const fullActionUrl = actionUrl ? `${baseUrl}${actionUrl}` : null;
  const preferencesUrl = `${baseUrl}/account`;

  const subject = `[Student Opportunities] ${title}`;

  const textLines = [
    title,
    "=".repeat(title.length),
    "",
    body,
    "",
  ];

  if (fullActionUrl) {
    textLines.push(`View Opportunity: ${fullActionUrl}`, "");
  }

  textLines.push(
    "---",
    "You are receiving this because you enabled email notifications for saved opportunities.",
    `Manage preferences: ${preferencesUrl}`
  );

  const textBody = textLines.join("\n");

  const actionButtonHtml = fullActionUrl
    ? `<div style="margin: 24px 0;">
         <a href="${escapeHtml(fullActionUrl)}" style="background-color: #2563eb; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
           View Opportunity
         </a>
       </div>`
    : "";

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 28px;">
    <div style="margin-bottom: 20px; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
      Student Opportunities Platform
    </div>
    <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0;">
      ${escapeHtml(title)}
    </h1>
    <p style="font-size: 15px; color: #334155; margin: 0 0 20px 0;">
      ${escapeHtml(body)}
    </p>
    ${actionButtonHtml}
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 16px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      You are receiving this update because you enabled email notifications for your saved opportunities.<br/>
      To change your preferences, visit <a href="${escapeHtml(preferencesUrl)}" style="color: #64748b; text-decoration: underline;">your account settings</a>.
    </p>
  </div>
</body>
</html>`;

  return { subject, textBody, htmlBody };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
