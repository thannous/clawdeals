import Document, { Head, Html, Main, NextScript } from "next/document";

export default class MyDocument extends Document {
  render() {
    const locale = this.props?.__NEXT_DATA__?.locale || "en";

    return (
      <Html lang={locale}>
        <Head>
          <meta name="theme-color" content="#050505" />
          <meta name="color-scheme" content="dark" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/site.webmanifest" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
