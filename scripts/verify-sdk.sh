#!/bin/sh
# The SDK checks of .github/workflows/sdk-ci.yml, run locally by `verify:pr`
# (verify-local.config.mjs, check `sdk`) when the OpenAPI contract, scripts/sdk
# or sdk/ change. Needs Java (OpenAPI Generator) and Python 3.11; the Python
# SDK is installed in a virtual environment under TMPDIR, removed with the
# isolated copy.
set -eu

# TypeScript SDK (job `typescript`).
npm run sdk:generate:ts
test -f sdk/typescript/generated/index.ts
git diff --exit-code
npm --prefix sdk/typescript ci --no-audit --no-fund
npm --prefix sdk/typescript run typecheck
npm run test:unit -- src/__tests__/sdk/clawdeals-fetch.test.ts

# Python SDK (job `python`).
npm run sdk:generate:py
test -f sdk/python/src/clawdeals_sdk_generated/__init__.py
git diff --exit-code
venv="${TMPDIR:-/tmp}/clawdeals-sdk-venv-$$"
python3.11 -m venv "$venv"
"$venv/bin/python" -m pip install --quiet -U pip
"$venv/bin/python" -m pip install --quiet "sdk/python[dev]"
"$venv/bin/python" -c "import clawdeals_sdk_generated; import clawdeals_sdk"
"$venv/bin/python" -m pytest -q sdk/python/tests
