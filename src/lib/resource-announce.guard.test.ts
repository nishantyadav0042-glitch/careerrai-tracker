/**
 * ── An announcement may only promise what actually shipped ──────────────────
 *
 * EvidenceAnnounce (removed 22 Aug) told every student "log your correct
 * answers" for eight days after the capture UI had been deleted. We advertised
 * the one capability the product did not have, to the students who most needed
 * it, and zero students ever logged a practice outcome.
 *
 * These tests are that lesson, made mechanical. They fail if the announcement
 * starts promising the practice layer we deliberately have not built.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOPIC_RESOURCES } from './topic-resources';
import { activationSlotCopy, reactivationSlotCopy, lessonLinkAnnounceCopy,
         RESOURCE_ANNOUNCE_DAY, RESOURCE_ANNOUNCE_SLOT } from './companion';
import { resourceForTask } from './routine-engine';

const SRC = join(__dirname, '..');
const ANNOUNCE = join(SRC, 'components', 'resource-announce.tsx');
const LAYOUT = join(SRC, 'app', 'student', 'layout.tsx');
const CRON = join(SRC, 'app', 'api', 'cron', 'study-companion', 'route.ts');
const VERCEL = join(SRC, '..', 'vercel.json');
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the announcement promises only what exists', () => {
  it('the capability it describes is actually reachable', () => {
    // The EvidenceAnnounce failure in one assertion: if no topic can produce a
    // concept resource, this announcement must not ship.
    const reachable = Object.keys(TOPIC_RESOURCES)
      .filter((t) => resourceForTask(t, 'foundation') !== null);
    expect(reachable.length, 'nothing to announce').toBeGreaterThan(0);
  });

  it('never promises a link on practice tasks', () => {
    // Practice resources do not exist and no video will ever fill them. The
    // copy must not imply otherwise.
    const text = read(ANNOUNCE);
    expect(text).toMatch(/Practice tasks don&rsquo;t have links yet/);
    expect(text).not.toMatch(/practice questions here|solve \d+ questions here/i);
  });

  it('says the link is optional and changes nothing', () => {
    const text = read(ANNOUNCE);
    expect(text).toMatch(/optional/);
    expect(text).toMatch(/changes nothing about your task/);
  });

  it('points at the feedback we actually read', () => {
    expect(read(ANNOUNCE)).toMatch(/Not helpful/);
  });
});

describe('the announcement cannot nag', () => {
  it('shows once ever, not once a day', () => {
    const s = code(ANNOUNCE);
    expect(s).toContain('cr_resource_announce_v1');
    expect(s).toContain('localStorage.setItem(SEEN_KEY');
  });

  it('takes the shared daily slot rather than stacking', () => {
    expect(code(ANNOUNCE)).toContain('claimDailyModal()');
  });

  it('outranks the buddy nudge, which shares the same once-a-day slot', () => {
    // Both call claimDailyModal(). Before this was explicit the winner was
    // whichever effect ran first — JSX order — so a reorder of the tree would
    // have silently swapped a real priority.
    const s = code(LAYOUT);
    expect(s).toMatch(/showBuddyNudge[\s\S]{0,240}!showResourceAnnounce/);
    expect(s.indexOf('const showResourceAnnounce')).toBeLessThan(s.indexOf('const showBuddyNudge'));
  });

  it('never fires over a blocking flow or on a student who onboarded today', () => {
    const s = code(LAYOUT);
    expect(s).toMatch(/showResourceAnnounce = noBlockingModal && !showCoverageReview/);
    expect(s).toContain('!onboardedTodayIst');
  });

  it('is dismissible and gates nothing', () => {
    const s = code(ANNOUNCE);
    expect(s).toContain('Got it');
    expect(s).not.toContain('complete-task');
    expect(s).not.toContain('required');
  });

  it('records that it was seen and dismissed', () => {
    const s = code(ANNOUNCE);
    expect(s).toContain("track('resource_announce_shown'");
    expect(s).toContain("track('resource_announce_dismissed'");
  });
});

// ── The push half ───────────────────────────────────────────────────────────
//
// The in-app card only reaches a student who already opened the app. The
// morning push is what gets them to open it. It is NOT a blast script: the
// Notification OS is decision-first, so this is laid over the decision each
// student's own cadence already made, and cannot cause a send.

const ANNOUNCE_CTX = { firstName: 'Aarav', daysToExam: 47, rotate: 3, weakest: 'QA', dreamCollege: 'IIM Ahmedabad' };

describe('the announcement push rides a decision that actually fires', () => {
  it('uses a slot that is scheduled in vercel.json', () => {
    // The bug this exists for: the announcement was first written into the
    // 09:30 `morning` slot, which has NO cron entry. It would have shipped,
    // passed every other test, and reached nobody. Production confirmed it —
    // zero `Companion 09:30` notifications had ever been sent.
    const crons = JSON.parse(read(VERCEL)).crons as { path: string }[];
    const scheduled = crons
      .filter((c) => c.path.includes('/api/cron/study-companion'))
      .map((c) => new URL(c.path, 'https://x').searchParams.get('slot'));
    expect(scheduled, 'announcement slot has no cron').toContain(RESOURCE_ANNOUNCE_SLOT);
  });

  it('is applied after every cadence has decided, so it can never cause a send', () => {
    const s = code(CRON);
    const nullCheck = s.indexOf('if (!copy) { skipped++; continue; }');
    const applied = s.indexOf('lessonLinkAnnounceCopy(');
    expect(nullCheck).toBeGreaterThan(-1);
    expect(applied).toBeGreaterThan(nullCheck);
  });

  it('reaches every cadence, not only the active minority', () => {
    // Nearly every student is in the activation cadence. An announcement that
    // only altered the active-student branch would reach almost nobody.
    for (const base of [
      activationSlotCopy(RESOURCE_ANNOUNCE_SLOT, ANNOUNCE_CTX),
      reactivationSlotCopy(RESOURCE_ANNOUNCE_SLOT, { ...ANNOUNCE_CTX, daysSinceLastLog: 4 }),
    ]) {
      expect(base, 'cadence has no copy for the announcement slot').not.toBeNull();
      const news = lessonLinkAnnounceCopy(base!, 'Aarav');
      expect(news.title).not.toBe(base!.title);
      expect(news.body).toMatch(/lesson link/);
    }
  });

  it('keeps the underlying expected action, so attribution stays comparable', () => {
    const base = activationSlotCopy(RESOURCE_ANNOUNCE_SLOT, ANNOUNCE_CTX)!;
    expect(lessonLinkAnnounceCopy(base, 'Aarav').expectedAction).toBe(base.expectedAction);
  });

  it('never promises a practice link in the push either', () => {
    const base = activationSlotCopy(RESOURCE_ANNOUNCE_SLOT, ANNOUNCE_CTX)!;
    const { title, body } = lessonLinkAnnounceCopy(base, 'Aarav');
    expect(`${title} ${body}`).not.toMatch(/practice|questions|solve/i);
  });

  it('stays short enough to survive a push preview', () => {
    const base = activationSlotCopy(RESOURCE_ANNOUNCE_SLOT, ANNOUNCE_CTX)!;
    const { title, body } = lessonLinkAnnounceCopy(base, 'Aarav');
    expect(title.length).toBeLessThanOrEqual(65);
    expect(body.length).toBeLessThanOrEqual(140);
  });
});

describe('the announcement push expires by date, not by memory', () => {
  it('is pinned to a single calendar day', () => {
    expect(RESOURCE_ANNOUNCE_DAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fires on that day and that slot only', () => {
    // EvidenceAnnounce ran for eight days because nothing stopped it. A date
    // equality check stops this one whether or not anyone remembers to.
    const s = code(CRON);
    expect(s).toContain('slot === RESOURCE_ANNOUNCE_SLOT && today === RESOURCE_ANNOUNCE_DAY');
    expect(s.match(/lessonLinkAnnounceCopy\(/g)?.length).toBe(1);
  });

  it('leaves a reason string that says which decision carried it', () => {
    // The morning check reads `notifications.reason`; without this the
    // announcement would be invisible in the one table that records it.
    expect(code(CRON)).toMatch(/reason = `\$\{reason\} . lesson-link announcement`/);
  });
});
