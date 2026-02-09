function sanitizeText(value: string) {
  // Strip ASCII control chars to avoid log/UI issues.
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

export function buildTelegramSendMessage({
  chatId,
  text,
  disableWebPagePreview = true
}: {
  chatId: string;
  text: string;
  disableWebPagePreview?: boolean;
}) {
  return {
    method: "sendMessage",
    chat_id: chatId,
    text: sanitizeText(text || ""),
    disable_web_page_preview: disableWebPagePreview
  };
}

