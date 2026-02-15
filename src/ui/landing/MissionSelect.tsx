import React, { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, FileText, Globe, MessageSquare } from "lucide-react";
import MissionPhone from "./MissionPhone";
import { SectionHeader } from "./primitives";
import type { MissionKey } from "./types";

type MissionDefinition = {
  key: MissionKey;
  Icon: typeof Activity;
  label: string;
};

const MISSIONS: MissionDefinition[] = [
  { key: "market_watch", Icon: Activity, label: "MARKET_WATCH" },
  { key: "admin_core", Icon: FileText, label: "ADMIN_CORE" },
  { key: "intel_ops", Icon: Globe, label: "INTEL_OPS" },
  { key: "comm_relay", Icon: MessageSquare, label: "COMM_RELAY" }
];

function MissionCard({
  mission,
  index,
  isActive,
  onSelect
}: {
  mission: MissionDefinition;
  index: number;
  isActive: boolean;
  onSelect: (key: MissionKey) => void;
}) {
  const { key, Icon, label } = mission;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls="mission-phone-panel"
      id={`mission-tab-${key}`}
      onClick={() => onSelect(key)}
      className={`group relative bg-surface border p-5 text-left transition-all duration-200 overflow-hidden ${
        isActive
          ? "border-primary bg-primary/5"
          : "border-border hover:border-border-strong"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`font-mono text-xs tracking-widest ${isActive ? "text-primary" : "text-subtle"}`}>
          {String(index + 1).padStart(2, "0")} {"// SELECT"}
        </span>
        <Icon size={18} className={isActive ? "text-primary" : "text-border group-hover:text-muted"} />
      </div>
      <div className={`font-bold text-sm uppercase tracking-wide ${isActive ? "text-text" : "text-muted"}`}>
        {label}
      </div>
      {isActive && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-primary" />
      )}
    </button>
  );
}

export default function MissionSelect() {
  const t = useTranslations("landing");
  const [active, setActive] = useState<MissionKey>("market_watch");

  const messageCount = parseInt(t(`chat.missions.${active}.messageCount`), 10);
  const missionCopy = useMemo(() => ({
    header: t(`chat.missions.${active}.header`),
    online: t(`chat.missions.${active}.online`),
    messages: Array.from({ length: messageCount }, (_, i) => ({
      type: t(`chat.missions.${active}.message_${i}.type`) as "bot" | "user",
      text: t(`chat.missions.${active}.message_${i}.text`)
    }))
  }), [active, messageCount, t]);

  const activeMission = useMemo(
    () => MISSIONS.find((mission) => mission.key === active) || MISSIONS[0],
    [active]
  );
  const activeSummary = useMemo(
    () => missionCopy.messages.find((message) => message.type === "bot")?.text || "",
    [missionCopy]
  );

  const handleMissionSelect = useCallback((missionKey: MissionKey) => {
    setActive((current) => (current === missionKey ? current : missionKey));
  }, []);

  return (
    <div>
      <SectionHeader title={t("headers.missionSelect.title")} subtitle={t("headers.missionSelect.subtitle")} />

      <div role="tablist" aria-label="Mission selection" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {MISSIONS.map((mission, idx) => (
          <MissionCard
            key={mission.key}
            mission={mission}
            index={idx}
            isActive={active === mission.key}
            onSelect={handleMissionSelect}
          />
        ))}
      </div>

      <div className="mb-10 border border-border bg-surface-alt px-4 py-3 flex flex-col gap-1">
        <div className="font-mono text-xs uppercase tracking-widest text-subtle">ACTIVE_MISSION</div>
        <div className="flex items-center gap-2">
          <activeMission.Icon size={14} className="text-primary" />
          <span className="font-bold text-sm uppercase tracking-wide text-text">{activeMission.label}</span>
        </div>
        <p aria-live="polite" className="text-xs font-mono text-muted">{activeSummary}</p>
      </div>

      <div id="mission-phone-panel" role="tabpanel" aria-labelledby={`mission-tab-${active}`} className="flex justify-center">
        <MissionPhone mission={active} copy={missionCopy} />
      </div>
    </div>
  );
}
