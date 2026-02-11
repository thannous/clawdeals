import React, { useState, useEffect, useRef, useCallback } from "react";

type MissionMessage = { type: "bot" | "user"; text: string };

type MissionCopy = {
  header: string;
  online: string;
  messages: MissionMessage[];
};

type MissionKey = "market_watch" | "admin_core" | "intel_ops" | "comm_relay";

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

/* ── Chat animation hook ── */

function useChatAnimation(messageTypes: ("bot" | "user")[], totalMessages: number) {
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

    const finalTypingDelay = delay;
    timeoutsRef.current.push(setTimeout(() => setShowTyping(true), finalTypingDelay));

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

export default function MissionPhone({ mission, copy }: { mission: MissionKey; copy: MissionCopy }) {
  const messages = copy.messages;
  const messageTypes = messages.map((m) => m.type);
  const { visibleCount, showTyping, containerRef } = useChatAnimation(messageTypes, messages.length);

  return (
    <PhoneFrame header={copy.header} online={copy.online} containerRef={containerRef}>
      {messages.map((msg, i) =>
        msg.type === "bot" ? (
          <BotBubble key={`${mission}-${i}`} visible={visibleCount >= i + 1}>
            <p className="text-xs text-text">{msg.text}</p>
          </BotBubble>
        ) : (
          <UserBubble key={`${mission}-${i}`} visible={visibleCount >= i + 1}>
            <p className="text-xs text-text">{msg.text}</p>
          </UserBubble>
        )
      )}
      <TypingIndicator visible={showTyping} />
    </PhoneFrame>
  );
}
