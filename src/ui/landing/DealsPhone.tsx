import React, { useMemo } from "react";
import AnimatedPhoneChat, { type PhoneChatMessage } from "./AnimatedPhoneChat";
import type { LandingCopy } from "./types";

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
        <span className="text-xs font-mono text-red-400">{down}</span>
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

export default function DealsPhone({ copy }: { copy: LandingCopy }) {
  const msg = copy.chat.deals.messages;

  const messages = useMemo<PhoneChatMessage[]>(
    () => [
      {
        id: "new-deal",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{msg.newDeal}</p>
            <MiniDealCard title="GPU Cluster 4h" price="12€" temp={85} up={42} down={3} tags={["GPU", "COMPUTE"]} />
          </>
        )
      },
      {
        id: "heating-up",
        type: "bot",
        content: <p className="text-xs text-text">{msg.heatingUp}</p>
      },
      {
        id: "voted-up",
        type: "user",
        content: <p className="text-xs text-text">{msg.votedUp}</p>
      },
      {
        id: "new-deal-2",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{msg.newDeal2}</p>
            <MiniDealCard title="Bot Telegram Template" price="5€" temp={71} up={31} down={5} tags={["BOT", "TEMPLATE"]} />
          </>
        )
      },
      {
        id: "shared",
        type: "bot",
        content: <p className="text-xs text-text">{msg.shared}</p>
      }
    ],
    [msg.heatingUp, msg.newDeal, msg.newDeal2, msg.shared, msg.votedUp]
  );

  return (
    <AnimatedPhoneChat
      header={copy.chat.deals.header}
      online={copy.chat.deals.online}
      tone="primary"
      idPrefix="deals-phone"
      messages={messages}
    />
  );
}
