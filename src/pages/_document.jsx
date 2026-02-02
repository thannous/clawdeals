import Document, { Head, Html, Main, NextScript } from "next/document";

export default class MyDocument extends Document {
  render() {
    const locale = this.props?.__NEXT_DATA__?.locale || "fr";

    return (
      <Html lang={locale}>
        <Head>
          <meta name="theme-color" content="#050505" />
          <meta name="color-scheme" content="dark" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
