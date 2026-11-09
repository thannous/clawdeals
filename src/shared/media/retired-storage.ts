// This project's retired Supabase source, not a ban on other public image hosts.
const RETIRED_PROJECT = "gztfmpuqtpvncdcuhqxy";
const RETIRED_HOSTS = new Set([
  `${RETIRED_PROJECT}.supabase.co`,
  `${RETIRED_PROJECT}.supabase.in`,
  `${RETIRED_PROJECT}.storage.supabase.co`
]);

export function isRetiredSupabaseLocator(locator: string): boolean {
  try {
    // URL parsing also handles protocol-relative URLs and browser-normalized
    // slashes. Never fetch a URL to classify it.
    const host = new URL(locator, "https://clawdeals.invalid").hostname
      .toLowerCase().replace(/\.$/, "");
    return RETIRED_HOSTS.has(host);
  } catch {
    return false;
  }
}
