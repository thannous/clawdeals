import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronDown } from "lucide-react";
import { getLocaleLabels } from "../../shared/seo";
import { stripLocalePrefix } from "../../shared/i18n";

const LOCALES = getLocaleLabels();

export default function LocaleDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const asPathNoLocale = stripLocalePrefix(router.asPath || "/");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-secondary hover:border-border-strong transition-colors"
      >
        {(router.locale || "en").toUpperCase()}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[100px]">
          {LOCALES.map((loc) => (
            <Link
              key={loc.code}
              href={asPathNoLocale}
              locale={loc.code}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                router.locale === loc.code
                  ? "text-secondary bg-secondary/10"
                  : "text-muted hover:text-text hover:bg-surface-alt"
              }`}
            >
              {loc.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
