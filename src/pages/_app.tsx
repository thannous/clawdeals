import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "../theme/theme-context";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import WebMcpProviderGate from "../webmcp/WebMcpProviderGate";
import Footer from "../ui/Footer";

/** Paths where the shared footer is hidden (landing has its own, app pages don't need one). */
const HIDE_FOOTER_PREFIXES = ["/auth", "/console", "/settings", "/device", "/pair", "/start", "/claim", "/dev", "/keys"];
const EMPTY_MESSAGES = {};

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLandingPage = router.pathname === "/";
  const showFooter =
    !isLandingPage && !HIDE_FOOTER_PREFIXES.some((p) => router.pathname.startsWith(p));
  const locale = router.locale === "fr" || router.locale === "es" ? router.locale : "en";
  const usingFallbackMessages = !pageProps.messages;
  const messages = pageProps.messages || EMPTY_MESSAGES;

  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Paris"
      messages={messages}
      getMessageFallback={({ namespace, key }) => [namespace, key].filter(Boolean).join(".")}
      onError={(error) => {
        const code = (error as any)?.code;
        if (code === "MISSING_MESSAGE") return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[i18n] next-intl error", error);
        }
      }}
    >
      {usingFallbackMessages && process.env.NODE_ENV !== "production" && (
        <div className="sr-only" data-testid="i18n-fallback-runtime-warning">
          i18n fallback messages applied
        </div>
      )}
      <ThemeProvider>
        <WebMcpProviderGate>
          <div className={isLandingPage ? undefined : "app-readable-ui"}>
            <Component {...pageProps} />
            {showFooter && <Footer />}
          </div>
        </WebMcpProviderGate>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
