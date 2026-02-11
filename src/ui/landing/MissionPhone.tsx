import React, { useMemo } from "react";
import AnimatedPhoneChat, { type PhoneChatMessage } from "./AnimatedPhoneChat";
import type { LandingCopy, MissionKey } from "./types";

type MissionCopy = LandingCopy["chat"]["missions"][MissionKey];

export default function MissionPhone({ mission, copy }: { mission: MissionKey; copy: MissionCopy }) {
  const messages = useMemo<PhoneChatMessage[]>(
    () =>
      copy.messages.map((message, index) => ({
        id: `${mission}-${index}`,
        type: message.type,
        content: <p className="text-xs text-text">{message.text}</p>
      })),
    [copy.messages, mission]
  );

  return (
    <AnimatedPhoneChat
      header={copy.header}
      online={copy.online}
      tone="primary"
      idPrefix={mission}
      messages={messages}
    />
  );
}
