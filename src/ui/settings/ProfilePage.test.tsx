import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  show: vi.fn(),
  fetch: vi.fn(),
  router: {
    asPath: "/settings/profile?tab=public",
    replace: vi.fn(),
    push: vi.fn()
  }
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("next/image", () => ({
  default: ({ unoptimized: _unoptimized, ...props }: any) =>
    React.createElement("img", { ...props, alt: props.alt ?? "" })
}));

vi.mock("../console/shared/useToast", () => ({
  useToast: () => ({ toasts: [], show: mocks.show })
}));

vi.mock("../console/shared/Toast", () => ({
  default: () => <div data-testid="toast-host" />
}));

vi.mock("./SettingsNav", () => ({
  default: () => <nav data-testid="settings-nav" />
}));

vi.mock("../shared/AppNav", () => ({
  default: () => <nav data-testid="app-nav" />
}));

vi.mock("../shared/PageHeader", () => ({
  default: ({ title, children }: any) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  )
}));

import ProfilePage from "./ProfilePage";

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

function ownerProfile(overrides: Record<string, unknown> = {}) {
  return {
    owner_id: "owner_1",
    email_verified_at: null,
    display_name: "Initial name",
    bio: "Initial bio",
    avatar_url: "/avatars/default-2.svg",
    city: "Paris",
    state_region: "Île-de-France",
    country: "FR",
    show_email: false,
    available: true,
    ...overrides
  };
}

function mockSuccessfulLoad(profile = ownerProfile()) {
  mocks.fetch
    .mockResolvedValueOnce(response(200, { data: { owner_id: "owner_1" } }))
    .mockResolvedValueOnce(response(200, { data: profile }));
}

describe("ProfilePage", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.router.replace.mockReset();
    mocks.router.push.mockReset();
    mocks.show.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects an unauthenticated owner while preserving the return path", async () => {
    mocks.fetch.mockResolvedValueOnce(response(401, {}));
    render(<ProfilePage />);

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/auth/login?next=%2Fsettings%2Fprofile%3Ftab%3Dpublic"
      );
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the load error contract for a failed owner lookup", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(200, { data: { owner_id: "owner_1" } }))
      .mockResolvedValueOnce(response(503, { error: { message: "database unavailable" } }));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("profile.loadError")).toBeDefined();
    });
  });

  it("edits all mutable fields and saves the exact owner payload", async () => {
    mockSuccessfulLoad();
    mocks.fetch.mockResolvedValueOnce(response(200, {
      data: ownerProfile({
        display_name: "Updated owner",
        show_email: true,
        available: false
      })
    }));

    render(<ProfilePage />);

    const displayName = await screen.findByPlaceholderText("profile.fields.displayNamePlaceholder");
    fireEvent.change(displayName, { target: { value: "Updated owner" } });
    fireEvent.change(screen.getByPlaceholderText("profile.fields.bioPlaceholder"), {
      target: { value: "Updated biography" }
    });
    fireEvent.change(screen.getByPlaceholderText("profile.fields.cityPlaceholder"), {
      target: { value: "Lyon" }
    });
    fireEvent.change(screen.getByPlaceholderText("profile.fields.stateRegionPlaceholder"), {
      target: { value: "Auvergne-Rhône-Alpes" }
    });
    fireEvent.change(screen.getByPlaceholderText("profile.fields.countryPlaceholder"), {
      target: { value: "us" }
    });

    fireEvent.click(screen.getByText("profile.avatar.customUrl"));
    const avatarInput = screen.getByPlaceholderText("profile.avatar.urlPlaceholder");
    fireEvent.change(avatarInput, { target: { value: "  https://cdn.example.test/avatar.png  " } });
    fireEvent.click(screen.getByText("OK"));

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    fireEvent.click(switches[1]);
    fireEvent.click(screen.getByText("profile.save"));

    await waitFor(() => {
      expect(mocks.show).toHaveBeenCalledWith("profile.saveSuccess", "success");
    });

    expect(mocks.fetch).toHaveBeenLastCalledWith("/api/v1/owner/", expect.objectContaining({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-owner-id": "owner_1"
      },
      body: JSON.stringify({
        display_name: "Updated owner",
        bio: "Updated biography",
        avatar_url: "https://cdn.example.test/avatar.png",
        city: "Lyon",
        state_region: "Auvergne-Rhône-Alpes",
        country: "US",
        show_email: true,
        available: false
      })
    }));
  });

  it("reports save failures and routes unverified owners to identities", async () => {
    mockSuccessfulLoad();
    mocks.fetch.mockResolvedValueOnce(response(409, {
      error: { message: "profile conflict" }
    }));
    render(<ProfilePage />);

    await screen.findByText("profile.verifyBanner.heading");
    fireEvent.click(screen.getByText("profile.verifyBanner.cta"));
    expect(mocks.router.push).toHaveBeenCalledWith("/settings/identities");

    fireEvent.click(screen.getByText("profile.save"));
    await waitFor(() => {
      expect(mocks.show).toHaveBeenCalledWith("profile conflict", "error");
    });
  });

  it("hides completion and verification prompts for a complete profile", async () => {
    mockSuccessfulLoad(ownerProfile({
      email_verified_at: "2026-07-23T12:00:00.000Z"
    }));
    render(<ProfilePage />);

    await screen.findByDisplayValue("Initial name");
    expect(screen.queryByText("profile.completeBanner.heading")).toBeNull();
    expect(screen.queryByText("profile.verifyBanner.heading")).toBeNull();
  });
});
