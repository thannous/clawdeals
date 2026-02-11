import React from "react";

export function TechBorder({
  children,
  className = "",
  dataTestId
}: {
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
}) {
  return (
    <div
      className={`relative p-[1px] bg-surface-alt ${className} clip-corner group`}
      data-testid={dataTestId}
    >
      <div className="absolute inset-0 bg-border-strong clip-corner group-hover:bg-primary transition-colors duration-300" />
      <div className="relative bg-surface clip-corner h-full w-full">{children}</div>
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  accentText = "text-primary",
  accentBg = "bg-primary"
}: {
  title: string;
  subtitle: string;
  accentText?: string;
  accentBg?: string;
}) {
  return (
    <div className="flex items-end gap-4 mb-8 border-b border-border pb-2">
      <h2 className="text-3xl font-bold uppercase tracking-wider text-text">
        <span className={`${accentText} mr-2`}>/</span>
        {title}
      </h2>
      <div className="flex-grow h-[1px] bg-surface-alt mb-2 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 w-full h-full ${accentBg} opacity-30 animate-pulse`}
          style={{ transform: "translateX(-100%)", animation: "slideRight 2s infinite" }}
        />
      </div>
      <span className="font-mono text-xs text-subtle mb-1">{subtitle}</span>
    </div>
  );
}
