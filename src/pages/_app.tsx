import "../styles/globals.css";
import { ThemeProvider } from "../theme/theme-context";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import WebMcpProviderGate from "../webmcp/WebMcpProviderGate";
import Footer from "../ui/Footer";

/** Paths where the shared footer is hidden (landing has its own, app pages don't need one). */
const HIDE_FOOTER_PREFIXES = ["/auth", "/console", "/settings", "/device", "/pair", "/start", "/claim", "/dev", "/keys"];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLandingPage = router.pathname === "/";
  const showFooter =
    !isLandingPage && !HIDE_FOOTER_PREFIXES.some((p) => router.pathname.startsWith(p));

  return (
    <ThemeProvider>
      <WebMcpProviderGate>
        <div className={isLandingPage ? undefined : "app-readable-ui"}>
          <Component {...pageProps} />
          {showFooter && <Footer />}
        </div>
      </WebMcpProviderGate>
    </ThemeProvider>
  );
}
