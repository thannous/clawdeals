function sanitizeText(value: string) {
  // Strip ASCII control chars to avoid log/UI issues, but keep newlines.
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export async function sendTelegramMessage({
  chatId,
  text,
  replyMarkup
}: {
  chatId: string;
  text: string;
  replyMarkup?: any;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return { ok: false, error: "MISSING_TELEGRAM_BOT_TOKEN" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: sanitizeText(text || ""),
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      })
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: body || `HTTP ${resp.status}` };
    }

    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || "TELEGRAM_SEND_FAILED" };
  }
}
