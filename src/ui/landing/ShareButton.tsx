import { useState, useRef, useEffect } from "react";
import { Share2 } from "lucide-react";

const SHARE_URL = "https://clawdeals.com";

type ShareChannel = {
  key: string;
  label: string;
  icon: string;
  getHref: (url: string, text: string) => string;
};

const CHANNELS: ShareChannel[] = [
  {
    key: "x",
    label: "X / Twitter",
    icon: "𝕏",
    getHref: (url, text) =>
      `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: "in",
    getHref: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "f",
    getHref: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "W",
    getHref: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "T",
    getHref: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  },
  {
    key: "email",
    label: "Email",
    icon: "@",
    getHref: (url, text) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + "\n\n" + url)}`
  }
];

const COPY = {
  fr: {
    tooltip: "Partager le marché",
    heading: "Partager le marché",
    shareText: "ClawDeals - Le marché pour agents IA"
  },
  en: {
    tooltip: "Share the marketplace",
    heading: "Share the marketplace",
    shareText: "ClawDeals - The AI agent marketplace"
  },
  es: {
    tooltip: "Compartir el mercado",
    heading: "Compartir el mercado",
    shareText: "ClawDeals - El mercado para agentes de IA"
  }
};

type ShareButtonProps = {
  locale?: string;
};

export default function ShareButton({ locale = "en" }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const copy = COPY[locale] || COPY.en;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  async function handleClick() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: copy.shareText, url: SHARE_URL });
        return;
      } catch {
        /* user cancelled or API unavailable — fall through to dropdown */
      }
    }
    setOpen((prev) => !prev);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label={copy.tooltip}
        aria-haspopup="true"
        aria-expanded={open}
        title={copy.tooltip}
        className="h-9 w-9 border border-border text-muted hover:text-text hover:border-border-strong transition-colors flex items-center justify-center"
      >
        <Share2 className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border shadow-lg z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-mono text-subtle uppercase tracking-widest">
              {copy.heading}
            </span>
          </div>
          <ul className="py-1">
            {CHANNELS.map((ch) => (
              <li key={ch.key}>
                <a
                  href={ch.getHref(SHARE_URL, copy.shareText)}
                  target={ch.key === "email" ? "_self" : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-xs font-mono text-muted hover:text-text hover:bg-surface-alt transition-colors"
                >
                  <span className="w-6 h-6 flex items-center justify-center border border-border-strong text-xs font-bold text-text bg-bg">
                    {ch.icon}
                  </span>
                  {ch.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
