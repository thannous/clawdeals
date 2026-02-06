export default function TemperatureGauge({ temperature, status }) {
  if (status === "NEW") {
    return (
      <div data-testid="temp-hidden" className="flex items-center gap-2">
        <div className="hazard-stripe h-5 w-20 rounded-sm opacity-60" />
        <span className="text-xs font-mono text-subtle uppercase tracking-wider">Hidden</span>
      </div>
    );
  }

  const value = typeof temperature === "number" ? Math.max(0, Math.min(100, temperature)) : 0;
  const pct = `${value}%`;

  return (
    <div data-testid="temp-gauge" className="flex items-center gap-2 min-w-[120px]">
      <div className="relative h-2 w-20 rounded-full bg-surface-alt overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full temp-bar-active"
          style={{
            width: pct,
            background: `linear-gradient(90deg, var(--theme-secondary), var(--theme-primary))`
          }}
        />
      </div>
      <span className="text-xs font-mono text-text tabular-nums">{value}</span>
    </div>
  );
}
