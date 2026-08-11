import { test, expect, devices, type Browser, type Page } from '@playwright/test';

// The install journey, driven on real devices — iPhone, iPad and Android, in
// plain browsers and inside Instagram's webview.
//
// Founder, 10 Aug: "test the complete journey, it shouldn't be broken and it
// should be error free — for both iOS and Android."
//
// A broken install route is the one failure nobody reports: a student who is
// shown the wrong instructions doesn't file a bug, they just never come back.
// Unit tests cover resolveStrategy; this covers what a phone actually RENDERS,
// which is where the two real bugs of 10 Aug lived — an Android ⋮ guide shown
// to iPhones, and an iPhone inside Instagram being offered the App Store AND
// "Add to Home Screen" on the same screen.

const IOS_UA_INSTAGRAM = `${devices['iPhone 13'].userAgent} Instagram 275.0.0.27.98`;
const ANDROID_UA_INSTAGRAM = `${devices['Pixel 5'].userAgent} Instagram 275.0.0.27.98`;

interface Rendered {
  text: string;
  pageErrors: string[];
  serverErrors: string[];
}

/**
 * Open a path as a given device and report what rendered.
 *
 * Telemetry 500s are filtered deliberately: /api/events/track and /api/perf
 * need SUPABASE_SERVICE_ROLE_KEY, which a local .env.local for e2e is not
 * required to carry. They are fire-and-forget beacons — they cannot change what
 * the student sees — so counting them would make this suite fail for a reason
 * that has nothing to do with the journey. Every OTHER server error still fails.
 */
async function render(browser: Browser, device: object, path: string): Promise<Rendered> {
  const ctx = await browser.newContext(device);
  const page: Page = await ctx.newPage();
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 500 && !/\/api\/(events\/track|perf)/.test(r.url())) {
      serverErrors.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });

  await page.goto(path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700); // client-side platform detection settles
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  await ctx.close();
  return { text, pageErrors, serverErrors };
}

const APP_STORE = /Download on the App Store/i;
const A2HS = /Add to Home ?screen/i;
const ANDROID_MENU = /Tap the ⋮ menu/i;
const SAFARI_SHARE = /In Safari, tap/i;

const APPLE_DEVICES = [
  { name: 'iPhone · Safari', device: devices['iPhone 13'] },
  { name: 'iPad · Safari', device: devices['iPad (gen 7)'] },
  { name: 'iPhone · Instagram webview', device: { ...devices['iPhone 13'], userAgent: IOS_UA_INSTAGRAM } },
];

for (const { name, device } of APPLE_DEVICES) {
  test(`${name} — App Store only, no second install route`, async ({ browser }) => {
    const r = await render(browser, device, '/app');

    expect(r.text, 'iPhone must be offered the App Store').toMatch(APP_STORE);
    // The duplication the founder called out. All three must stay absent.
    expect(r.text, 'must not also offer Add to Home Screen').not.toMatch(A2HS);
    expect(r.text, 'must never see the ANDROID menu guide').not.toMatch(ANDROID_MENU);
    expect(r.text, 'the old Safari Share guide is deleted').not.toMatch(SAFARI_SHARE);

    expect(r.pageErrors, 'no uncaught JS').toEqual([]);
    expect(r.serverErrors, 'no server errors').toEqual([]);
  });
}

const ANDROID_DEVICES = [
  { name: 'Android · Chrome', device: devices['Pixel 5'] },
  { name: 'Android · Instagram webview', device: { ...devices['Pixel 5'], userAgent: ANDROID_UA_INSTAGRAM } },
];

for (const { name, device } of ANDROID_DEVICES) {
  test(`${name} — keeps its own route, untouched`, async ({ browser }) => {
    const r = await render(browser, device, '/app');

    // Founder: "keep the android link there only." The iOS work must not have
    // taken anything away from Android.
    expect(r.text, 'Android keeps Add to Home screen').toMatch(A2HS);
    expect(r.text, 'Android keeps the ⋮ menu step').toMatch(ANDROID_MENU);
    expect(r.text, 'Android must never see the iPhone App Store button').not.toMatch(APP_STORE);

    expect(r.pageErrors, 'no uncaught JS').toEqual([]);
    expect(r.serverErrors, 'no server errors').toEqual([]);
  });
}

test('the install landing page renders one escape, not two', async ({ browser }) => {
  // /get-app used to mount its own OpenInBrowser on top of the layout-level
  // escape, so an Instagram visitor got two stacked full-screen takeovers.
  const r = await render(browser, { ...devices['iPhone 13'], userAgent: IOS_UA_INSTAGRAM }, '/get-app');
  expect(r.text).toMatch(APP_STORE);
  expect(r.text).not.toMatch(A2HS);
  // "Continue here for now" is the single dismissal hatch — two would mean two
  // overlays are mounted.
  expect(r.text.match(/Continue here for now/g)?.length ?? 0).toBeLessThanOrEqual(1);
  expect(r.pageErrors).toEqual([]);
  expect(r.serverErrors).toEqual([]);
});
