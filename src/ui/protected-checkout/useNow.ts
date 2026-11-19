import { useEffect, useState } from "react";

// Re-renders on an interval so a countdown stays current. Null until mounted,
// so server and first client render match.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

export function splitTimeLeft(endsAt: string | null | undefined, now: number | null) {
  const endsMs = endsAt ? Date.parse(endsAt) : NaN;
  if (now === null || !Number.isFinite(endsMs)) return null;
  const totalMinutes = Math.max(0, Math.floor((endsMs - now) / 60_000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, over: endsMs <= now };
}
