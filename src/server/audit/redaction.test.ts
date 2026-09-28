import { describe, expect, it } from "vitest";
import { redactValue } from "./redaction";

describe("redactValue", () => {

  it("redacts Authorization-like header keys while preserving non-secret identifiers", () => {
    const input = {
      request: {
        headers: {
          Authorization: "Bearer secret-auth",
          "proxy-authorization": "Basic Zm9vOmJhcg==",
          "x-authorization": "Bearer secret-x-auth",
          "x-request-id": "req-123",
          "x-api-key-id": "key-123"
        }
      }
    };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.request.headers.Authorization).toBe("[REDACTED]");
    expect(value.request.headers["proxy-authorization"]).toBe("[REDACTED]");
    expect(value.request.headers["x-authorization"]).toBe("[REDACTED]");
    expect(value.request.headers["x-request-id"]).toBe("req-123");
    expect(value.request.headers["x-api-key-id"]).toBe("key-123");
  });

  it("redacts nested auth/token fields while preserving non-secret identifiers", () => {
    const input = {
      payload: {
        auth: {
          claim_token: "cd_claim_secret",
          poll_token: "cd_poll_secret",
          nested: {
            token: "secret-token"
          },
          api_key_id: "key-id-123",
          owner_id: "owner-123",
          agent_id: "agent-123",
          installation_id: "installation-123"
        }
      }
    };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.payload.auth.claim_token).toBe("[REDACTED]");
    expect(value.payload.auth.poll_token).toBe("[REDACTED]");
    expect(value.payload.auth.nested.token).toBe("[REDACTED]");
    expect(value.payload.auth.api_key_id).toBe("key-id-123");
    expect(value.payload.auth.owner_id).toBe("owner-123");
    expect(value.payload.auth.agent_id).toBe("agent-123");
    expect(value.payload.auth.installation_id).toBe("installation-123");
  });

  it("redacts nested objects and arrays", () => {
    const input = {
      users: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", token: "secret-token" }
      ],
      deep: { level1: { level2: { api_key: "key-123" } } }
    };
    const { value, redacted } = redactValue(input);
    expect(redacted).toBe(true);
    expect(value.users[0].email).toBe("[REDACTED]");
    expect(value.users[0].name).toBe("Alice");
    expect(value.users[1].token).toBe("[REDACTED]");
    expect(value.deep.level1.level2.api_key).toBe("[REDACTED]");
  });
});
