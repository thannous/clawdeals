import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useTranslations } from "next-intl";
import { loadMessages } from "../../shared/i18n";
import { parseComparisonIds, type ComparisonPriority } from "../../lib/smartphone-comparison";
import SmartphoneComparisonPage from "../../ui/comparison/SmartphoneComparisonPage";

type Props = { initialIds: string[]; invalidIds: boolean; initialPriority: ComparisonPriority };
const NAMESPACES = ["comparison", "passport", "browse", "landing", "nav", "footer"] as const;

export const getServerSideProps: GetServerSideProps<Props> = async ({ locale, query, res }) => {
  let initialIds: string[] = [];
  let invalidIds = false;
  if (query.ids !== undefined) {
    try { initialIds = parseComparisonIds(query.ids); } catch { invalidIds = true; }
  }
  const initialPriority = typeof query.priority === "string" && ["battery", "condition"].includes(query.priority) ? query.priority as ComparisonPriority : "budget";
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { initialIds, invalidIds, initialPriority, messages: await loadMessages(locale || "en", { namespaces: NAMESPACES }) } };
};
export default function CompareRoute(props: Props) {
  const t = useTranslations("comparison");
  return <><Head><title>{t("pageTitle")}</title><meta name="description" content={t("description")} /><meta name="robots" content="noindex" /></Head><SmartphoneComparisonPage {...props} /></>;
}
