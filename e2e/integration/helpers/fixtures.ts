/* eslint-disable react-hooks/rules-of-hooks -- Playwright names its fixture callback `use`; this file contains no React hooks. */
import {
  expect,
  request as requestFactory,
  test as base,
  type APIRequestContext
} from "@playwright/test";

import { getApiBaseUrl } from "./env";
import { expectStatus } from "./http";
import { createSupabaseAdmin, ensureOpsConsoleAgent } from "./supabase";

const OPS_CONSOLE_EMAIL = "ops-console@clawdeals.internal";

export async function createConsoleOpsRequestContext(): Promise<APIRequestContext> {
  await ensureOpsConsoleAgent(createSupabaseAdmin());

  const context = await requestFactory.newContext({
    baseURL: getApiBaseUrl()
  });

  try {
    const start = await context.post("/api/v1/auth/login:start", {
      data: { email: OPS_CONSOLE_EMAIL }
    });
    await expectStatus(start, 201);
    const startBody = await start.json();
    const sessionId = startBody?.data?.session_id;
    const token = startBody?.data?.session_token;

    if (!sessionId || !token) {
      throw new Error("Console ops login did not return a test session token");
    }

    const confirm = await context.post("/api/v1/auth/login:confirm", {
      data: { session_id: sessionId, token }
    });
    await expectStatus(confirm, 200);

    return context;
  } catch (error) {
    await context.dispose();
    throw error;
  }
}

type IntegrationWorkerFixtures = {
  consoleRequest: APIRequestContext;
  consoleCookieHeader: string;
};

export const test = base.extend<{}, IntegrationWorkerFixtures>({
  consoleRequest: [async ({}, use) => {
      const context = await createConsoleOpsRequestContext();
      try {
        await use(context);
      } finally {
        await context.dispose();
      }
    },
    { scope: "worker" }
  ],

  consoleCookieHeader: [async ({ consoleRequest }, use) => {
      const state = await consoleRequest.storageState();
      const cookieHeader = state.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      if (!cookieHeader) {
        throw new Error("Console ops request context has no session cookie");
      }
      await use(cookieHeader);
    },
    { scope: "worker" }
  ]
});

export const consoleTest = test.extend({
  request: async ({ consoleRequest }, use) => {
    await use(consoleRequest);
  }
});

export const hybridTest = test.extend({
  request: async ({ request, consoleRequest }, use) => {
    const routedRequest = new Proxy(request, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;

        if (["get", "post", "put", "patch", "delete", "head", "fetch"].includes(String(property))) {
          return (url: string, ...args: unknown[]) => {
            const context = String(url).startsWith("/api/console/") ? consoleRequest : target;
            return (context as any)[property](url, ...args);
          };
        }

        return value.bind(target);
      }
    });

    await use(routedRequest);
  }
});

export { expect };
