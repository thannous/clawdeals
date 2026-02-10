function clampInt(value: any, min: number, max: number): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

function resolveTimeZone(timezone: any): string {
  const tz = typeof timezone === "string" ? timezone.trim() : "";
  if (!tz) return "UTC";
  try {
    // Throws RangeError on invalid timeZone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

export function getLocalMinuteOfDay({ now = new Date(), timezone }: { now?: Date; timezone?: string }) {
  const tz = resolveTimeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(now);

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "";
  const minStr = parts.find((p) => p.type === "minute")?.value ?? "";
  const hour = clampInt(hourStr, 0, 23) ?? 0;
  const minute = clampInt(minStr, 0, 59) ?? 0;
  return hour * 60 + minute;
}

export function isQuietNow({
  now = new Date(),
  timezone,
  quietEnabled,
  startMin,
  endMin
}: {
  now?: Date;
  timezone?: string;
  quietEnabled: boolean;
  startMin: number | null;
  endMin: number | null;
}) {
  if (!quietEnabled) return false;
  if (startMin == null || endMin == null) return false;

  const s = clampInt(startMin, 0, 1439);
  const e = clampInt(endMin, 0, 1439);
  if (s == null || e == null) return false;

  const current = getLocalMinuteOfDay({ now, timezone });

  // start == end => treat as full-day quiet.
  if (s === e) return true;

  if (s < e) {
    return current >= s && current < e;
  }

  // Wrap across midnight.
  return current >= s || current < e;
}

