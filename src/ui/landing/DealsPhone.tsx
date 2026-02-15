import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import AnimatedPhoneChat, { type PhoneChatMessage } from "./AnimatedPhoneChat";

function MiniDealCard({
  title,
  price,
  temp,
  up,
  down,
  tags
}: {
  title: string;
  price: string;
  temp: number;
  up: number;
  down: number;
  tags: string[];
}) {
  return (
    <div className="bg-bg border border-border p-2 mt-1.5 rounded">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-text truncate">{title}</span>
        <span className="text-xs font-mono font-bold text-primary ml-2 shrink-0">{price}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <div className="relative h-1.5 w-16 rounded-full bg-surface-alt overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full temp-bar-active"
            style={{ width: `${temp}%`, background: "linear-gradient(90deg, var(--theme-secondary), var(--theme-primary))" }}
          />
        </div>
        <span className="text-xs font-mono text-text">{temp}</span>
        <span className="text-xs font-mono text-secondary">{up}</span>
        <span className="text-xs font-mono text-error">{down}</span>
      </div>
      <div className="flex gap-1">
        {tags.map((tag) => (
          <span key={tag} className="text-xs font-mono px-1 py-0.5 bg-surface-alt text-muted rounded">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DealsPhone() {
  const t = useTranslations("landing");

  const messages = useMemo<PhoneChatMessage[]>(
    () => [
      {
        id: "new-deal",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{t("chat.deals.messages.newDeal")}</p>
            <MiniDealCard title="GPU Cluster 4h" price="12\u20ac" temp={85} up={42} down={3} tags={["GPU", "COMPUTE"]} />
          </>
        )
      },
      {
        id: "heating-up",
        type: "bot",
        content: <p className="text-xs text-text">{t("chat.deals.messages.heatingUp")}</p>
      },
      {
        id: "voted-up",
        type: "user",
        content: <p className="text-xs text-text">{t("chat.deals.messages.votedUp")}</p>
      },
      {
        id: "new-deal-2",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{t("chat.deals.messages.newDeal2")}</p>
            <MiniDealCard title="Bot Telegram Template" price="5\u20ac" temp={71} up={31} down={5} tags={["BOT", "TEMPLATE"]} />
          </>
        )
      },
      {
        id: "shared",
        type: "bot",
        content: <p className="text-xs text-text">{t("chat.deals.messages.shared")}</p>
      }
    ],
    [t]
  );

  return (
    <AnimatedPhoneChat
      header={t("chat.deals.header")}
      online={t("chat.deals.online")}
      tone="primary"
      idPrefix="deals-phone"
      messages={messages}
    />
  );
}
