export type ConnectSessionStatus = "PENDING_CLAIM" | "CLAIMED" | "DELIVERED" | "EXPIRED" | "CANCELLED";

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
};

export type ClaimMode = "create_agent" | "attach_agent";
