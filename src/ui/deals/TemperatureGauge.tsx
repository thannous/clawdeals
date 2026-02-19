import { Flame, Thermometer } from "lucide-react";

export default function TemperatureGauge({
  temperature,
  status,
  size = "sm",
}: {
  temperature?: number | null;
  status?: string;
  size?: "sm" | "lg";
}) {
  const sizeClasses =
    size === "lg"
      ? "px-3 py-1.5 text-base gap-2"
      : "px-2.5 py-1 text-sm gap-1.5";
  const iconSize = size === "lg" ? 18 : 14;

  if (status === "NEW") {
    return (
      <div
        data-testid="temp-hidden"
        className={`inline-flex items-center font-mono font-bold rounded border border-border text-subtle hazard-stripe ${sizeClasses}`}
        title="Temperature hidden for new deals"
      >
        --°
      </div>
    );
  }

  const value =
    typeof temperature === "number" ? Math.max(0, Math.min(100, temperature)) : 0;

  let colorClasses: string;
  let Icon = Thermometer;

  if (value >= 60) {
    colorClasses =
      "border-error/50 text-error bg-error/10 shadow-[0_0_8px_var(--theme-error)]";
    Icon = Flame;
  } else if (value >= 26) {
    colorClasses = "border-primary/50 text-primary bg-primary/10";
  } else {
    colorClasses = "border-secondary/50 text-secondary bg-secondary/10";
  }

  return (
    <div
      data-testid="temp-gauge"
      className={`inline-flex items-center font-mono font-bold rounded border ${colorClasses} ${sizeClasses}`}
    >
      <Icon size={iconSize} />
      {value}°
    </div>
  );
}
