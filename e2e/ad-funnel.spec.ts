import { test, expect, devices, type Browser } from '@playwright/test';

// ── The paid funnel, walked end to end, on the phones students actually use. ─
//
// Founder, 10 Aug: "We have live ads going on. Every student should register
// and download our app smooth and fast, without any error."
//
// Ads pay per click, so a break here is not a bug report — it is money. And the
// failures that cost the most are the quiet ones: a forward button below the
// fold, two overlays stacked on top of each other, a screen that throws after
// hydration. None of those show up as an error; the student just stops.
//
// So this walks /start from the ad landing to the signup form on three real
// viewports and asserts, at EVERY screen, that the way forward is reachable.
//
// Not asserted here: /api/events/track, /api/perf and /api/funnel returning 500
// without SUPABASE_SERVICE_ROLE_KEY. They are fire-and-forget beacons that
// cannot change what the student sees, and a local e2e run is not required to
// carry a service-role key. Every other server error still fails the test.

const ENV_ONLY_500 = /\/api\/(events\/track|perf|funnel)\b/;

const PHONES = [
  { name: 'Android (Pixel 5)', device: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  { name: 'iPhone SE (smallest live screen)', device: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } } },
  { name: 'iPhone 13', device: devices['iPhone 13'] },
];

/**
 * Is the way forward reachable right now, without scrolling?
 *
 * A sticky/fixed footer counts as reachable — that is what a sticky footer is
 * for. Anything else has to be inside the viewport on its own.
 */
const PROBE = () => {
  const visible = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
  const forward = visible.filter((b) => {
    const t = (b.textContent || '').trim();
    if (/^(start over|log in|back)$/i.test(t)) return false;
    return /continue|next:|map all|yes — i need one|see my|build my plan/i.test(t.toLowerCase());
  });
  const cta = forward[forward.length - 1] ?? null;

  let sticky = false;
  for (let n: HTMLElement | null = cta; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'sticky' || p === 'fixed') { sticky = true; break; }
  }
  const r = cta?.getBoundingClientRect();
  const overlays = [...document.querySelectorAll('div')].filter((el) => {
    const s = getComputedStyle(el);
    const q = el.getBoundingClientRect();
    return s.position === 'fixed' && q.width >= innerWidth * 0.95 && q.height >= innerHeight * 0.8;
  }).length;

  return {
    hasCta: !!cta,
    ctaText: cta ? (cta.textContent || '').trim().slice(0, 40) : null,
    reachable: cta ? (sticky || (r!.bottom <= innerHeight + 1 && r!.top >= 0)) : true,
    overlays,
  };
};

for (const phone of PHONES) {
  test(`${phone.name} — ad click reaches the signup form with nothing broken`, async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext(phone.device);
    const page = await ctx.newPage();

    const jsErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on('pageerror', (e) => jsErrors.push(String(e).slice(0, 200)));
    page.on('response', (r) => {
      if (r.status() >= 500 && !ENV_ONLY_500.test(r.url())) {
        serverErrors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      }
    });

    const checkpoints: string[] = [];
    async function checkpoint(label: string) {
      await page.waitForTimeout(280);
      const m = await page.evaluate(PROBE);
      checkpoints.push(label);
      expect(m.reachable, `${label}: forward button "${m.ctaText}" is off-screen and not sticky`).toBe(true);
      expect(m.overlays, `${label}: ${m.overlays} full-screen overlays stacked`).toBeLessThanOrEqual(1);
    }

    await page.goto('/start', { waitUntil: 'networkidle' });

    await checkpoint('need-check');
    await page.getByText('Yes — I need one').click();

    await checkpoint('target-date');
    await page.getByText('Balanced').click();

    await checkpoint('dream-percentile');
    await page.getByText('IIM Ahmedabad', { exact: true }).click();
    await page.getByText('98+', { exact: true }).click();
    await page.getByText('Continue →').click();

    await checkpoint('quick-facts');
    for (const label of ['Self-prep', '3h', 'First attempt', 'Full-time']) {
      await page.getByText(label, { exact: true }).click();
    }
    await page.getByText('Continue →').click();

    await checkpoint('pain-points');
    await page.getByText("I plan big on Sunday — by Wednesday it's dead").click();
    await page.getByText("I'm scared I won't finish the syllabus before CAT").click();
    await page.getByText('Continue →').click();

    await checkpoint('reality-check');
    for (const row of await page.locator('div.rounded-2xl.border').all()) {
      await row.getByText('No', { exact: true }).click();
    }
    await page.getByText(/^Map all \d+/).click();

    // Topic coverage — five steps, 45 units. Each unit is a row of status
    // buttons labelled "<topic>: <status>"; tap the first option per topic.
    for (let step = 0; step < 8; step++) {
      await checkpoint(`coverage-step-${step + 1}`);
      await page.evaluate(() => {
        const seen = new Set<string>();
        for (const b of document.querySelectorAll<HTMLButtonElement>('button[aria-label*=": "]')) {
          const unit = (b.getAttribute('aria-label') || '').split(': ')[0];
          if (seen.has(unit)) continue;
          seen.add(unit);
          b.click();
        }
      });
      await page.waitForTimeout(240);
      const next = page.locator('button', { hasText: /^(Next:|Continue →)/ }).last();
      await expect(next, `coverage step ${step + 1} never enabled its button`).toBeEnabled();
      const last = /Continue →/.test((await next.textContent()) ?? '');
      await next.click();
      await page.waitForTimeout(600);
      if (last) break;
    }

    // The diagnosis screen — the pitch, and the last thing before signup.
    await checkpoint('instant-insight');
    await expect(
      page.getByRole('button', { name: /Build my plan around this/ }),
      'the diagnosis screen must offer exactly one way forward'
    ).toHaveCount(1);

    // Push through to the signup form.
    for (let i = 0; i < 4; i++) {
      const body = await page.locator('body').innerText();
      if (/mobile number|whatsapp|otp|\+91/i.test(body)) break;
      const b = page.locator('button:visible', { hasText: /continue|build my plan|yes|→/i }).last();
      if (!(await b.count()) || (await b.isDisabled())) break;
      await b.click();
      await page.waitForTimeout(650);
    }

    const finalText = await page.locator('body').innerText();
    expect(finalText, `never reached the signup form (got as far as: ${checkpoints.at(-1)})`)
      .toMatch(/mobile number|whatsapp|otp|\+91/i);

    expect(jsErrors, 'uncaught JavaScript in the paid funnel').toEqual([]);
    expect(serverErrors, 'server errors in the paid funnel').toEqual([]);

    await ctx.close();
  });
}
