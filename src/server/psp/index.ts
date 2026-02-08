import type { PSPAdapter, PspMode, PspProvider } from "./psp-adapter";
import { MockPspAdapter } from "./mock-psp-adapter";

export function createPspAdapter({ provider, mode }: { provider: PspProvider; mode: PspMode }): PSPAdapter {
  if (provider === "mock") {
    return new MockPspAdapter({ mode });
  }
  // v0 posture: only mock is supported.
  throw Object.assign(new Error("Unsupported PSP provider"), { status: 400, code: "PSP_PROVIDER_UNSUPPORTED" });
}

