import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { getOwner, getOwnerByEmail, setOwnerVerified } from "./owners";
import { createAgent } from "./agents";
import { createWatchlist } from "./watchlists";
import { enqueueWatchlistBackfill } from "./watchlist-backfill-queue";
import { sendEmailMessage } from "../channels/email/client";
import { getPublicAppUrl, joinUrl } from "../../shared/urls";

export const ALERT_AGENT_SYSTEM = "email_alerts";
export const ALERT_CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(raw: string) {
  let normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = normalized.length % 4;
  if (padLen === 2) normalized += "==";
  else if (padLen === 3) normalized += "=";
  else if (padLen !== 0) throw new Error("invalid_base64");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function resolveConfirmSecret() {
  const secret = process.env.ALERT_CONFIRM_SECRET || process.env.OWNER_SESSION_SECRET || "";
  return secret.trim() || null;
}

function signPayload(payload: string, secret: string) {
  return base64Url(crypto.createHmac("sha256", secret).update(payload, "utf8").digest());
}

export function buildAlertConfirmToken({
  ownerId,
  watchlistId,
  expiresAtMs,
  secret = resolveConfirmSecret()
}: {
  ownerId: string;
  watchlistId: string;
  expiresAtMs: number;
  secret?: string | null;
}) {
  if (!secret) {
    throw buildServiceError("Alert confirmation secret is not configured", 500, "ALERT_CONFIRM_SECRET_MISSING");
  }
  const payload = base64Url(JSON.stringify({ o: ownerId, w: watchlistId, exp: expiresAtMs }));
  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifyAlertConfirmToken(
  token: string,
  { now = new Date(), secret = resolveConfirmSecret() }: { now?: Date; secret?: string | null } = {}
) {
  if (!secret) {
    throw buildServiceError("Alert confirmation secret is not configured", 500, "ALERT_CONFIRM_SECRET_MISSING");
  }
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw buildServiceError("Invalid confirmation token", 400, "ALERT_TOKEN_INVALID");
  }

  const expected = signPayload(parts[0], secret);
  const givenBuffer = Buffer.from(parts[1], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (givenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(givenBuffer, expectedBuffer)) {
    throw buildServiceError("Invalid confirmation token", 400, "ALERT_TOKEN_INVALID");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    throw buildServiceError("Invalid confirmation token", 400, "ALERT_TOKEN_INVALID");
  }
  if (!parsed?.o || !parsed?.w || !Number.isFinite(parsed?.exp)) {
    throw buildServiceError("Invalid confirmation token", 400, "ALERT_TOKEN_INVALID");
  }
  if (now.getTime() > Number(parsed.exp)) {
    throw buildServiceError("Confirmation link expired", 410, "ALERT_TOKEN_EXPIRED");
  }

  return { ownerId: String(parsed.o), watchlistId: String(parsed.w) };
}

const CONFIRM_COPY: Record<string, { subject: string; intro: string; action: string; ignore: string }> = {
  en: {
    subject: "Confirm your ClawDeals alert",
    intro: "You asked ClawDeals to email you when new items match this alert:",
    action: "Confirm the alert by opening this link:",
    ignore: "If you did not request this, ignore this email and nothing will be sent."
  },
  fr: {
    subject: "Confirmez votre alerte ClawDeals",
    intro: "Vous avez demandé à ClawDeals de vous écrire quand des annonces correspondent à cette alerte :",
    action: "Confirmez l'alerte en ouvrant ce lien :",
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et rien ne sera envoyé."
  },
  es: {
    subject: "Confirma tu alerta de ClawDeals",
    intro: "Pediste a ClawDeals que te escriba cuando haya anuncios que coincidan con esta alerta:",
    action: "Confirma la alerta abriendo este enlace:",
    ignore: "Si no solicitaste esto, ignora este correo y no se enviará nada."
  }
};

function resolveConfirmCopy(locale: string | null | undefined) {
  const key = typeof locale === "string" ? locale.trim().toLowerCase().slice(0, 2) : "";
  return CONFIRM_COPY[key] || CONFIRM_COPY.en;
}

function describeAlert({
  marketCode,
  queryText,
  tags,
  priceMax,
  currency
}: {
  marketCode: string;
  queryText?: string | null;
  tags?: string[] | null;
  priceMax?: number | null;
  currency: string;
}) {
  const parts = [marketCode];
  if (queryText) parts.push(`"${queryText}"`);
  if (Array.isArray(tags) && tags.length > 0) parts.push(tags.join(", "));
  if (priceMax !== null && priceMax !== undefined) parts.push(`≤ ${priceMax} ${currency}`);
  return parts.join(" · ");
}

async function ensureOwnerWithEmail(email: string) {
  const existing = await getOwnerByEmail(email);
  if (existing) return existing;

  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("owners")
    .insert({ owner_id: crypto.randomUUID(), email, updated_at: nowIso })
    .select("*")
    .single();
  if (error) {
    // Unique lower(email) race: another request created the owner first.
    if (error.code === "23505") {
      const raced = await getOwnerByEmail(email);
      if (raced) return raced;
    }
    mapError(error);
  }
  return data;
}

async function findOrCreateAlertAgent(ownerId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agents")
    .select("*")
    .eq("owner_id", ownerId)
    .contains("metadata", { system: ALERT_AGENT_SYSTEM })
    .limit(1)
    .maybeSingle();
  if (error) mapError(error);
  if (data) return data;

  // A passive watchlist holder: no API key is ever issued for it, so it cannot
  // call the API; it only exists so the matching -> outbox pipeline applies.
  return createAgent({
    ownerId,
    name: "Email Alerts",
    metadata: { system: ALERT_AGENT_SYSTEM }
  });
}

export async function createEmailAlert({
  email,
  locale,
  name,
  marketCode,
  currency,
  criteria,
  queryText,
  tags,
  priceMax,
  geoLat,
  geoLon,
  distanceKm,
  now = new Date(),
  sendEmail = sendEmailMessage
}: any) {
  const owner = await ensureOwnerWithEmail(email);
  const agent = await findOrCreateAlertAgent(owner.owner_id);

  // Inactive until the mailbox owner confirms: double opt-in prevents both spam
  // and third parties attaching alerts to someone else's address.
  const watchlist = await createWatchlist({
    agentId: agent.id,
    name: name || "Email alert",
    active: false,
    criteria: criteria || {},
    queryText,
    tags,
    priceMax,
    marketCode,
    currency,
    geoLat,
    geoLon,
    distanceKm
  });

  const token = buildAlertConfirmToken({
    ownerId: owner.owner_id,
    watchlistId: watchlist.watchlist_id,
    expiresAtMs: now.getTime() + ALERT_CONFIRM_TTL_MS
  });
  const confirmUrl = joinUrl(getPublicAppUrl(), `/api/v1/alerts/confirm?token=${encodeURIComponent(token)}`);

  const copy = resolveConfirmCopy(locale);
  const summary = describeAlert({ marketCode, queryText, tags, priceMax, currency });
  const text = [copy.intro, "", `  ${summary}`, "", copy.action, confirmUrl, "", copy.ignore].join("\n");
  const html = [
    `<p>${copy.intro}</p>`,
    `<p><strong>${summary.replace(/</g, "&lt;")}</strong></p>`,
    `<p>${copy.action}</p>`,
    `<p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
    `<p><small>${copy.ignore}</small></p>`
  ].join("");

  const result = await sendEmail({ toEmail: email, subject: copy.subject, text, html });
  if (!result?.ok) {
    if (result?.skipped && process.env.NODE_ENV !== "production") {
      // Dev convenience: no provider configured, expose the link for manual testing.
      return {
        status: "pending_confirmation",
        watchlist_id: watchlist.watchlist_id,
        email_delivery: "skipped",
        confirm_url: confirmUrl
      };
    }
    throw buildServiceError(
      "Could not send the confirmation email",
      503,
      result?.skipped ? "EMAIL_PROVIDER_NOT_CONFIGURED" : "EMAIL_SEND_FAILED"
    );
  }

  return { status: "pending_confirmation", watchlist_id: watchlist.watchlist_id, email_delivery: "sent" };
}

export async function confirmEmailAlert({ token, now = new Date() }: { token: string; now?: Date }) {
  const { ownerId, watchlistId } = verifyAlertConfirmToken(token, { now });

  const client = getSupabaseServiceClient();
  const { data: watchlist, error: watchlistError } = await client
    .from("watchlists")
    .select("*")
    .eq("watchlist_id", watchlistId)
    .is("deleted_at", null)
    .maybeSingle();
  if (watchlistError) mapError(watchlistError);
  if (!watchlist) {
    throw buildServiceError("Alert not found", 404, "ALERT_NOT_FOUND");
  }

  const { data: agent, error: agentError } = await client
    .from("agents")
    .select("id,owner_id")
    .eq("id", watchlist.agent_id)
    .maybeSingle();
  if (agentError) mapError(agentError);
  if (!agent || agent.owner_id !== ownerId) {
    throw buildServiceError("Invalid confirmation token", 400, "ALERT_TOKEN_INVALID");
  }

  if (!watchlist.active) {
    const { error: updateError } = await client
      .from("watchlists")
      .update({ active: true, updated_at: now.toISOString() })
      .eq("watchlist_id", watchlistId);
    if (updateError) mapError(updateError);
  }

  // Opening the emailed link proves control of the mailbox.
  try {
    const owner = await getOwner(ownerId);
    if (owner && !owner.email_verified_at) {
      await setOwnerVerified({ ownerId, type: "EMAIL", verifiedAt: now });
    }
  } catch (error: any) {
    console.info("alerts.owner_verify_failed", { error: error?.message || String(error) });
  }

  try {
    await enqueueWatchlistBackfill({ watchlistId });
  } catch (error: any) {
    console.info("alerts.backfill_enqueue_failed", { error: error?.message || String(error) });
  }

  return { status: "confirmed", watchlist_id: watchlistId };
}
