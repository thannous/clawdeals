import "../styles/globals.css";
import { ThemeProvider } from "../theme/theme-context";
import type { AppProps } from "next/app";
import WebMcpProviderGate from "../webmcp/WebMcpProviderGate";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <WebMcpProviderGate>
        <Component {...pageProps} />
      </WebMcpProviderGate>
    </ThemeProvider>
  );
}
