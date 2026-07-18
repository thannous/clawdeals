import SeoGuidePage, { getSeoGuideServerSideProps as withMessages, type SeoGuidePageProps } from "../../ui/guides/SeoGuidePage";

export const getServerSideProps: typeof withMessages = async (context) => withMessages(context);

export default function AiAgentSpendingApprovalGuide(props: SeoGuidePageProps) {
  return <SeoGuidePage {...props} slug="ai-agent-human-approval-spending" />;
}
