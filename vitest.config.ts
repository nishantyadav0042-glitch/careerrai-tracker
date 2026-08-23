import { defineConfig } from 'vitest/config';

// Unit tests only — pure domain modules. No database, no network, no React,
// so the whole suite runs in about a second and can sit in front of every
// commit without anyone being tempted to skip it.
//
// The Playwright e2e suite in e2e/ is a separate runner and stays excluded.
export default defineConfig({
  // `@/…` path aliases resolve straight from tsconfig.json — no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    // Scoped to src/lib — the pure domain modules. Deliberately NOT src/**:
    // src/app/student/today/form.test.ts is a pre-existing console.log script
    // that tests a local copy of some form logic rather than any production
    // code, and it executes on import. It is left in place (not deleted) and
    // simply out of scope until someone decides what it was for.
    // B3b (23 Aug) added src/app/api/** so a cron's mutation-safety test can
    // sit NEXT TO the route it guards. Gate 6 requires one per mutation-capable
    // cron — thirteen of them — and exiling those into src/lib/ would separate
    // each test from the code whose failure mode it pins. The api tests mock
    // the client and touch no database, so the "runs in about a second" rule
    // still holds. src/app/student/** stays out, which is what the note below
    // was actually protecting.
    include: ['src/lib/**/*.test.ts', 'src/app/api/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
