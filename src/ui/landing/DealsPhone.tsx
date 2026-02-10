import React, { useState, useEffect, useRef, useCallback } from "react";

type Copy = {
  chat: {
    deals: {
      header: string;
      online: string;
      messages: {
        newDeal: string;
        heatingUp: string;
        votedUp: string;
        newDeal2: string;
        shared: string;
      };
    };
  };
};

/* ── Shared sub-components ── */

const PhoneFrame = ({ children, header, online, containerRef }: {
  children: React.ReactNode; header: string; online: string; containerRef: React.RefObject<HTMLDivElement | null>;
}) => (
  <div ref={containerRef} className="border-2 border-border-strong rounded-[2.5rem] bg-bg w-[320px] max-w-full mx-auto overflow-hidden shadow-2xl">
    <div className="flex justify-center pt-2 pb-1 bg-bg">
      <div className="w-24 h-5 rounded-full bg-border" />
    </div>
    <div className="flex items-center justify-between px-6 py-1 text-[9px] font-mono text-subtle">
      <span>9:41</span>
      <div className="flex items-center gap-1">
        <span>5G</span>
        <div className="w-4 h-2 border border-subtle rounded-sm relative">
          <div className="absolute inset-[1px] right-[3px] bg-subtle" />
        </div>
      </div>
    </div>
    <div className="flex items-center gap-3 px-4 py-3 border-y border-border bg-surface">
      <div className="w-8 h-8 bg-primary clip-corner-top-right flex items-center justify-center text-bg text-xs font-bold">
        CD
      </div>
      <div>
        <div className="text-sm font-bold text-text">{header}</div>
        <div className="flex items-center gap-1 text-[10px] text-subtle">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {online}
        </div>
      </div>
    </div>
    <div className="bg-surface px-3 py-4 h-[420px] overflow-hidden space-y-3">
      {children}
    </div>
    <div className="flex justify-center py-2 bg-surface">
      <div className="w-32 h-1 bg-border-strong rounded-full" />
    </div>
  </div>
);

const BotBubble = ({ children, visible }: { children: React.ReactNode; visible: boolean }) => {
  if (!visible) return null;
  return (
    <div className="flex gap-2 items-end chat-bubble">
      <div className="w-5 h-5 bg-primary clip-corner-top-right flex items-center justify-center text-bg text-[7px] font-bold shrink-0">
        CD
      </div>
      <div className="bg-surface-alt border border-border rounded-lg rounded-tl-none px-3 py-2 max-w-[240px]">
        {children}
      </div>
    </div>
  );
};

const UserBubble = ({ children, visible }: { children: React.ReactNode; visible: boolean }) => {
  if (!visible) return null;
  return (
    <div className="flex justify-end chat-bubble">
      <div className="bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] border border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)] rounded-lg rounded-tr-none px-3 py-2 max-w-[220px]">
        {children}
      </div>
    </div>
  );
};

const TypingIndicator = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <div className="flex gap-2 items-end chat-bubble">
      <div className="w-5 h-5 bg-primary clip-corner-top-right flex items-center justify-center text-bg text-[7px] font-bold shrink-0">
        CD
      </div>
      <div className="bg-surface-alt border border-border rounded-lg rounded-tl-none px-4 py-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0s" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0.15s" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
};

const MiniDealCard = ({ title, price, temp, up, down, tags }: {
  title: string; price: string; temp: number; up: number; down: number; tags: string[];
}) => (
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
      <span className="text-[9px] font-mono text-text">{temp}</span>
      <span className="text-[9px] font-mono text-secondary">{up}</span>
      <span className="text-[9px] font-mono text-red-400">{down}</span>
    </div>
    <div className="flex gap-1">
      {tags.map((t) => (
        <span key={t} className="text-[8px] font-mono px-1 py-0.5 bg-surface-alt text-muted rounded">{t}</span>
      ))}
    </div>
  </div>
);

/* ── Chat animation hook ── */

type MessageType = "bot" | "user";

function useChatAnimation(messageTypes: MessageType[], totalMessages: number) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showTyping, setShowTyping] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [cycle, setCycle] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView) {
      clearTimeouts();
      return;
    }

    clearTimeouts();

    // Reset via setTimeout to satisfy react-hooks/set-state-in-effect
    timeoutsRef.current.push(setTimeout(() => {
      setVisibleCount(0);
      setShowTyping(false);
    }, 0));

    let delay = 50;

    for (let i = 0; i < totalMessages; i++) {
      const isBot = messageTypes[i] === "bot";

      if (isBot) {
        const typingDelay = delay;
        timeoutsRef.current.push(setTimeout(() => setShowTyping(true), typingDelay));
        delay += 800;
        const revealDelay = delay;
        const idx = i + 1;
        timeoutsRef.current.push(setTimeout(() => {
          setShowTyping(false);
          setVisibleCount(idx);
        }, revealDelay));
        delay += 700;
      } else {
        const revealDelay = delay + 400;
        const idx = i + 1;
        timeoutsRef.current.push(setTimeout(() => setVisibleCount(idx), revealDelay));
        delay += 800;
      }
    }

    // Show final typing indicator
    const finalTypingDelay = delay;
    timeoutsRef.current.push(setTimeout(() => setShowTyping(true), finalTypingDelay));

    // Reset and loop
    const resetDelay = delay + 3000;
    timeoutsRef.current.push(setTimeout(() => {
      setShowTyping(false);
      setVisibleCount(0);
      setCycle((c) => c + 1);
    }, resetDelay));

    return clearTimeouts;
  }, [isInView, cycle, totalMessages, messageTypes, clearTimeouts]);

  return { visibleCount, showTyping, containerRef };
}

/* ── Main component ── */

const MESSAGE_TYPES: MessageType[] = ["bot", "bot", "user", "bot", "bot"];

export default function DealsPhone({ copy }: { copy: Copy }) {
  const msg = copy.chat.deals.messages;
  const { visibleCount, showTyping, containerRef } = useChatAnimation(MESSAGE_TYPES, MESSAGE_TYPES.length);

  return (
    <PhoneFrame header={copy.chat.deals.header} online={copy.chat.deals.online} containerRef={containerRef}>
      <BotBubble visible={visibleCount >= 1}>
        <p className="text-xs text-text mb-0.5">{msg.newDeal}</p>
        <MiniDealCard title="GPU Cluster 4h" price="12€" temp={85} up={42} down={3} tags={["GPU", "COMPUTE"]} />
      </BotBubble>

      <BotBubble visible={visibleCount >= 2}>
        <p className="text-xs text-text">{msg.heatingUp}</p>
      </BotBubble>

      <UserBubble visible={visibleCount >= 3}>
        <p className="text-xs text-text">{msg.votedUp}</p>
      </UserBubble>

      <BotBubble visible={visibleCount >= 4}>
        <p className="text-xs text-text mb-0.5">{msg.newDeal2}</p>
        <MiniDealCard title="Bot Telegram Template" price="5€" temp={71} up={31} down={5} tags={["BOT", "TEMPLATE"]} />
      </BotBubble>

      <BotBubble visible={visibleCount >= 5}>
        <p className="text-xs text-text">{msg.shared}</p>
      </BotBubble>

      <TypingIndicator visible={showTyping} />
    </PhoneFrame>
  );
}
