export type EmailSendResult = {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
  messageId?: string | null;
};

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

export function resolveEmailProvider(): "resend" | "none" {
  const provider =
    normalizeNonEmptyString(process.env.EMAIL_PROVIDER)?.toLowerCase() ||
    normalizeNonEmptyString(process.env.OWNER_LOGIN_EMAIL_PROVIDER)?.toLowerCase() ||
    "none";
  if (provider === "resend") return "resend";
  return "none";
}

export function resolveEmailFrom() {
  return (
    normalizeNonEmptyString(process.env.EMAIL_FROM) ||
    normalizeNonEmptyString(process.env.OWNER_LOGIN_EMAIL_FROM)
  );
}

export function isEmailChannelConfigured() {
  return resolveEmailProvider() !== "none" && Boolean(resolveEmailFrom()) && Boolean(normalizeNonEmptyString(process.env.RESEND_API_KEY));
}

// Non-throwing by design: notification delivery must degrade, never crash the
// dispatch loop. Missing configuration is reported as { ok: false, skipped: true }.
export async function sendEmailMessage({
  toEmail,
  subject,
  text,
  html
}: {
  toEmail: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const to = normalizeNonEmptyString(toEmail);
  if (!to) {
    return { ok: false, error: "MISSING_RECIPIENT" };
  }

  const provider = resolveEmailProvider();
  if (provider === "none") {
    return { ok: false, skipped: true, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  const from = resolveEmailFrom();
  if (!from) {
    return { ok: false, skipped: true, error: "EMAIL_FROM_NOT_CONFIGURED" };
  }

  const apiKey = normalizeNonEmptyString(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return { ok: false, skipped: true, error: "EMAIL_API_KEY_NOT_CONFIGURED" };
  }

  const endpoint =
    normalizeNonEmptyString(process.env.RESEND_API_URL) ||
    normalizeNonEmptyString(process.env.OWNER_LOGIN_RESEND_API_URL) ||
    "https://api.resend.com/emails";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(html ? { html } : {})
      })
    });

    if (!response.ok) {
      // Never log or return the recipient/body; provider status only.
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }

    const body = await response.json().catch(() => ({}));
    return { ok: true, messageId: normalizeNonEmptyString(body?.id) };
  } catch (error: any) {
    return { ok: false, error: error?.message || "EMAIL_SEND_FAILED" };
  }
}
