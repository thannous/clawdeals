export const NOTIFICATION_EVENT_TYPES = [
  "watchlist_match", "offer_received", "approval_required", "transaction_updates"
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_MODES = ["REALTIME", "DIGEST_HOURLY", "DIGEST_DAILY", "SILENT"] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

export type NotificationSettings = {
  mode: NotificationMode;
  timezone: string;
  quiet_enabled: boolean;
  quiet_start_min: number | null;
  quiet_end_min: number | null;
  daily_digest_hour: number;
  event_types: NotificationEventType[];
};

// Matches the existing database and dispatch defaults. Reading settings never
// subscribes an owner or creates a preferences row.
export function defaultNotificationSettings(): NotificationSettings {
  return {
    mode: "DIGEST_HOURLY", timezone: "UTC", quiet_enabled: false,
    quiet_start_min: null, quiet_end_min: null, daily_digest_hour: 9,
    event_types: ["watchlist_match"]
  };
}

export function publicNotificationSettings(row: NotificationSettings): NotificationSettings {
  return {
    mode: row.mode, timezone: row.timezone, quiet_enabled: row.quiet_enabled,
    quiet_start_min: row.quiet_start_min, quiet_end_min: row.quiet_end_min,
    daily_digest_hour: row.daily_digest_hour, event_types: row.event_types
  };
}
