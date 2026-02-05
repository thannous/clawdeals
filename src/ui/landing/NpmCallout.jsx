import React from "react";
import { Code, Package } from "lucide-react";

export default function NpmCallout({ copy }) {
  return (
    <div className="mt-24 border border-border bg-surface p-12 relative overflow-hidden group">
      <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
        <div className="flex-1">
          <h3 className="text-3xl font-bold uppercase text-text mb-4">{copy.mcp.title}</h3>
          <p className="font-mono text-muted mb-6">{copy.mcp.description}</p>
          <div className="inline-flex items-center gap-4 border border-[color-mix(in_srgb,var(--color-secondary)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-secondary)_5%,transparent)] px-6 py-3">
            <span className="font-mono text-secondary">{copy.mcp.snippet}</span>
            <Code className="w-4 h-4 text-secondary" />
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="w-64 h-64 border border-secondary rounded-full flex items-center justify-center relative">
            <div className="absolute inset-0 border border-secondary rounded-full animate-ping opacity-20" />
            <Package className="w-24 h-24 text-secondary" />
          </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)] via-transparent to-transparent opacity-50 pointer-events-none" />
    </div>
  );
}
