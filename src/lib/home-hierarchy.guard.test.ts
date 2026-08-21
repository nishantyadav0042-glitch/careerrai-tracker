import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── What Home is allowed to be ──────────────────────────────────────────────
//
// Home's job is today's study action. Everything else on it earns its place:
// the Insight speaks about the student, the timetable feeds personalisation,
// and exactly ONE commercial line exists.

const HOME = readFileSync('src/app/student/tracker/page.tsx', 'utf8');
const INSIGHT = readFileSync('src/components/home/insight-bubble.tsx', 'utf8');

describe('CareerRai Insight is a branded moment, not a widget', () => {
  it('carries the full brand name, not a clever half-name', () => {
    // "Rai noticed" was accurate about the mechanism and spent the moment on
    // a sentence. A student should build ONE association here: CareerRai is
    // the system that understands me.
    expect(INSIGHT).toContain('CareerRai Insight');
    expect(INSIGHT).not.toMatch(/>\s*Rai noticed\s*</);
  });

  it('animates a NEW insight and stays static for one already seen', () => {
    // The same drop three times a day is how a product earns notification
    // fatigue in a week. The key is per-INSIGHT, not per-day.
    expect(INSIGHT).toContain('alreadySeenThisInsight');
    expect(INSIGHT).toMatch(/animKey\(title\)/);
  });

  it('respects reduced motion', () => {
    expect(INSIGHT).toContain('prefers-reduced-motion');
  });

  it('animates transform and opacity only — Home must never jump', () => {
    // A card that pushes the plan down while a thumb is already reaching for
    // it is worse than no animation at all. Only transform/opacity are
    // touched, and never a layout property.
    expect(INSIGHT).toMatch(/style\.transform = 'translateY/);
    expect(INSIGHT).toMatch(/style\.opacity/);
    const effect = INSIGHT.slice(INSIGHT.indexOf('const cardRef'), INSIGHT.indexOf('if (dismissed)'));
    for (const layoutProp of ['height', 'margin', 'padding', 'display', 'position']) {
      expect(effect, `the entrance must not touch ${layoutProp}`).not.toMatch(new RegExp(`style\\.${layoutProp}`));
    }
  });

  it('still writes its seen key ONLY on a deliberate dismiss', () => {
    // The original defect: marking read on mount meant a student who glanced
    // away was permanently marked as having read it.
    const dismiss = INSIGHT.slice(INSIGHT.indexOf('function dismiss()'));
    expect(dismiss).toContain('localStorage.setItem(seenKey()');
  });
});

describe('the timetable stays on Home', () => {
  it('the coaching-timetable surface is mounted', () => {
    // Removed on 22 Aug as declutter and reversed within the hour: this is
    // the INGESTION POINT for coaching students, not decoration. Decluttering
    // Home must never cost a capability.
    expect(HOME).toContain('<HomeTimetableCard />');
  });
});

describe('exactly one commercial line on Home', () => {
  it('the ₹299 door names the offer and hands off — it does not sell here', () => {
    expect(HOME).toContain('Audit Your CAT Prep with IIM Alumni');
    expect(HOME).toMatch(/href="\/student\/buddy"/);
  });

  it('a student who already pays is never shown the ask', () => {
    // Showing a paying student a "₹299" ask is the paywall-to-a-payer defect
    // this codebase has already paid for once.
    expect(HOME).toMatch(/!profile\?\.is_premium && !buddyId/);
  });

  it('Home carries no second price and no ladder', () => {
    const body = HOME.slice(HOME.indexOf('Audit Your CAT Prep'), HOME.indexOf('Audit Your CAT Prep') + 900);
    expect(body).not.toContain('₹999');
    expect(body).not.toContain('₹2,999');
  });
});

describe('Daily Pick asks for a challenge, not a confession', () => {
  const PAGE = readFileSync('src/app/student/community/page.tsx', 'utf8');
  const SHEET = readFileSync('src/components/community-submit.tsx', 'utf8');

  it('the page and the sheet tell the same story', () => {
    expect(PAGE).toContain('Solve something tough. Challenge others');
    expect(SHEET).toContain('Solve something tough. Challenge others.');
  });

  it('"Stuck on something?" is gone from the community surface', () => {
    // It cast the student as the one with the problem and CareerRai as a help
    // desk. The paid buddy urgent-call panel keeps its own wording — that IS
    // a help request, and this rule does not reach it.
    expect(PAGE).not.toContain('Stuck on something');
    expect(SHEET).not.toMatch(/>Stuck on something/);
  });

  it('competitive energy without turning peers into rivals', () => {
    // What the STUDENT reads, not what the file says: the comments here
    // deliberately record "challenge your competitors" as the phrasing we
    // rejected, and a guard that matched characters would flag the very note
    // explaining the rule. Strip comments, then judge.
    const visible = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const src of [visible(PAGE), visible(SHEET)]) {
      expect(src).not.toMatch(/competitor/i);
      expect(src).not.toMatch(/beat other/i);
    }
  });
});
