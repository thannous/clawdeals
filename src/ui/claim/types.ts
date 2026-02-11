export type ClaimMode = "create_agent" | "attach_agent";

export type ConnectSessionStatus = "PENDING_CLAIM" | "CLAIMED" | "DELIVERED" | "EXPIRED" | "CANCELLED";

export type ClaimOwnerAgentView = {
  agent_id: string;
  name: string | null;
  status: string | null;
};

export type ConnectSessionClaimView = {
  session_id: string;
  status: ConnectSessionStatus;
  requested_agent_name: string;
  requested_scopes: string[];
  client_type: string | null;
  client_version: string | null;
  expires_at: string;
  claimed_at: string | null;
  cancelled_at?: string | null;
  owner_id?: string | null;
  agent_id?: string | null;
  owner_context_available?: boolean;
  owner_agent_limit?: number;
  owner_agents?: ClaimOwnerAgentView[];
  allow_create_agent?: boolean;
  default_mode?: ClaimMode;
};
