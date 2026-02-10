import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import type { PropsWithChildren } from "react";

import { isWebMcpEnabled, shouldRegisterOnRoute } from "./config";

const WebMcpProviderLazy = dynamic(() => import("./WebMcpProvider"), { loading: () => null });

export default function WebMcpProviderGate({ children }: PropsWithChildren) {
  const router = useRouter();

  if (!isWebMcpEnabled()) return <>{children}</>;
  if (!shouldRegisterOnRoute(router.pathname || "")) return <>{children}</>;

  return <WebMcpProviderLazy>{children}</WebMcpProviderLazy>;
}

