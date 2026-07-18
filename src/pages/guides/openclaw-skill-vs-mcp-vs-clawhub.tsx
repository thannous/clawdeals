import SeoGuidePage, { getSeoGuideServerSideProps as withMessages, type SeoGuidePageProps } from "../../ui/guides/SeoGuidePage";

export const getServerSideProps: typeof withMessages = async (context) => withMessages(context);

export default function OpenClawInstallMethodsGuide(props: SeoGuidePageProps) {
  return <SeoGuidePage {...props} slug="openclaw-skill-vs-mcp-vs-clawhub" />;
}
