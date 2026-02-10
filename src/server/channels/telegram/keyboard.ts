const MODE_BUTTONS = [
  { mode: "REALTIME", label: "Realtime", value: "realtime" },
  { mode: "DIGEST_HOURLY", label: "Hourly", value: "digest_hourly" },
  { mode: "DIGEST_DAILY", label: "Daily", value: "digest_daily" },
  { mode: "SILENT", label: "Silent", value: "silent" }
] as const;

const EVENT_TYPE_BUTTONS = [
  { key: "watchlist_match", label: "Watchlist" },
  { key: "offer_received", label: "Offers" },
  { key: "approval_required", label: "Approvals" },
  { key: "transaction_updates", label: "Transactions" }
] as const;

function isEnabled(list: any, key: string) {
  if (!Array.isArray(list)) return false;
  return list.includes(key);
}

export function buildNotificationsKeyboard(prefs: any) {
  const mode = typeof prefs?.mode === "string" ? prefs.mode : "DIGEST_HOURLY";
  const eventTypes = Array.isArray(prefs?.event_types) ? prefs.event_types : ["watchlist_match"];

  const modeRow = MODE_BUTTONS.map((b) => ({
    text: mode === b.mode ? `[${b.label}]` : b.label,
    callback_data: `notif mode ${b.value}`
  }));

  const quietEnabled = Boolean(prefs?.quiet_enabled);
  const quietRow = [
    {
      text: quietEnabled ? "Quiet: ON" : "Quiet: OFF",
      callback_data: quietEnabled ? "notif quiet off" : "notif quiet 22:00 08:00"
    },
    { text: "22-08", callback_data: "notif quiet 22:00 08:00" },
    { text: "23-07", callback_data: "notif quiet 23:00 07:00" }
  ];

  const typesRowA = EVENT_TYPE_BUTTONS.slice(0, 2).map((t) => ({
    text: `${t.label}:${isEnabled(eventTypes, t.key) ? "ON" : "OFF"}`,
    callback_data: `notif types toggle ${t.key}`
  }));

  const typesRowB = EVENT_TYPE_BUTTONS.slice(2).map((t) => ({
    text: `${t.label}:${isEnabled(eventTypes, t.key) ? "ON" : "OFF"}`,
    callback_data: `notif types toggle ${t.key}`
  }));

  return {
    inline_keyboard: [modeRow, quietRow, typesRowA, typesRowB]
  };
}

