import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";

import v1Handler from "../../v1/owner/installations";

// Browser-friendly wrapper: owner identity is injected server-side for console usage.
export default injectConsoleOpsOwner(v1Handler);

