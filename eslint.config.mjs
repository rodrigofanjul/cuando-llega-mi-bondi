import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Proyectos nativos de Capacitor (código Kotlin/Swift y artefactos de build).
    "android/**",
    "ios/**",
    "mobile/**",
    // Pipeline Python (incluye el venv local con JS de terceros).
    "ml/**",
  ]),
]);

export default eslintConfig;
