export type DeviceAuthorizationStatus = "PENDING" | "AUTHORIZED" | "DENIED" | "EXPIRED" | (string & {});

export type DeviceAuthorizationView = {
  authorization_id: string;
  status: DeviceAuthorizationStatus;
  client_id: string;
  requested_scopes: string[];
  requested_agent_name: string | null;
  expires_at: string | null;
  owner_id: string | null;
  agent_id: string | null;
  authorized_at: string | null;
  denied_at: string | null;
};

export type DeviceMode = "create_agent" | "attach_agent";

