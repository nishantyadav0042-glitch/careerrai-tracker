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
    include: ['src/lib/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
