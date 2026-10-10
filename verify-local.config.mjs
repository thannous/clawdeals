// Checks of this repository for scripts/verify-local.mjs, the engine of the
// common delivery rule (regle-commune-livraison, docs/regle-commune-livraison.md). Data only: the engine
// loads this file as committed in the verified commit.
//
// `npm run verify:pr` runs the PR checks on an isolated copy of the commit;
// `npm run verify:release` adds the release checks. A check whose inputs,
// command, Node, npm and lockfile already passed is reused, not run again.

// Source files TypeScript, Vitest and ESLint read.
export const CODE = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"];
// Files after which scripts/lint-changed.mjs lints every file. Same list as
// scripts/lint-everything.mjs (this file is data only and cannot import it);
// scripts/verify-local.config.test.mjs keeps them equal. Named exports are
// for that test only; the engine reads the default export.
export const LINT_EVERYTHING = ["eslint.config.mjs", "package-lock.json"];
// Prose and tooling that no application check reads.
const NOT_APP = [
  "*.md",
  "docs/**/*.md",
  ".agents/**",
  ".github/**",
  ".githooks/**",
  "competitor-profiles/**",
  "verify-local.config.mjs",
  "scripts/verify-local.mjs",
  "scripts/test-verify-local.mjs",
  "scripts/install-git-hooks.mjs",
  "scripts/git-hooks.test.mjs",
  "scripts/lint-changed.mjs",
  "scripts/lint-everything.mjs",
  "scripts/verify-local.config.test.mjs",
  "scripts/has-playwright-browser.mjs",
  "scripts/verify-sdk.sh",
];

// sha256 of this repository's own copy of scripts/verify-local.mjs (engine v3,
// ported byte-identical from thannous/skillcodex#197 at 3eb7f3fc). The engine
// tests compare the file with it, so an engine edit is a deliberate change of
// this pin. No other repository is read or compared.
export const ENGINE_SHA256 =
  "269adfe5e46a3a6c7b21bf220d5a5c9a85859fe8287974d3c0253a93ac8acdbf";

const config = {
  mainBranch: "main",
  commands: { pr: "npm run verify:pr", release: "npm run verify:release" },
  deps: {
    // Link when package-lock.json matches the checkout (measured on
    // 2026-10-09: copy ready in about 1.3 s, against about 57 s and 1.4 GB for
    // `npm ci`). Only `build` needs a real install: the Turbopack build refuses
    // a node_modules whose entries link outside the copy ("Could not find the
    // Next.js package"), so that check is marked install: true.
    mode: "link",
    lockfile: "package-lock.json",
    install: "npm ci --prefer-offline --no-audit --no-fund",
    copy: [],
  },
  setup: [],
  // https:// URL prefixes of the CI runs that --external may cite as evidence
  // for a specialised check. None here, so --external accepts only the
  // engine's "owner-machine: <host> <note> on <SHA>" format. The release
  // workflows (mcp-release.yml, sdk-release.yml) publish and prove no check,
  // and ci.yml, sdk-ci.yml and historical-corpus.yml are manual runs that gate
  // nothing. A prefix also cannot pick one workflow: every run of this
  // repository lives under https://github.com/thannous/clawdeals/actions/runs/.
  externalSources: [],
  // The scripts these checks run: changing them changes what a proof proves,
  // so proof-block flags them for the owner's review like this file.
  deliveryFiles: [
    // The lint, typecheck and test configs (the engine's own list covers them
    // too). package.json and package-lock.json stay out: the engine flags a
    // package.json change outside dependencies and version by itself, and the
    // delivery rule (section 2.3) exempts dependency-only changes.
    "eslint.config.mjs",
    "tsconfig.json",
    "vitest.config.ts",
    ".githooks/pre-push",
    "scripts/lint-changed.mjs",
    "scripts/lint-everything.mjs",
    "scripts/verify-sdk.sh",
    "scripts/has-playwright-browser.mjs",
    "scripts/install-git-hooks.mjs",
    // The validators the i18n, skill and OpenAPI checks run, and their config.
    "scripts/validate-i18n-page-contract.mjs",
    "scripts/validate-i18n-messages.mjs",
    "scripts/validate-skill-pack.mjs",
    "scripts/sync-skill-public.mjs",
    ".redocly.yaml",
    ".redocly.lint-ignore.yaml",
    "e2e/testerarmy/run-historical.mjs",
    // The tests of the hook and of this config.
    "scripts/git-hooks.test.mjs",
    "scripts/verify-local.config.test.mjs",
  ],
  checks: [
    {
      name: "engine-tests",
      command: "node --test scripts/test-verify-local.mjs",
      // The engine tests read ENGINE_SHA256 from this file.
      inputs: ["scripts/verify-local.mjs", "scripts/test-verify-local.mjs", "verify-local.config.mjs"],
    },
    {
      name: "git-hooks",
      command: "npm run test:git-hooks",
      inputs: [
        ".githooks/**",
        ".gitignore",
        "package.json",
        "verify-local.config.mjs",
        "scripts/verify-local.mjs",
        "scripts/install-git-hooks.mjs",
        "scripts/git-hooks.test.mjs",
      ],
    },
    {
      // Repository contracts of this file (scripts/verify-local.config.test.mjs).
      name: "verify-config",
      command: "node --test scripts/verify-local.config.test.mjs",
      inputs: [
        "verify-local.config.mjs",
        "scripts/verify-local.mjs",
        "scripts/lint-changed.mjs",
        "scripts/lint-everything.mjs",
        "scripts/verify-local.config.test.mjs",
      ],
    },
    {
      // ESLint on the JS/TS files changed since the merge base with
      // origin/main (everything when the ESLint config or the lockfile changed).
      name: "lint-changed",
      // Lints the files changed since the merge base: reused only against the same one.
      perBase: true,
      command: "npm run lint:changed",
      inputs: [...CODE, "package.json", ...LINT_EVERYTHING],
      when: [...CODE, ...LINT_EVERYTHING],
    },
    {
      name: "typecheck",
      command: "npm run typecheck",
      inputs: [...CODE, "**/*.json"],
      exclude: ["verify-local.config.mjs"],
    },
    {
      name: "i18n-page-contract",
      command: "npm run test:i18n:contract",
      inputs: ["src/pages/**", "scripts/validate-i18n-page-contract.mjs", "package.json"],
    },
    {
      name: "i18n-messages",
      command: "npm run test:i18n:messages",
      inputs: ["messages/**", "scripts/validate-i18n-messages.mjs", "package.json"],
    },
    {
      name: "openapi-lint",
      command: "npm run openapi:lint",
      inputs: ["docs/openapi-v1.yaml", ".redocly.yaml", ".redocly.lint-ignore.yaml", "package.json"],
    },
    {
      name: "skill-pack",
      command: "npm run test:skill:pack",
      inputs: ["skills/**", "public/**", "scripts/validate-skill-pack.mjs", "package.json"],
    },
    {
      name: "skill-public",
      command: "npm run test:skill:public",
      inputs: ["skills/**", "public/**", "scripts/sync-skill-public.mjs", "package.json"],
    },
    {
      name: "unit",
      command: "npm run test:unit",
      exclude: NOT_APP,
    },
    {
      // The steps of sdk-ci.yml (TypeScript and Python SDKs), when the OpenAPI
      // contract or the SDK sources change. About a minute.
      name: "sdk",
      command: "sh scripts/verify-sdk.sh",
      when: ["docs/openapi-v1.yaml", "scripts/sdk/**", "sdk/**", "scripts/verify-sdk.sh"],
      specialised: true,
      requires: {
        // verify-sdk.sh also downloads the generator (npm, Maven Central) and the
        // Python SDK dependencies (PyPI): an offline machine cannot run it either.
        // Retried, so a passing network blip does not mark the check unavailable.
        // It also creates a virtual environment: python3.11 needs venv and ensurepip.
        command:
          "java -version >/dev/null 2>&1 && python3.11 -c \"import ensurepip, venv\" >/dev/null 2>&1 && " +
          "curl -sf -o /dev/null --retry 2 --retry-all-errors --max-time 15 https://registry.npmjs.org/ && " +
          "curl -sf -o /dev/null --retry 2 --retry-all-errors --max-time 15 https://repo1.maven.org/maven2/ && " +
          "curl -sf -o /dev/null --retry 2 --retry-all-errors --max-time 15 https://pypi.org/simple/pip/",
        hint:
          "run it locally where you run verify:pr (it needs Java for OpenAPI Generator, Python 3.11 and access to npm, Maven Central and PyPI); if this machine cannot, say so in the PR. A run on the verified commit can be cited with --external sdk=\"owner-machine: <host> <note> on <SHA>\"",
      },
    },

    // Release only. lint-changed lints the files changed since origin/main,
    // which on the delivered main commit are none: a release lints them all.
    {
      name: "lint",
      command: "npm run lint",
      kinds: ["release"],
      inputs: [...CODE, "package.json", ...LINT_EVERYTHING],
    },
    // What is delivered. The app reads its deployed SHA from
    // the hosting environment at runtime (VERCEL_GIT_COMMIT_SHA and friends);
    // the local build embeds no SHA, so it depends on the tree, not on the
    // commit.
    {
      name: "build",
      command: "npm run build",
      kinds: ["release"],
      install: true,
      exclude: NOT_APP,
      // Only inside the throwaway copy; never disable telemetry in the checkout.
      env: { NEXT_TELEMETRY_DISABLED: "1" },
    },
    {
      name: "worker-bundle",
      command: "npm exec -- wrangler deploy --dry-run --outdir .wrangler/verify-local-bundle",
      kinds: ["release"],
      // workers/remote-mcp.ts imports packages/clawdeals-mcp/mcp/*.mjs.
      inputs: ["workers/**", "src/**", "packages/**", "wrangler.jsonc", "tsconfig.json", "package.json"],
      env: { WRANGLER_SEND_METRICS: "false" },
    },
    {
      // The complete historical TesterArmy corpus (about 12 minutes): a local
      // `next dev` and headless Chromium. Its evidence is copied to
      // .e2e/verify-local/ in the main checkout before the copy is removed.
      name: "historical-corpus",
      command:
        'out=".e2e/runs/historical/verify-local-$VERIFY_LOCAL_SHA"; ' +
        'PARITY_OUTPUT="$out" node e2e/testerarmy/run-historical.mjs run; status=$?; ' +
        'kept="$VERIFY_LOCAL_ROOT/.e2e/verify-local/historical-$VERIFY_LOCAL_SHA"; ' +
        'rm -rf "$kept" && mkdir -p "$kept" && cp -R "$out/." "$kept/" && echo "historical-corpus: evidence in $kept"; ' +
        'exit $status',
      kinds: ["release"],
      specialised: true,
      exclude: NOT_APP,
      // Only inside the throwaway copy; never disable telemetry in the checkout.
      env: { E2E_TELEMETRY_DISABLED: "1", NEXT_TELEMETRY_DISABLED: "1", TESTERARMY_AI: "0" },
      requires: {
        command: "node scripts/has-playwright-browser.mjs",
        hint:
          "run it locally where you run verify:pr (it needs the Chromium pinned by playwright-core: `npx playwright install chromium`); if this machine cannot, say so in the PR. A run on the verified commit can be cited with --external historical-corpus=\"owner-machine: <host> <note> on <SHA>\"",
      },
    },
  ],
  hook: {
    checks: [
      {
        // .gitignore keeps local env files out of `git add`; only the template is tracked.
        name: "gitignore-env",
        command: "git check-ignore -q .env && git check-ignore -q .env.local && ! git check-ignore -q .env.example",
      },
    ],
  },
};

export default config;
