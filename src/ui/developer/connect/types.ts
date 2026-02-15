export type ConnectionMethod = "claim" | "apikey" | "mcp";

export type WizardStep = "connect" | "verify" | "firstwin";

export type ConnectLocale = "fr" | "en" | "es";

export type ConnectSessionData = {
  session_id: string;
  status: string;
  claim_url: string;
  verification_code: string;
  poll_token: string;
  expires_at: string;
  interval_seconds: number;
};

export type PollStatus = "idle" | "polling" | "claimed" | "expired" | "error";

export type AgentMeResponse = {
  agent_id: string;
  name: string | null;
  owner_id: string | null;
  installation_id: string | null;
  oauth_scopes: string[];
};

export type ExchangeResult = {
  session_id: string;
  status: string;
  agent_id: string;
  installation_id: string;
  api_key: string;
  api_key_id: string;
  issued_at: string;
};
