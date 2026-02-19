import { Flame, Thermometer } from "lucide-react";

export default function TemperatureGauge({ temperature, status }) {
  if (status === "NEW") {
    return (
      <div
        data-testid="temp-hidden"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono font-bold text-sm rounded border border-border text-subtle hazard-stripe"
        title="Temperature hidden for new deals"
      >
        --°
      </div>
    );
  }

  const value = typeof temperature === "number" ? Math.max(0, Math.min(100, temperature)) : 0;

  let colorClasses: string;
  let Icon = Thermometer;

  if (value >= 60) {
    colorClasses = "border-error/50 text-error bg-error/10 shadow-[0_0_8px_var(--theme-error)]";
    Icon = Flame;
  } else if (value >= 26) {
    colorClasses = "border-primary/50 text-primary bg-primary/10";
  } else {
    colorClasses = "border-secondary/50 text-secondary bg-secondary/10";
  }

  return (
    <div
      data-testid="temp-gauge"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono font-bold text-sm rounded border ${colorClasses}`}
    >
      <Icon size={14} />
      {value}°
    </div>
  );
}
