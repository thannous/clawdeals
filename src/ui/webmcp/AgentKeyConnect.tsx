import { FormEvent, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, Eye, EyeOff, KeyRound, LogOut, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { apiRequest, maskApiKey } from "../developer/api";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey, subscribeStoredApiKey } from "../developer/storage";
import {
  clearRoleKeys,
  getRoleKeys,
  otherRole,
  roleForKey,
  setRoleKey,
  subscribeRoleKeys,
  type AgentRole,
  type RoleKeys
} from "./role-keys";

const SERVER_ROLE_KEYS: RoleKeys = {};
const getServerRoleKeys = () => SERVER_ROLE_KEYS;

type ConnectState = "idle" | "checking" | "error";

/**
 * Lets a judge paste the synthetic buyer/seller keys directly on the demo surfaces instead of
 * hunting for the developer console, and switch role in one click once both keys are known.
 */
export default function AgentKeyConnect({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("webmcp");
  const roleLabel = useCallback((role: AgentRole) => t(`agentKey.roles.${role}`), [t]);
  const apiKey = useSyncExternalStore(subscribeStoredApiKey, getStoredApiKey, () => null);
  const roleKeys = useSyncExternalStore(subscribeRoleKeys, getRoleKeys, getServerRoleKeys);
  const activeRole = useMemo(() => roleForKey(apiKey, roleKeys), [apiKey, roleKeys]);
  const switchTarget = activeRole ? otherRole(activeRole) : null;
  const switchKey = switchTarget ? roleKeys[switchTarget] : undefined;

  const [draft, setDraft] = useState("");
  const [draftRole, setDraftRole] = useState<AgentRole>("buyer");
  const [reveal, setReveal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [state, setState] = useState<ConnectState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const showForm = !apiKey || adding;

  const connect = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const key = draft.trim();
      if (!key) return;
      setState("checking");
      setMessage(null);
      try {
        await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      } catch (error: any) {
        setState("error");
        const onSandboxHost = typeof window !== "undefined" && /^sandbox\./i.test(window.location.hostname);
        setMessage(
          error?.status === 401 || error?.status === 403
            ? onSandboxHost
              ? t("agentKey.errors.rejectedSandbox")
              : t("agentKey.errors.rejectedHost")
            : t("agentKey.errors.verify")
        );
        return;
      }
      setRoleKey(draftRole, key);
      setStoredApiKey(key);
      setDraft("");
      setAdding(false);
      setReveal(false);
      setState("idle");
      setMessage(t("agentKey.connected", { role: roleLabel(draftRole) }));
    },
    [draft, draftRole, roleLabel, t]
  );

  const switchRole = useCallback(() => {
    if (!switchKey) return;
    setStoredApiKey(switchKey);
    setMessage(
      t("agentKey.switched", {
        role: switchTarget ? roleLabel(switchTarget).toLocaleLowerCase() : t("agentKey.roles.other")
      })
    );
  }, [roleLabel, switchKey, switchTarget, t]);

  const disconnect = useCallback(() => {
    clearStoredApiKey();
    clearRoleKeys();
    setAdding(false);
    setMessage(t("agentKey.disconnected"));
  }, [t]);

  return (
    <div data-testid="agent-key-connect" className={compact ? "space-y-2" : "space-y-3"}>
      {apiKey ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="agent-key-connected">
          <span className="inline-flex items-center gap-1.5 border border-success/40 bg-success/10 px-2.5 py-1 font-mono text-[11px] text-success">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {activeRole ? t("agentKey.roleKey", { role: roleLabel(activeRole) }) : t("agentKey.agentKey")} ·{" "}
            {maskApiKey(apiKey)}
          </span>
          {switchKey && switchTarget ? (
            <button
              type="button"
              data-testid="agent-key-switch"
              onClick={switchRole}
              className="inline-flex items-center gap-1.5 border border-primary px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary hover:text-bg"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              {t("agentKey.switchTo", { role: roleLabel(switchTarget).toLocaleLowerCase() })}
            </button>
          ) : activeRole && !adding ? (
            <button
              type="button"
              data-testid="agent-key-add-other"
              onClick={() => {
                setDraftRole(otherRole(activeRole));
                setAdding(true);
              }}
              className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t("agentKey.addRole", { role: roleLabel(otherRole(activeRole)).toLocaleLowerCase() })}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="agent-key-disconnect"
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-error hover:text-error"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            {t("agentKey.disconnect")}
          </button>
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={connect} className="flex flex-wrap items-end gap-2" data-testid="agent-key-form">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
              {apiKey
                ? t("agentKey.pasteRole", { role: roleLabel(draftRole).toLocaleLowerCase() })
                : t("agentKey.paste")}
            </span>
            <div className="flex items-stretch border border-border bg-bg focus-within:border-primary">
              <input
                data-testid="agent-key-input"
                type={reveal ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="cd_…"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-xs text-text outline-none"
              />
              <button
                type="button"
                aria-label={reveal ? t("agentKey.hide") : t("agentKey.show")}
                onClick={() => setReveal((value) => !value)}
                className="px-2 text-subtle hover:text-text"
              >
                {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("agentKey.role")}</span>
            <select
              data-testid="agent-key-role"
              value={draftRole}
              onChange={(event) => setDraftRole(event.target.value as AgentRole)}
              className="border border-border bg-bg px-3 py-2 font-mono text-xs text-text"
            >
              <option value="buyer">{t("agentKey.roles.buyer")}</option>
              <option value="seller">{t("agentKey.roles.seller")}</option>
            </select>
          </label>
          <button
            type="submit"
            data-testid="agent-key-submit"
            disabled={state === "checking" || !draft.trim()}
            className="h-[34px] border border-primary bg-primary px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "checking" ? t("agentKey.checking") : t("agentKey.connect")}
          </button>
          {apiKey ? (
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="h-[34px] border border-border px-3 font-mono text-[11px] uppercase tracking-wider text-muted hover:text-text"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </form>
      ) : null}

      {message ? (
        <p
          data-testid="agent-key-message"
          role="status"
          className={`font-mono text-[11px] leading-relaxed ${state === "error" ? "text-error" : "text-muted"}`}
        >
          {message}
        </p>
      ) : null}
      {!apiKey && !message ? (
        <p className="font-mono text-[11px] leading-relaxed text-subtle">{t("agentKey.hint")}</p>
      ) : null}
    </div>
  );
}
