import React, { useCallback, useEffect, useRef, useState } from "react";

export type PhoneChatMessageType = "bot" | "user";

export type PhoneChatMessage = {
  id?: string;
  type: PhoneChatMessageType;
  content: React.ReactNode;
};

type ChatTone = "primary" | "secondary";

const TONE_STYLES: Record<ChatTone, {
  avatarClass: string;
  userBubbleClass: string;
}> = {
  primary: {
    avatarClass: "bg-primary",
    userBubbleClass:
      "bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)]"
  },
  secondary: {
    avatarClass: "bg-secondary",
    userBubbleClass:
      "bg-[color-mix(in_srgb,var(--color-secondary)_15%,transparent)] border-[color-mix(in_srgb,var(--color-secondary)_30%,transparent)]"
  }
};

function PhoneFrame({
  children,
  header,
  online,
  tone,
  containerRef
}: {
  children: React.ReactNode;
  header: string;
  online: string;
  tone: ChatTone;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <div
      ref={containerRef}
      className="border-2 border-border-strong rounded-[2.5rem] bg-bg w-[380px] max-w-full mx-auto overflow-hidden shadow-2xl"
    >
      <div className="flex justify-center pt-2 pb-1 bg-bg">
        <div className="w-24 h-5 rounded-full bg-border" />
      </div>
      <div className="flex items-center justify-between px-6 py-1 text-xs font-mono text-subtle">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <span>5G</span>
          <div className="w-4 h-2 border border-subtle rounded-sm relative">
            <div className="absolute inset-[1px] right-[3px] bg-subtle" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3 border-y border-border bg-surface">
        <div
          className={`w-8 h-8 ${toneStyle.avatarClass} clip-corner-top-right flex items-center justify-center text-bg text-xs font-bold`}
        >
          CD
        </div>
        <div>
          <div className="text-sm font-bold text-text">{header}</div>
          <div className="flex items-center gap-1 text-xs text-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {online}
          </div>
        </div>
      </div>
      <div className="bg-surface px-3 py-4 h-[520px] overflow-hidden space-y-3">{children}</div>
      <div className="flex justify-center py-2 bg-surface">
        <div className="w-32 h-1 bg-border-strong rounded-full" />
      </div>
    </div>
  );
}

function ChatBubble({
  tone,
  type,
  children
}: {
  tone: ChatTone;
  type: PhoneChatMessageType;
  children: React.ReactNode;
}) {
  const toneStyle = TONE_STYLES[tone];

  if (type === "user") {
    return (
      <div className="flex justify-end chat-bubble">
        <div className={`border rounded-lg rounded-tr-none px-3 py-2 max-w-[270px] ${toneStyle.userBubbleClass}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-end chat-bubble">
      <div
        className={`w-5 h-5 ${toneStyle.avatarClass} clip-corner-top-right flex items-center justify-center text-bg text-xs font-bold shrink-0`}
      >
        CD
      </div>
      <div className="bg-surface-alt border border-border rounded-lg rounded-tl-none px-3 py-2 max-w-[290px]">
        {children}
      </div>
    </div>
  );
}

function TypingIndicator({ visible, tone }: { visible: boolean; tone: ChatTone }) {
  if (!visible) return null;
  const toneStyle = TONE_STYLES[tone];

  return (
    <div className="flex gap-2 items-end chat-bubble">
      <div
        className={`w-5 h-5 ${toneStyle.avatarClass} clip-corner-top-right flex items-center justify-center text-bg text-xs font-bold shrink-0`}
      >
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
}

function useChatAnimation(messagePattern: string) {
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
    const element = containerRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      // Older browsers / test environments: fall back to running the animation immediately.
      setIsInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView) {
      clearTimeouts();
      return;
    }

    clearTimeouts();

    timeoutsRef.current.push(
      setTimeout(() => {
        setVisibleCount(0);
        setShowTyping(false);
      }, 0)
    );

    let delay = 50;
    const totalMessages = messagePattern.length;

    for (let index = 0; index < totalMessages; index += 1) {
      const isBot = messagePattern[index] === "b";

      if (isBot) {
        const typingDelay = delay;
        timeoutsRef.current.push(setTimeout(() => setShowTyping(true), typingDelay));
        delay += 800;
        const revealDelay = delay;
        const visible = index + 1;
        timeoutsRef.current.push(
          setTimeout(() => {
            setShowTyping(false);
            setVisibleCount(visible);
          }, revealDelay)
        );
        delay += 700;
      } else {
        const revealDelay = delay + 400;
        const visible = index + 1;
        timeoutsRef.current.push(setTimeout(() => setVisibleCount(visible), revealDelay));
        delay += 800;
      }
    }

    timeoutsRef.current.push(setTimeout(() => setShowTyping(true), delay));
    timeoutsRef.current.push(
      setTimeout(() => {
        setShowTyping(false);
        setVisibleCount(0);
        setCycle((current) => current + 1);
      }, delay + 3000)
    );

    return clearTimeouts;
  }, [clearTimeouts, cycle, isInView, messagePattern]);

  return { containerRef, showTyping, visibleCount };
}

type AnimatedPhoneChatProps = {
  header: string;
  online: string;
  messages: PhoneChatMessage[];
  tone: ChatTone;
  idPrefix?: string;
};

export default function AnimatedPhoneChat({
  header,
  online,
  messages,
  tone,
  idPrefix = "phone-chat"
}: AnimatedPhoneChatProps) {
  const messagePattern = messages.map((message) => (message.type === "bot" ? "b" : "u")).join("");
  const { containerRef, showTyping, visibleCount } = useChatAnimation(messagePattern);

  return (
    <PhoneFrame header={header} online={online} tone={tone} containerRef={containerRef}>
      {messages.map((message, index) => {
        if (visibleCount < index + 1) return null;
        return (
          <ChatBubble key={message.id || `${idPrefix}-${index}`} tone={tone} type={message.type}>
            {message.content}
          </ChatBubble>
        );
      })}
      <TypingIndicator visible={showTyping} tone={tone} />
    </PhoneFrame>
  );
}
