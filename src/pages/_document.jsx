import Document, { Head, Html, Main, NextScript } from "next/document";
import { DEFAULT_THEME_ID, THEMES } from "../theme/themes";

export default class MyDocument extends Document {
  render() {
    const locale = this.props?.__NEXT_DATA__?.locale || "en";
    const themeColorMap = THEMES.reduce((acc, theme) => {
      acc[theme.id] = theme.meta.themeColor;
      return acc;
    }, {});
    const themeColorMapJson = JSON.stringify(themeColorMap);
    const prepaintScript = `(function(){try{var KEY="theme:v1";var LEGACY="theme";var stored=localStorage.getItem(KEY)||"";if(!stored){var legacy=localStorage.getItem(LEGACY)||"";if(legacy){stored=legacy;try{localStorage.setItem(KEY,legacy);localStorage.removeItem(LEGACY);}catch(e){}}}var map=${themeColorMapJson};var themeId=stored&&map[stored]?stored:"${DEFAULT_THEME_ID}";document.documentElement.dataset.theme=themeId;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",map[themeId]);}}catch(e){}})();`;
    const defaultThemeColor = themeColorMap[DEFAULT_THEME_ID];

    return (
      <Html lang={locale} data-theme={DEFAULT_THEME_ID} data-testid="root-html">
        <Head>
          <meta name="theme-color" content={defaultThemeColor} data-testid="theme-color" />
          <meta name="color-scheme" content="dark" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/site.webmanifest" />
          <script dangerouslySetInnerHTML={{ __html: prepaintScript }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
