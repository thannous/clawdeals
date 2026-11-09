import Head from "next/head";
import NeonAccountLinkPage from "../../ui/auth/NeonAccountLinkPage";
export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";
export default function NeonLink() {
  return <><Head><title>Link account // CLAWDEALS</title><meta name="robots" content="noindex" /></Head><NeonAccountLinkPage /></>;
}
