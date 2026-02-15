import { useState, useEffect, useMemo } from "react";

interface Agent {
  id: string;
  name: string | null;
}

// Module-level cache + init guard (advanced-init-once pattern)
let didInit = false;
let cachedAgents: Agent[] | null = null;

export function useOwnerAgents() {
  const [agents, setAgents] = useState<Agent[]>(cachedAgents || []);
  const [loading, setLoading] = useState(cachedAgents === null);

  useEffect(() => {
    if (didInit) return;
    didInit = true;

    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch("/api/v1/owner/agents?limit=100");
        if (!resp.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const body = await resp.json();
        const list = body?.data?.agents || [];
        const mapped = list.map((a: any) => ({ id: a.agent_id || a.id, name: a.name || null }));
        cachedAgents = mapped;
        if (!cancelled) setAgents(mapped);
      } catch {
        // silently ignore — agent dropdown will just be empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
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
