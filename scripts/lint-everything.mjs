// Files whose change can alter the ESLint verdict on untouched files, so
// `scripts/lint-changed.mjs` lints every file when one of them changed.
// verify-local.config.mjs is data only (the engine loads it alone, as
// committed) and cannot import this list, so it repeats it in the `when` and
// `inputs` of `lint-changed`; scripts/verify-local.config.test.mjs keeps the
// two in sync.
export const LINT_EVERYTHING = ["eslint.config.mjs", "package-lock.json"];
