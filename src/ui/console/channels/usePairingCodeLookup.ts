import { useState, useCallback } from "react";

export function usePairingCodeLookup() {
  const [lookupState, setLookupState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<any | null>(null);

  const lookup = useCallback(async (code: string) => {
    if (lookupState === "loading") return;

    const trimmed = String(code || "").trim();
    if (!trimmed) {
      setError("Pairing code is required");
      setLookupState("error");
      return { ok: false, error: "Pairing code is required" };
    }

    setLookupState("loading");
    setError(null);
    setIdentity(null);

    try {
      const resp = await fetch("/api/console/channels/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed })
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setIdentity(data.identity || null);
      setLookupState("done");
      return { ok: true, identity: data.identity || null };
    } catch (err: any) {
      setError(err.message);
      setLookupState("error");
      return { ok: false, error: err.message };
    }
  }, [lookupState]);

  const clear = useCallback(() => {
    setIdentity(null);
    setError(null);
    setLookupState("idle");
  }, []);

  return { lookup, clear, lookupState, error, identity };
}
