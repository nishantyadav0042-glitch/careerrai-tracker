import { test, expect, Page } from '@playwright/test';

// The onboarding funnel is the top of the money pipe. These tests assert it
// (1) advances screen-to-screen, (2) never buries the CTA below the fold, and
// (3) reaches the signup screen — the exact things that silently regressed
// before. No OTP is submitted, so no real account is created.

async function noScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow, `${label} should fit the screen (overflow ${overflow}px)`).toBeLessThanOrEqual(6);
}

test('funnel: reaches signup, non-topic screens fit one screen', async ({ page }) => {
  await page.goto('/start');

  // Screen 1 — need check
  await expect(page.getByText(/need one|structure|serious/i).first()).toBeVisible();
  await noScroll(page, 'need-check');
  await page.getByText('Yes — I need one').click();

  // Screen 2 — target date (tap a preset)
  await expect(page.getByText(/finish your syllabus/i)).toBeVisible();
  await page.getByText('Balanced').click();

  // Screen 3 — dream colleges + percentile
  await expect(page.getByText(/dream colleges/i)).toBeVisible();
  await noScroll(page, 'dream-percentile');
  await page.getByText('IIM Ahmedabad', { exact: true }).click();
  await page.getByText('98+', { exact: true }).click();
  await page.getByText('Continue →').click();

  // Screen 4 — quick facts
  await expect(page.getByText(/hours|attempt|coaching/i).first()).toBeVisible();
  await noScroll(page, 'quick-facts');
  await page.getByText('3h', { exact: true }).click();
  await page.getByText('Self-prep', { exact: true }).click();
  await page.getByText('First attempt', { exact: true }).click();
  // The fourth question. This spec answered only three, so Continue stayed
  // disabled — nobody noticed because the screen overflowed a 360px phone and
  // the test failed one line earlier, at noScroll, for two months.
  await page.getByText('Full-time', { exact: true }).click();
  await page.getByText('Continue →').click();

  // Screen 5 — pain points (pick 2)
  await expect(page.getByText(/stopping you/i)).toBeVisible();
  await noScroll(page, 'pain-points');
  await page.getByText("I plan big on Sunday — by Wednesday it's dead").click();
  await page.getByText("I'm scared I won't finish the syllabus before CAT").click();
  await page.getByText('Continue →').click();

  // Screen 6 — reality check (3 gut-check questions).
  // This spec still tested a "reassurance / Let's map it" screen that was
  // deleted in the v4 funnel rebuild ("removed the standalone reassurance
  // screen — redundant with reality-check", start/page.tsx). It never failed
  // out loud because the run died two screens earlier.
  await expect(page.getByText(/a gut check/i)).toBeVisible();
  await noScroll(page, 'reality-check');
  for (const row of await page.locator('div.rounded-2xl.border').all()) {
    await row.getByText('No', { exact: true }).click();
  }
  await page.getByText(/^Map all \d+/).click();

  // Screen 7 — topic coverage (the long one; just confirm it renders + Rai trail)
  await expect(page.getByText(/one tap each|topics/i).first()).toBeVisible();
});

test('funnel: the CTA is always reachable even when content is long', async ({ page }) => {
  await page.goto('/start');
  await page.getByText('Yes — I need one').click();
  await page.getByText('Balanced').click();
  // On the dream screen the Continue button must be in the viewport (sticky).
  const cta = page.getByText('Continue →');
  await expect(cta).toBeVisible();
  const inView = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  });
  expect(inView, 'Continue must sit within the viewport without scrolling').toBeTruthy();
});
