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
    // Build/tooling scripts that never ship to a user. They are plain Node
    // CommonJS and are linted by their own runtime failing, not by the app's
    // TypeScript rules.
    "docs/store/render.js",
    "scripts/**",
  ]),
]);

export default eslintConfig;
