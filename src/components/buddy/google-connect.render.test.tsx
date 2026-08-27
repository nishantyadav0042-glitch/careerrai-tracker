import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleConnect } from './google-connect';

/**
 * ── ONE MENTOR SETUP PATH ───────────────────────────────────────────────────
 *
 * 27 Aug. A mentor arriving at /buddy/home was asked to choose between pasting
 * a meeting-room URL and connecting Google, with the paste box leading and
 * "Or connect Google to make one for me" as grey text underneath. Shreya
 * Bendigeri, asked over WhatsApp to connect Google, replied "Okay where's the
 * option to connect it / Didn't find" — the CTA existed and she could not see
 * it, because it was the smallest thing on a card about something else.
 *
 * The rule this file pins: Google is the ONLY mentor-facing way to set up
 * meeting infrastructure, and its CTA is the primary action, never a footnote.
 *
 * Comments are stripped before the sweep. This repo has been bitten repeatedly
 * by guards that matched their own explanatory prose — including the prose
 * above, which names every banned string.
 */

const SRC = join(__dirname, '..', '..');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every mentor-facing source file: the buddy app and its components. */
function mentorSurfaces(): string[] {
  const roots = [join(SRC, 'app', 'buddy'), join(SRC, 'components', 'buddy')];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(p);
    }
  };
  for (const r of roots) walk(r);
  out.push(join(SRC, 'components', 'schedule-session-modal.tsx'));
  return out;
}

describe('the manual meeting-room UX is gone from every mentor surface', () => {
  const files = mentorSurfaces();

  it('found mentor surfaces at all — an empty sweep would pass vacuously', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  // Each pattern is a distinct way the old two-paths screen could come back.
  const BANNED: Array<[string, RegExp]> = [
    ['the room setup heading', /Set your meeting room/i],
    ['the room-is-set confirmation', /(Your|My) meeting room is set/i],
    ['a room change affordance', /Change (my )?(meeting )?room/i],
    ['Google demoted to an alternative', /Or connect Google/i],
    ['a paste-your-link instruction', /[Pp]aste your (Meet|meeting|Zoom)/],
    ['a room URL input placeholder', /placeholder=["']meet\.google\.com\//],
    ['the make-your-own-room shortcut', /meet\.google\.com\/new/],
  ];

  it.each(BANNED)('no mentor surface contains %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(codeOnly(readFileSync(f, 'utf8'))));
    expect(
      offenders,
      `manual-room UX reappeared in:\n  ${offenders.join('\n  ')}\n`
      + 'A mentor must see exactly one setup action: Connect Google. If meeting '
      + 'infrastructure genuinely needs a second path, that is a product decision '
      + 'for the founder, not a card added back to a screen.',
    ).toEqual([]);
  });

  it('the deleted room components are not resurrected', () => {
    for (const gone of ['meeting-room-setup.tsx', 'meeting-room-card.tsx']) {
      expect(
        () => statSync(join(SRC, 'components', 'buddy', gone)),
        `${gone} is back — it was removed as the second setup path`,
      ).toThrow();
    }
  });
});

describe('GoogleConnect — the single setup action', () => {
  const render = (p: Partial<Parameters<typeof GoogleConnect>[0]> = {}) =>
    renderToStaticMarkup(
      <GoogleConnect
        googleConnected={false} hasRoom={false} googleEmail={null} {...p} />,
    );

  it('NOT connected: offers Connect Google as the primary action', () => {
    const html = render();
    expect(html).toMatch(/Connect Google Calendar/);

    // THE BUTTON, not merely the words somewhere on the card. Mutation testing
    // caught the first version of this assertion passing after the CTA label
    // was renamed: `/Connect Google/` was satisfied by the "Connect Google
    // Calendar" heading, so the guard would have watched the one element it
    // exists to protect disappear. Match the anchor to the OAuth route AND the
    // label inside it.
    expect(
      html,
      'the Connect Google CTA must be a link to /api/google/connect labelled "Connect Google"',
    ).toMatch(/<a href="\/api\/google\/connect\?from=[^"]*"[^>]*>Connect Google/);
  });

  it('NOT connected: never asks the mentor for a room', () => {
    const html = render();
    expect(html).not.toMatch(/meeting room/i);
    expect(html).not.toMatch(/<input/);
  });

  it('connected WITH a room: says connected, and nothing else is outstanding', () => {
    const html = render({ googleConnected: true, hasRoom: true, googleEmail: 'm@x.com' });
    expect(html).toMatch(/Google Connected ✓/);
    expect(html).toMatch(/m@x\.com/);
  });

  it('connected WITHOUT a room: does NOT claim readiness, and offers a recovery', () => {
    // THE FALSE-SUCCESS DEFECT. The callback stores the token and, when room
    // minting fails, used to redirect ?google=connected anyway — so the mentor
    // read "connected" while being unbookable, and (now that the paste card is
    // gone) had no way at all to act on it.
    const html = render({ googleConnected: true, hasRoom: false, googleEmail: 'm@x.com' });
    expect(html).not.toMatch(/Google Connected ✓/);
    expect(html).toMatch(/isn&#x27;t ready yet|isn't ready yet/);
    expect(html).toMatch(/Try connecting again/);
    expect(html).toMatch(/href="\/api\/google\/connect\?from=/);
  });

  it.each(['denied', 'failed', 'unavailable'])(
    'a %s round trip explains itself and still offers Connect Google',
    (status) => {
      const html = render({ googleStatus: status });
      expect(html).toMatch(/Connect Google/);
      // Never sends the mentor to a paste box as the consolation prize.
      expect(html).not.toMatch(/paste/i);
    },
  );

  it('renders no broken values in any state', () => {
    for (const p of [
      {}, { googleConnected: true, hasRoom: true }, { googleConnected: true, hasRoom: false },
    ]) {
      const html = render(p);
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('[object Object]');
    }
  });
});

describe('the two mentor steps stay separate and both stay visible', () => {
  const home = readFileSync(join(SRC, 'app', 'buddy', '(dashboard)', 'home', 'page.tsx'), 'utf8');
  const schedule = readFileSync(join(SRC, 'app', 'buddy', '(dashboard)', 'schedule', 'page.tsx'), 'utf8');

  it('home renders the Google CTA', () => {
    expect(codeOnly(home)).toMatch(/<GoogleConnect/);
  });

  it('schedule renders the Google CTA', () => {
    expect(codeOnly(schedule)).toMatch(/<GoogleConnect/);
  });

  it('home ALSO surfaces availability — the second step, not folded into the first', () => {
    // Dropping availability from the home setup block would leave a mentor who
    // has connected Google believing they are done while no student can pick a
    // time. Google and hours are two steps and must both be reachable.
    const code = codeOnly(home);
    expect(code).toMatch(/!readiness\.hasAvailability/);
    expect(code).toMatch(/Set your availability/);
  });

  it('the readiness card no longer duplicates the Google prompt', () => {
    const card = codeOnly(
      readFileSync(join(SRC, 'components', 'buddy', 'session-readiness.tsx'), 'utf8'),
    );
    expect(card).not.toMatch(/Google/);
  });
});
