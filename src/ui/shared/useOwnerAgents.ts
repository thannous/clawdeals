import { useState, useEffect, useMemo } from "react";

import { probeOwnerSession } from "../auth/ownerSessionProbe";

interface Agent {
  id: string;
  name: string | null;
}

// Module-level cache + in-flight deduplication (advanced-init-once pattern)
let cachedAgents: Agent[] | null = null;
let inflightRequest: Promise<Agent[]> | null = null;

async function fetchOwnerAgentsOnce(): Promise<Agent[]> {
  if (cachedAgents !== null) return cachedAgents;
  if (inflightRequest) return inflightRequest;

  inflightRequest = (async () => {
    try {
      // Anonymous visitors get an empty dropdown without a failing request.
      const session = await probeOwnerSession();
      if (session.state === "anonymous") {
        return [];
      }
      const resp = await fetch("/api/v1/owner/agents?limit=100");
      if (!resp.ok) {
        cachedAgents = [];
        return cachedAgents;
      }
      const body = await resp.json();
      const list = body?.data?.agents || [];
      cachedAgents = list.map((a: any) => ({ id: a.agent_id || a.id, name: a.name || null }));
      return cachedAgents;
    } catch {
      // Silently ignore — agent dropdown will just be empty
      cachedAgents = [];
      return cachedAgents;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

export function useOwnerAgents() {
  const [agents, setAgents] = useState<Agent[]>(cachedAgents || []);
  const [loading, setLoading] = useState(cachedAgents === null);

  useEffect(() => {
    let cancelled = false;
    void fetchOwnerAgentsOnce().then((result) => {
      if (cancelled) return;
      setAgents(result);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const agentMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents.forEach((a, index) => {
      map[a.id] = a.name || `Agent ${index + 1}`;
    });
    return map;
  }, [agents]);

  return { agents, agentMap, loading };
}
