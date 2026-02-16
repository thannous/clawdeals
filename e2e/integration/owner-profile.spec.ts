import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";

assertIntegrationEnv();

test.describe.serial("Integration: Owner Profile", () => {
  test.setTimeout(60000);

  let ownerId: string;

  test.beforeAll(async () => {
    ownerId = randomId();
  });

  test("PATCH /owner with profile fields creates owner with profile", async ({ request }) => {
    const email = `itest+profile+${ownerId.slice(0, 8)}@example.com`;
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        email,
        display_name: "Test User",
        bio: "Integration test bio",
        avatar_url: "/avatars/default-3.svg",
        city: "Paris",
        state_region: "Île-de-France",
        country: "FR",
        show_email: true,
        available: true,
      },
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.data.display_name).toBe("Test User");
    expect(body.data.bio).toBe("Integration test bio");
    expect(body.data.avatar_url).toBe("/avatars/default-3.svg");
    expect(body.data.city).toBe("Paris");
    expect(body.data.state_region).toBe("Île-de-France");
    expect(body.data.country).toBe("FR");
    expect(body.data.show_email).toBe(true);
    expect(body.data.available).toBe(true);
  });

  test("GET /owner returns profile fields", async ({ request }) => {
    const res = await request.get("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.data.display_name).toBe("Test User");
    expect(body.data.bio).toBe("Integration test bio");
    expect(body.data.avatar_url).toBe("/avatars/default-3.svg");
    expect(body.data.city).toBe("Paris");
    expect(body.data.country).toBe("FR");
    expect(body.data.show_email).toBe(true);
    expect(body.data.available).toBe(true);
  });

  test("PATCH /owner partial update only changes provided fields", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        display_name: "Updated Name",
        city: "Lyon",
      },
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.data.display_name).toBe("Updated Name");
    expect(body.data.city).toBe("Lyon");
    // Other fields should remain unchanged
    expect(body.data.bio).toBe("Integration test bio");
    expect(body.data.country).toBe("FR");
    expect(body.data.avatar_url).toBe("/avatars/default-3.svg");
  });

  test("PATCH /owner can clear optional fields with null", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        bio: null,
        state_region: null,
      },
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.data.bio).toBeNull();
    expect(body.data.state_region).toBeNull();
    // Unchanged fields
    expect(body.data.display_name).toBe("Updated Name");
    expect(body.data.city).toBe("Lyon");
  });

  test("PATCH /owner rejects display_name > 60 chars", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        display_name: "A".repeat(61),
      },
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("display_name");
  });

  test("PATCH /owner rejects country > 2 chars", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        country: "FRA",
      },
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("country");
  });

  test("PATCH /owner rejects non-boolean show_email", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        show_email: "yes",
      },
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("show_email");
  });

  test("PATCH /owner rejects bio > 2000 chars", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        bio: "x".repeat(2001),
      },
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("bio");
  });

  test("PATCH /owner rejects empty body", async ({ request }) => {
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {},
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("At least one field");
  });

  test("PATCH /owner can update profile and email in one call", async ({ request }) => {
    const newEmail = `itest+combo+${ownerId.slice(0, 8)}@example.com`;
    const res = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        email: newEmail,
        display_name: "Combo Update",
        available: false,
      },
    });
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.data.display_name).toBe("Combo Update");
    expect(body.data.available).toBe(false);
    // Email changed ⇒ verification reset
    expect(body.data.email_verified_at).toBeNull();
  });
});
