import { getDatabaseBackend } from "../config/backends";
import { getNeonSql } from "../db/neon";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { sendEmailMessage } from "../channels/email/client";

const DUPLICATE_KEY_REGEX = /duplicate key value/i;

const CONFIRMATION_COPY: Record<string, { subject: string; lines: string[] }> = {
  en: {
    subject: "You're on the ClawDeals waitlist",
    lines: [
      "Thanks for joining the ClawDeals waitlist.",
      "We'll email you when new markets, features, and deal sources go live.",
      "",
      "If you did not request this, you can safely ignore this email."
    ]
  },
  fr: {
    subject: "Vous êtes sur la liste d'attente ClawDeals",
    lines: [
      "Merci de vous être inscrit à la liste d'attente ClawDeals.",
      "Nous vous écrirons dès que de nouveaux marchés, fonctionnalités et sources de deals seront disponibles.",
      "",
      "Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email."
    ]
  },
  es: {
    subject: "Estás en la lista de espera de ClawDeals",
    lines: [
      "Gracias por unirte a la lista de espera de ClawDeals.",
      "Te escribiremos cuando haya nuevos mercados, funciones y fuentes de ofertas disponibles.",
      "",
      "Si no solicitaste esto, puedes ignorar este correo."
    ]
  }
};

function resolveConfirmationCopy(locale: string | null) {
  const key = typeof locale === "string" ? locale.trim().toLowerCase().slice(0, 2) : "";
  return CONFIRMATION_COPY[key] || CONFIRMATION_COPY.en;
}

export async function createWatchlistSignup({ email, locale, source, sendEmail = sendEmailMessage }: any) {
  const payload = {
    email,
    locale: typeof locale === "string" && locale.trim() ? locale.trim() : null,
    source: typeof source === "string" && source.trim() ? source.trim() : null
  };

  if (getDatabaseBackend() === "neon") {
    try {
      const sql = getNeonSql();
      const rows = await sql`
        insert into public.watchlist_signups (email, locale, source)
        values (${payload.email}, ${payload.locale}, ${payload.source})
        returning *
      `;
      const data = rows[0] || null;
      await sendConfirmationEmail({ email, locale: payload.locale, sendEmail });
      return { status: "created", data };
    } catch (error: any) {
      if (error?.code === "23505" || DUPLICATE_KEY_REGEX.test(error?.message || "")) {
        return { status: "already_registered", data: null };
      }
      const mapped = mapSupabaseError(error);
      throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
    }
  }

  const client = getSupabaseServiceClient();

  const { data, error } = await client.from("watchlist_signups").insert(payload).select().single();
  if (error) {
    if (error.code === "23505" || DUPLICATE_KEY_REGEX.test(error.message || "")) {
      return { status: "already_registered", data: null };
    }
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  await sendConfirmationEmail({ email, locale: payload.locale, sendEmail });

  return { status: "created", data };
}

async function sendConfirmationEmail({ email, locale, sendEmail }: any) {
  // Best-effort confirmation: signup must succeed even when no email provider
  // is configured or the send fails.
  try {
    const copy = resolveConfirmationCopy(locale);
    const result = await sendEmail({
      toEmail: email,
      subject: copy.subject,
      text: copy.lines.join("\n"),
      html: copy.lines.filter(Boolean).map((line) => `<p>${line}</p>`).join("")
    });
    if (!result?.ok && !result?.skipped) {
      console.info("watchlist_signups.confirmation_email_failed", {
        status: result?.status || null,
        error: result?.error || null
      });
    }
  } catch (sendError: any) {
    console.info("watchlist_signups.confirmation_email_failed", {
      error: sendError?.message || String(sendError)
    });
  }
}
