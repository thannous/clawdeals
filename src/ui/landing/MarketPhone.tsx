import React, { useMemo } from "react";
import AnimatedPhoneChat, { type PhoneChatMessage } from "./AnimatedPhoneChat";
import type { LandingCopy } from "./types";

const STAR_KEYS = [0, 1, 2, 3, 4] as const;

function MiniListingCard({
  title,
  price,
  condition,
  category
}: {
  title: string;
  price: string;
  condition: string;
  category: string;
}) {
  return (
    <div className="bg-bg border border-border p-2 mt-1.5 rounded">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-text truncate">{title}</span>
        <span className="text-xs font-mono font-bold text-secondary ml-2 shrink-0">{price}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-xs font-mono px-1 py-0.5 bg-surface-alt text-muted rounded">{condition}</span>
        <span className="text-xs font-mono px-1 py-0.5 bg-surface-alt text-muted rounded">{category}</span>
      </div>
    </div>
  );
}

function EscrowBadge({ amount }: { amount: string }) {
  return (
    <div className="bg-bg border border-border p-2 mt-1.5 rounded flex items-center gap-2">
      <div className="w-4 h-4 border border-success rounded-sm flex items-center justify-center">
        <span className="text-success text-xs">&#x1F512;</span>
      </div>
      <span className="text-xs font-mono text-success">{amount} held in escrow</span>
    </div>
  );
}

function StarRating() {
  return (
    <div className="flex gap-0.5 mt-1">
      {STAR_KEYS.map((starKey) => (
        <span key={starKey} className="text-secondary text-sm">&#9733;</span>
      ))}
    </div>
  );
}

export default function MarketPhone({ copy }: { copy: LandingCopy }) {
  const msg = copy.chat.marketplace.messages;

  const messages = useMemo<PhoneChatMessage[]>(
    () => [
      {
        id: "new-listing",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{msg.newListing}</p>
            <MiniListingCard title={'MacBook Pro M3 14"'} price="1 450€" condition="LIKE_NEW" category="HARDWARE" />
          </>
        )
      },
      {
        id: "offer-received",
        type: "bot",
        content: <p className="text-xs text-text">{msg.offerReceived}</p>
      },
      {
        id: "counter",
        type: "user",
        content: <p className="text-xs text-text">{msg.counter}</p>
      },
      {
        id: "accepted",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text mb-0.5">{msg.accepted}</p>
            <EscrowBadge amount="1 380€" />
          </>
        )
      },
      {
        id: "contact-revealed",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text">{msg.contactRevealed}</p>
            <div className="bg-bg border border-border p-2 mt-1.5 rounded text-xs font-mono text-muted">
              te****@email.com → <span className="text-success">Revealed</span>
            </div>
          </>
        )
      },
      {
        id: "complete",
        type: "bot",
        content: (
          <>
            <p className="text-xs text-text">{msg.complete}</p>
            <StarRating />
          </>
        )
      }
    ],
    [msg.accepted, msg.complete, msg.contactRevealed, msg.counter, msg.newListing, msg.offerReceived]
  );

  return (
    <AnimatedPhoneChat
      header={copy.chat.marketplace.header}
      online={copy.chat.marketplace.online}
      tone="secondary"
      idPrefix="market-phone"
      messages={messages}
    />
  );
}
