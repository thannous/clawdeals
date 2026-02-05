import Document, { Head, Html, Main, NextScript } from "next/document";
import { DEFAULT_THEME_ID, THEMES } from "../theme/themes";

const THEME_COLOR_MAP = THEMES.reduce((acc, theme) => {
  acc[theme.id] = theme.meta.themeColor;
  return acc;
}, {});
const THEME_COLOR_MAP_JSON = JSON.stringify(THEME_COLOR_MAP);
const DEFAULT_THEME_COLOR = THEME_COLOR_MAP[DEFAULT_THEME_ID];
const PREPAINT_THEME_SCRIPT = `(function(){try{var KEY="theme:v1";var LEGACY="theme";var stored=localStorage.getItem(KEY)||"";if(!stored){var legacy=localStorage.getItem(LEGACY)||"";if(legacy){stored=legacy;try{localStorage.setItem(KEY,legacy);localStorage.removeItem(LEGACY);}catch(e){}}}var map=${THEME_COLOR_MAP_JSON};var themeId=stored&&map[stored]?stored:"${DEFAULT_THEME_ID}";document.documentElement.dataset.theme=themeId;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",map[themeId]);}}catch(e){}})();`;

export default class MyDocument extends Document {
  render() {
    const locale = this.props?.__NEXT_DATA__?.locale || "en";

    return (
      <Html lang={locale} data-theme={DEFAULT_THEME_ID} data-testid="root-html">
        <Head>
          <meta name="theme-color" content={DEFAULT_THEME_COLOR} data-testid="theme-color" />
          <meta name="color-scheme" content="dark" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/site.webmanifest" />
          <script dangerouslySetInnerHTML={{ __html: PREPAINT_THEME_SCRIPT }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
