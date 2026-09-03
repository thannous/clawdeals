import { useSyncExternalStore } from "react";

import type { ActionReceipt } from "../../webmcp/activity/action-receipts";
import { getWebMcpActionReceipts, subscribeWebMcpActionReceipts } from "../../webmcp/ui-bridge";

const EMPTY_RECEIPTS: ActionReceipt[] = [];

export function useWebMcpReceipts(): ActionReceipt[] {
  return useSyncExternalStore(subscribeWebMcpActionReceipts, getWebMcpActionReceipts, () => EMPTY_RECEIPTS);
}
