import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".open-next/**",
      "dist/**",
      "coverage/**",
      "test-results/**",
      "maquette.jsx",
      "sdk/**/generated/**",
      "sdk/**/dist/**",
      "sdk/python/src/clawdeals_sdk_generated/**"
    ]
  },
  ...nextCoreWebVitals
];

export default config;
