import type { ReactNode } from "react";
import LocaleDropdown from "./LocaleDropdown";

export type PageHeaderProps = {
  title?: string;
  titleClassName?: string;
  containerClassName?: string;
  contentClassName?: string;
  actions?: ReactNode;
  left?: ReactNode;
  children?: ReactNode;
  htmlTitle?: ReactNode;
  hideLocale?: boolean;
};

export default function PageHeader({
  title,
  titleClassName = "text-lg font-bold tracking-wider text-text text-shadow-glow truncate",
  containerClassName = "px-4 py-3",
  contentClassName,
  actions,
  left,
  children,
  htmlTitle,
  hideLocale
}: PageHeaderProps) {
  const fallbackTitle = title ? (
    <h1 className={titleClassName}>
      <span className="text-primary">/ </span>
      {title}
    </h1>
  ) : null;
  const renderedTitle = htmlTitle ?? fallbackTitle;

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className={containerClassName}>
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">{left ?? renderedTitle}</div>
          <div className="flex items-center gap-2 min-w-0">
            {!hideLocale && <LocaleDropdown />}
            {actions}
          </div>
        </div>

        {children ? <div className={contentClassName || ""}>{children}</div> : null}
      </div>
    </header>
  );
}
