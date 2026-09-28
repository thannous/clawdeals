import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".next.bak/**",
      ".open-next/**",
      ".open-next.bak/**",
      "dist/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "maquette.jsx",
      "sdk/**/generated/**",
      "sdk/**/dist/**",
      "sdk/python/src/clawdeals_sdk_generated/**"
    ]
  },
  ...nextCoreWebVitals
];

export default config;
