import Link from "next/link";
import type { ProjectCandidate } from "../../shared/project-missions";
import { useLocale, useTranslations } from "next-intl";
import { ProjectFailure, secondaryClass } from "./ProjectShell";
import { useProjectResource } from "./projectClient";

type Conversation = {
  seller_agent_id: string; thread_id: string; listing_ids: string[];
  messages: Array<{ message_id: string; sender_type: string; sender_id: string; type: string; payload: { type?: string; text?: string }; redacted: boolean; created_at: string }>;
};

export default function ProjectConversations({ missionId, agentId, candidates }: { missionId: string; agentId: string; candidates: ProjectCandidate[] }) {
  const t = useTranslations("projectMissions");
  const locale = useLocale();
  const { data, loading, error, reload } = useProjectResource<{ items: Conversation[] }>(`/${missionId}/conversations`);
  const listings = new Map(candidates.map(candidate => [candidate.listing_id, candidate]));
  const conversations = [...(data?.items || [])].sort((a, b) => a.seller_agent_id.localeCompare(b.seller_agent_id) || a.thread_id.localeCompare(b.thread_id));
  return <section className="space-y-4 border-t border-border pt-5" aria-labelledby="project-conversations-title" data-testid="project-conversations">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="project-conversations-title" className="text-xl font-semibold text-text">{t("conversations")}</h3><button className={secondaryClass} disabled={loading} onClick={reload}>{t("refreshReplies")}</button></div>
    <p className="max-w-3xl text-sm text-muted">{t("conversationHint")}</p>
    {loading ? <p role="status" className="text-sm text-muted">{t("loading")}</p> : error ? <ProjectFailure code={error} retry={reload} /> : !data?.items.length ? <p className="text-sm text-muted">{t("noReplies")}</p> :
      <div className="grid gap-4 lg:grid-cols-2">{conversations.map(conversation => <article key={conversation.thread_id} className="min-w-0 border border-border bg-surface p-4">
        <h4 className="font-semibold text-text">{t("sellerConversation")}</h4>
        <ul className="mb-4 mt-2 space-y-1 text-sm text-primary">{conversation.listing_ids.map(listingId => <li key={listingId}><Link className="underline underline-offset-4 [overflow-wrap:anywhere]" href={`/browse/${listingId}`}>{listings.get(listingId)?.title || t("originalListing")}</Link></li>)}</ul>
        {conversation.messages.length ? <ol className="space-y-4">{conversation.messages.map(message => <li key={message.message_id} className={`space-y-2 border-l-2 pl-3 ${message.sender_id === agentId ? "border-border" : "border-primary"}`}>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>{t(message.sender_type?.toLowerCase() === "system" ? "systemMessage" : message.sender_id === agentId ? "yourAgent" : "sellerReply")}</span><time dateTime={message.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(message.created_at))}</time></div>
          <p className="whitespace-pre-wrap text-sm text-text [overflow-wrap:anywhere]">{typeof message.payload?.text === "string" ? message.payload.text : t("protectedMessage")}</p>
          {message.redacted ? <p className="text-xs text-muted">{t("redactedMessage")}</p> : null}
        </li>)}</ol> : <p className="text-sm text-muted">{t("noReplies")}</p>}
      </article>)}</div>}
    <p className="text-xs text-muted">{t("conversationLimits")}</p>
  </section>;
}
