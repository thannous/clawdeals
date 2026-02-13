import "../styles/globals.css";
import { ThemeProvider } from "../theme/theme-context";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import WebMcpProviderGate from "../webmcp/WebMcpProviderGate";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLandingPage = router.pathname === "/";

  return (
    <ThemeProvider>
      <WebMcpProviderGate>
        <div className={isLandingPage ? undefined : "app-readable-ui"}>
          <Component {...pageProps} />
        </div>
      </WebMcpProviderGate>
    </ThemeProvider>
  );
}
