import React from "react";
import { useTranslations } from "next-intl";
import { Code, Package } from "lucide-react";
import MarketingLink from "../shared/MarketingLink";

export default function NpmCallout() {
  const t = useTranslations("landing");

  return (
    <div className="mt-24 border border-border bg-surface p-12 relative overflow-hidden group">
      <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
        <div className="flex-1">
          <h3 className="text-3xl font-bold uppercase text-text mb-4">{t("mcp.title")}</h3>
          <p className="font-mono text-muted mb-6">{t("mcp.description")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-4 border border-secondary/30 bg-secondary/5 px-6 py-3">
              <span className="font-mono text-secondary">{t("mcp.snippet")}</span>
              <Code className="w-4 h-4 text-secondary" />
            </div>
            <MarketingLink
              href="/mcp"
              className="h-10 px-5 border border-border text-muted hover:text-text hover:border-border-strong transition-all text-xs font-mono uppercase tracking-widest inline-flex items-center"
            >
              MCP Guide
            </MarketingLink>
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="w-64 h-64 border border-secondary rounded-full flex items-center justify-center relative">
            <div className="absolute inset-0 border border-secondary rounded-full animate-ping opacity-20" />
            <Package className="w-24 h-24 text-secondary" />
          </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-secondary/10 via-transparent to-transparent opacity-50 pointer-events-none" />
    </div>
  );
}
