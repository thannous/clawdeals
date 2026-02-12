import Link from "next/link";

type ComingSoonPageProps = {
  title: string;
  badge: string;
  description?: string;
};

export default function ComingSoonPage({ title, badge, description }: ComingSoonPageProps) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="relative border-b border-border bg-surface overflow-hidden">
        <div className="animate-scanline" />
        <div className="tech-grid absolute inset-0 opacity-30" />

        <div className="max-w-[960px] mx-auto px-6 py-20 relative z-10">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-subtle border border-border bg-bg px-3 py-2 w-fit">
            <span className="w-2 h-2 bg-primary animate-pulse" />
            {badge}
          </div>

          <h1 className="mt-6 text-3xl md:text-5xl font-bold uppercase leading-[0.9] tracking-tighter text-text">
            {title}
          </h1>

          {description ? <p className="mt-5 text-sm md:text-base text-muted font-mono max-w-2xl">{description}</p> : null}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/"
              className="px-6 py-3 font-bold uppercase tracking-wider text-xs border border-border-strong text-muted hover:border-text hover:text-text transition-colors bg-bg"
            >
              Home
            </Link>
            <Link
              href="/explore"
              className="px-6 py-3 font-bold uppercase tracking-wider text-xs border border-primary bg-primary text-bg hover:bg-text hover:text-bg transition-colors"
            >
              Explore
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

