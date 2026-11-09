import type { Server } from "node:http";

export const fixturePortKeys = [
  "CLAWDEALS_TEST_MCP_SETUP_PORT",
  "CLAWDEALS_TEST_MCP_STDIO_PORT",
  "CLAWDEALS_TEST_REDIS_MOCK_PORT",
  "CLAWDEALS_TEST_RESPONSE_HTTP_PORT"
] as const;

type FixturePortKey = typeof fixturePortKeys[number];

/** Explicit ports support confined runners; ordinary runs retain ephemeral ports. */
export function fixturePort(key: FixturePortKey, env: Record<string, string | undefined> = process.env): number {
  const ports = new Map<string, number>();
  const used = new Set<number>();
  for (const name of fixturePortKeys) {
    const raw = env[name];
    if (raw === undefined) continue;
    if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${name} must be an integer port from 1024 to 65535`);
    const port = Number(raw);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
      throw new Error(`${name} must be an integer port from 1024 to 65535`);
    }
    if (used.has(port)) throw new Error(`Fixture ports must be distinct: ${name}`);
    used.add(port);
    ports.set(name, port);
  }
  return ports.get(key) ?? 0;
}

/** Never connect to or reuse another listener when the requested port is occupied. */
export async function listenFixture(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing owned fixture address");
  return address.port;
}
