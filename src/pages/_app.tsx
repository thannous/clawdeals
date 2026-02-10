import "../styles/globals.css";
import { ThemeProvider } from "../theme/theme-context";
import type { AppProps } from "next/app";
import WebMcpProvider from "../webmcp/WebMcpProvider";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <WebMcpProvider>
        <Component {...pageProps} />
      </WebMcpProvider>
    </ThemeProvider>
  );
}
