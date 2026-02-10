function sanitizeText(value: string) {
  // Strip ASCII control chars to avoid log/UI issues, but keep newlines for readability in chat UIs.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function buildTelegramSendMessage({
  chatId,
  text,
  disableWebPagePreview = true,
  replyMarkup
}: {
  chatId: string;
  text: string;
  disableWebPagePreview?: boolean;
  replyMarkup?: any;
}) {
  const payload: any = {
    method: "sendMessage",
    chat_id: chatId,
    text: sanitizeText(text || ""),
    disable_web_page_preview: disableWebPagePreview
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  return payload;
}

export function buildTelegramAnswerCallbackQuery({
  callbackQueryId,
  text,
  showAlert = false
}: {
  callbackQueryId: string;
  text: string;
  showAlert?: boolean;
}) {
  return {
    method: "answerCallbackQuery",
    callback_query_id: callbackQueryId,
    text: sanitizeText(text || ""),
    show_alert: Boolean(showAlert)
  };
}
