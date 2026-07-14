import { defineConfig, devices } from '@playwright/test';

// E2E smoke suite — the safety net that survives without an AI assistant.
// Run: `npm run test:e2e` (starts the prod build, drives the real funnel).
// Needs .env.local with the public Supabase vars. Tests avoid writing real
// data (no OTP submitted, no real payment) — they assert the FLOW renders and
// advances, which is what silently broke before (blank plan card, buried CTA,
// dead checkout). CI-friendly: one Chromium project at a budget-Android size.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 360, height: 740 },
  },
  // Use the browser binary the environment ships (PLAYWRIGHT_BROWSERS_PATH),
  // not a version-pinned download. In CI, drop executablePath and let
  // `npx playwright install chromium` provide the matching build.
  projects: [{
    name: 'android',
    use: {
      ...devices['Pixel 5'],
      launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
    },
  }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://localhost:3000/start',
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      },
});
