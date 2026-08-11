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

  // ── react-hooks/purity in async Server Components ──────────────────────────
  //
  // The rule forbids `Date.now()` / `new Date()` during render, and it is right
  // to: in a CLIENT component the value changes on every re-render, so the
  // output is not idempotent. That is a real bug class and the rule stays on
  // everywhere it applies — the three client components it caught here
  // (go/page, command-palette, value-proof-card) were fixed properly, not
  // silenced.
  //
  // An async Server Component is not that shape. It runs ONCE per request on
  // the server, returns a value, and never re-renders; "today's date" is
  // exactly the input such a page is supposed to read. There is no unstable
  // second render to protect against, so the rule reports 14 dashboards for
  // doing the only correct thing available to them.
  //
  // Scoped to `page.tsx`/`layout.tsx` under src/app — the App Router files that
  // are server-rendered by default. Client components living in the same tree
  // are named for what they are (`*-client.tsx`, `components/**`) and keep the
  // rule. A file here that adds 'use client' should move its date-reading into
  // an effect rather than rely on this exemption.
  {
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
]);

export default eslintConfig;
