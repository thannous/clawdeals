import type { ReactNode } from "react";
import { Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "../styles/globals.css";

// App Router only renders fallbacks such as the 404; keep the Pages Router typography.
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  variable: "--font-chakra-petch",
  weight: ["400", "500", "600", "700"],
  display: "swap"
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "700"],
  display: "swap"
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${chakraPetch.variable} ${jetBrainsMono.variable}`}>
      <body className={chakraPetch.className}>{children}</body>
    </html>
  );
}
