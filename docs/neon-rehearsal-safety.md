# Neon rehearsal safety boundary

Status: local implementation and mocked-transport checks only. This does not authorize or prove a deployed preview, activation, migration, or live release.

## Explicit mode and build contract

`CLAWDEALS_REHEARSAL_MODE` is server-controlled, default off (unset, empty, `0`, `false`, case-insensitive). Any other nonempty value blocks effects, including a typo. It never expires. Maintenance freeze remains independent and takes precedence. No credentials, request headers, query parameters, fixture identity or provider mocks can override the server guard.

A rehearsal build requires `NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon`. Next config derives the immutable public `NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE=true` from the server build mode; it is not a separate permission switch. Proxy refuses UI/API requests unless both server database/auth selectors and the compiled public auth selector are explicitly `neon`, and the compiled rehearsal marker is true. An existing normal bundle cannot safely be converted to rehearsal just by changing runtime environment. Verify the actual preview bundle before browsing it. The browser auth factory refuses both provider clients in a rehearsal build. This is additional protection, not the server safety boundary.

Server data/auth selectors reject missing or Supabase selection during rehearsal. The legacy Supabase client cannot be instantiated or retrieved, even if cached and even through the Neon compatibility client's lazy auth/storage properties. No fallback is permitted. Neon database reads and existing server identity verification (Neon get-session/JWKS) remain possible; external sign-in, account creation, callbacks, password/email flows through the auth proxy are blocked. Synthetic fixtures must be explicitly provisioned into the isolated test database with normal test authorization; this mode does not create authentication bypasses or install fixtures.

## Guarded effects

- Every internal cron endpoint rejects even valid inherited cron/wake credentials. Direct maintenance jobs, queue consumers, drain leases, approval jobs, and postcommit queue wake claim/dispatch are guarded before work. Imported queues are neither claimed nor drained. Already-running work must be stopped before activation; changing environment is not retroactive cancellation.
- Resend channel mail and owner magic-link delivery; Telegram sends and media API calls; local ChatGPT bridge calls.
- Listing uploads/deletes and their Blob transport, evidence upload/deletion and signed upload capabilities (both provider branches).
- Supabase service factory including lazy auth/storage escape hatches; direct Supabase retention REST and partition maintenance.
- Inherited Redis clients (general and rate-limit), including cached-client access, and PSP adapter construction (currently only a mock adapter exists).
- Proxy rejects write methods and all `/api/auth` and `/api/internal/cron` requests. Shared API middleware separately refuses writes/misconfiguration before auth/rate-limit/audit work. Direct provider and queue calls remain guarded independently of Proxy.

Non-throwing delivery helpers deliberately reject in rehearsal rather than fabricate delivery success. No global fetch monkeypatch is used by runtime code. Mocked transports in the focused tests detect accidental calls rather than implement safety.

Read-only Neon UI may degrade where Redis is essential. Authenticated Blob evidence reads are not writes and remain permitted. The guard is not a general SQL read-only firewall: normal isolated Neon reads and audit writes may occur. It is not a substitute for a least-privilege Neon role, isolated database URL, role review, imported-data review, or egress controls. New provider integrations require a guard at their transport boundary.

## Live Supabase dependency census (separate from rehearsal)

The guard is not evidence that live Neon migration is complete. With rehearsal off:

- `server/db/supabase.ts`: historical data-client name routes `from`/`rpc` to Neon only when `CLAWDEALS_DATABASE_BACKEND=neon`. Its lazy `auth` and `storage` properties still intentionally construct Supabase. All selectors default to Supabase for existing installations; credentials being present must not determine migration completion.
- `server/auth/external-identity.ts`: `auth.getUser` remains in the Supabase branch. Set `CLAWDEALS_AUTH_BACKEND=neon` for Neon get-session/JWKS verification. `ui/auth/browser-auth-client.ts` independently requires `NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon` at build time or it constructs the direct browser Supabase client.
- `services/listing-media-storage.ts`: new uploads use `getListingStorageBackend`; configure `CLAWDEALS_OBJECT_STORAGE_BACKEND=vercel-blob` and ensure scoped listing/evidence selectors do not override it to Supabase. Legacy locator deletion still enters Supabase for non-Blob locators. Existing persisted locator migration must be verified; selecting Blob alone does not migrate objects.
- `storage/evidence-storage.ts`: new writes use the configured evidence provider; operations on persisted `evidence` bucket records still use Supabase. Migrate records and bytes, or retain an explicitly authorized compatibility dependency. Blob configuration alone does not eliminate this residual dependency.
- `retention/shared.ts` and `retention/partition-manager.ts`: direct Supabase REST exists only for the selected Supabase backend. Their Neon branches use the adapter. Explicit supplied `env` can select the old branch; production callers/automation must be checked separately.
- Telegram, Resend, Blob, Redis and the local bridge are independent providers, not Supabase dependencies. Blocking them in rehearsal says nothing about their approved live availability/configuration.
- Offline migration/export scripts intentionally retain Supabase access and are not runtime rehearsal endpoints. They remain subject to their separate target/approval safeguards.

## Evidence and remaining release gates

Focused regression: `npx --no-install vitest run src/server/config/rehearsal.test.ts src/ui/auth/browser-auth-client.test.ts`. Tests use fake credentials and assert no fetch, Blob, Supabase, Redis, auth SDK, Neon wake query or waitUntil transport is touched. The suite invokes all cron route handlers directly and exercises direct queue/provider functions, configuration failure, maintenance freeze precedence and browser-client refusal.

These isolation tests cover the documented failure a browser-only E2E cannot detect: direct server entrypoints and imported queue drains bypassing browser interception. Existing normal-mode regression tests must continue passing. No actual OAuth, email, upload, queue drain, database write, preview deployment or environment activation was used for this evidence. Preview remains blocked pending exact build/runtime configuration verification, fresh built-bundle/browser evidence with isolated fixtures, and the independent Neon migration/security gates.
