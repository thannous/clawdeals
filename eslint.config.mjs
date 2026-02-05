import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", ".open-next/**", "dist/**", "coverage/**", "test-results/**", "maquette.jsx"]
  },
  ...nextCoreWebVitals
];

export default config;
