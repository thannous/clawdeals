import { useRouter } from "next/router";
import type { PropsWithChildren } from "react";

import { isWebMcpRuntimeEnabled, shouldRegisterOnRoute } from "./config";
import WebMcpProvider from "./WebMcpProvider";

export default function WebMcpProviderGate({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = router.pathname || "";

  if (!isWebMcpRuntimeEnabled(pathname)) return <>{children}</>;
  if (!shouldRegisterOnRoute(pathname)) return <>{children}</>;

  return <WebMcpProvider>{children}</WebMcpProvider>;
}
