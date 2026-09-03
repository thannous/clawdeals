import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found // CLAWDEALS",
  description: "This page does not exist or has been moved.",
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-6"
    >
      <h1 className="text-8xl font-bold text-primary tracking-tighter mb-4">404</h1>
      <p className="text-lg text-muted font-mono mb-8">
        This page doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link
          href="/"
          className="h-10 px-5 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center"
        >
          Back to home
        </Link>
        <Link
          href="/browse"
          className="h-10 px-5 border border-border text-muted hover:text-text hover:border-border-strong transition-all font-bold text-xs uppercase tracking-widest flex items-center"
        >
          Browse listings
        </Link>
      </div>
    </main>
  );
}
