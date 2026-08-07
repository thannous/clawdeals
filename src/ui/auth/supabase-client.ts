import { getBrowserAuthClient } from "./browser-auth-client";

/** @deprecated Use getBrowserAuthClient. Kept during the rollback window. */
export function getBrowserSupabaseClient() {
  return getBrowserAuthClient();
}

export { getBrowserAuthClient };
