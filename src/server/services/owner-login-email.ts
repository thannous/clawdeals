import { getPublicAppUrl, joinUrl } from "../../shared/urls";
import { isUuid } from "../utils/validators";
import { normalizeEmail } from "../utils/owner-verification";
import { isOwnerSessionToken } from "../utils/session-tokens";

type OwnerLoginEmailResult = {
  provider: string;
  delivered: boolean;
  skipped: boolean;
  verify_url: string;
  message_id: string | null;
};

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeNonEmptyString(value: any) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function resolveProvider() {
  const provider = normalizeNonEmptyString(process.env.OWNER_LOGIN_EMAIL_PROVIDER)?.toLowerCase() || "none";
  if (provider === "none" || provider === "disabled") return "none";
  if (provider === "resend") return "resend";
  throw buildServiceError("Unsupported owner login email provider", 500, "EMAIL_PROVIDER_INVALID");
}

function resolveFromAddress() {
  const from = normalizeNonEmptyString(process.env.OWNER_LOGIN_EMAIL_FROM);
  if (!from) {
    throw buildServiceError("OWNER_LOGIN_EMAIL_FROM is required", 500, "EMAIL_PROVIDER_NOT_CONFIGURED");
  }
  return from;
}

function formatExpiresAt(expiresAt: string | null) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return expiresAt;
  return date.toUTCString();
}

function buildEmailPayload({
  verifyUrl,
  expiresAt
}: {
  verifyUrl: string;
  expiresAt: string | null;
}) {
  const expiresLabel = formatExpiresAt(expiresAt);
  const subject = "Your Clawdeals magic login link";
  const textLines = [
    "Sign in to Clawdeals with this magic link:",
    verifyUrl,
    expiresLabel ? `Expires: ${expiresLabel}` : null,
    "",
    "If you did not request this email, you can safely ignore it."
  ].filter(Boolean);

  const html = [
    "<p>Sign in to <strong>Clawdeals</strong> with this magic link:</p>",
    `<p><a href="${verifyUrl}">Open login link</a></p>`,
    expiresLabel ? `<p><small>Expires: ${expiresLabel}</small></p>` : "",
    "<p><small>If you did not request this email, you can safely ignore it.</small></p>"
  ].join("");

  return {
    subject,
    text: textLines.join("\n"),
    html
  };
}

async function sendViaResend({
  toEmail,
  from,
  subject,
  text,
  html
}: {
  toEmail: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = normalizeNonEmptyString(process.env.RESEND_API_KEY);
  if (!apiKey) {
    throw buildServiceError("RESEND_API_KEY is required", 500, "EMAIL_PROVIDER_NOT_CONFIGURED");
  }
  const endpoint = normalizeNonEmptyString(process.env.OWNER_LOGIN_RESEND_API_URL) || "https://api.resend.com/emails";

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject,
        text,
        html
      })
    });
  } catch (error: any) {
    throw buildServiceError("Failed to send owner login email", 503, "EMAIL_SEND_FAILED", {
      reason: String(error?.message || error)
    });
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildServiceError("Failed to send owner login email", 503, "EMAIL_SEND_FAILED", {
      status: response.status,
      provider_error: body || null
    });
  }

  return {
    messageId: normalizeNonEmptyString(body?.id)
  };
}

export async function sendOwnerLoginMagicLinkEmail({
  email,
  sessionId,
  token,
  expiresAt,
  appUrl
}: {
  email: string;
  sessionId: string;
  token: string;
  expiresAt?: string | null;
  appUrl?: string | null;
}): Promise<OwnerLoginEmailResult> {
  const toEmail = normalizeEmail(email);
  if (!toEmail) {
    throw buildServiceError("email is required", 400, "VALIDATION_ERROR");
  }

  const resolvedSessionId = normalizeNonEmptyString(sessionId);
  if (!resolvedSessionId || !isUuid(resolvedSessionId)) {
    throw buildServiceError("sessionId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const resolvedToken = normalizeNonEmptyString(token);
  if (!resolvedToken || !isOwnerSessionToken(resolvedToken)) {
    throw buildServiceError("Invalid session token", 400, "INVALID_SESSION_TOKEN");
  }

  const baseUrl = normalizeNonEmptyString(appUrl) || getPublicAppUrl();
  const verifyPath = `/auth/verify?session_id=${encodeURIComponent(resolvedSessionId)}&token=${encodeURIComponent(resolvedToken)}`;
  const verifyUrl = joinUrl(baseUrl, verifyPath);
  const provider = resolveProvider();
  if (provider === "none") {
    if (process.env.NODE_ENV === "production") {
      throw buildServiceError("Owner login email provider is not configured", 503, "EMAIL_PROVIDER_NOT_CONFIGURED");
    }
    console.warn("[owner-login-email] OWNER_LOGIN_EMAIL_PROVIDER not configured; skipping email send.");
    return {
      provider,
      delivered: false,
      skipped: true,
      verify_url: verifyUrl,
      message_id: null
    };
  }

  const { subject, text, html } = buildEmailPayload({
    verifyUrl,
    expiresAt: normalizeNonEmptyString(expiresAt)
  });

  const from = resolveFromAddress();
  const delivery = await sendViaResend({
    toEmail,
    from,
    subject,
    text,
    html
  });

  return {
    provider,
    delivered: true,
    skipped: false,
    verify_url: verifyUrl,
    message_id: delivery.messageId
  };
}
