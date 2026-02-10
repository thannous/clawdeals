import Document, { Head, Html, Main, NextScript } from "next/document";
import Script from "next/script";
import { DEFAULT_THEME_ID, THEMES } from "../theme/themes";

const THEME_COLOR_MAP = THEMES.reduce<Record<string, string>>((acc, theme) => {
  acc[theme.id] = theme.meta.themeColor || "";
  return acc;
}, {});
const THEME_COLOR_MAP_JSON = JSON.stringify(THEME_COLOR_MAP);
const DEFAULT_THEME_COLOR = THEME_COLOR_MAP[DEFAULT_THEME_ID] || "";
const PREPAINT_THEME_SCRIPT = `(function(){try{var KEY="theme:v1";var LEGACY="theme";var stored=localStorage.getItem(KEY)||"";if(!stored){var legacy=localStorage.getItem(LEGACY)||"";if(legacy){stored=legacy;try{localStorage.setItem(KEY,legacy);localStorage.removeItem(LEGACY);}catch(e){}}}var map=${THEME_COLOR_MAP_JSON};var themeId=stored&&map[stored]?stored:"${DEFAULT_THEME_ID}";document.documentElement.dataset.theme=themeId;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",map[themeId]);}}catch(e){}})();`;

export default class MyDocument extends Document {
  render() {
    // `__NEXT_DATA__` isn't part of the public typing surface.
    const locale = (this.props as any)?.__NEXT_DATA__?.locale || "en";

    return (
      <Html lang={locale} data-theme={DEFAULT_THEME_ID} data-testid="root-html">
        <Head>
          <meta name="theme-color" content={DEFAULT_THEME_COLOR} data-testid="theme-color" />
          <meta name="color-scheme" content="dark" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/site.webmanifest" />
          <Script id="prepaint-theme" strategy="beforeInteractive">
            {PREPAINT_THEME_SCRIPT}
          </Script>
        </Head>
        <body>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[1000] focus:bg-bg focus:text-text focus:border focus:border-primary focus:px-3 focus:py-2 focus:rounded"
          >
            Skip to content
          </a>
          <div id="main-content" role="main" tabIndex={-1}>
            <Main />
          </div>
          <NextScript />
        </body>
      </Html>
    );
  }
}
