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
import { planMorningCopy, planMorningCopyWithLessonNews, RESOURCE_ANNOUNCE_DAY } from './companion';
import { resourceForTask } from './routine-engine';

const SRC = join(__dirname, '..');
const ANNOUNCE = join(SRC, 'components', 'resource-announce.tsx');
const LAYOUT = join(SRC, 'app', 'student', 'layout.tsx');
const CRON = join(SRC, 'app', 'api', 'cron', 'study-companion', 'route.ts');
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
// Notification OS is decision-first, so this rides the already-approved 09:30
// companion decision and only changes that one morning's body.

describe('the announcement push rides the approved morning decision', () => {
  it('keeps the title that already earns opens', () => {
    const plain = planMorningCopy('Aarav', 'Geometry', 'RC', 4, 2.5);
    const news = planMorningCopyWithLessonNews('Aarav', 'Geometry', 'RC');
    expect(news.title).toBe(plain.title);
  });

  it('keeps the same expected action, so dedup and attribution are unchanged', () => {
    const plain = planMorningCopy('Aarav', 'Geometry', 'RC', 4, 2.5);
    const news = planMorningCopyWithLessonNews('Aarav', 'Geometry', 'RC');
    expect(news.expectedAction).toBe(plain.expectedAction);
  });

  it('still names the plan — the news is additive, not a replacement', () => {
    const news = planMorningCopyWithLessonNews('Aarav', 'Geometry', 'RC');
    expect(news.body).toContain('Geometry');
    expect(news.body).toContain('RC');
    const solo = planMorningCopyWithLessonNews('Aarav', 'Geometry', null);
    expect(solo.body).toContain('Geometry');
    expect(solo.body).not.toContain('then');
  });

  it('never promises a practice link in the push either', () => {
    for (const second of ['RC', null]) {
      const body = planMorningCopyWithLessonNews('Aarav', 'Geometry', second).body;
      expect(body).not.toMatch(/practice|questions|solve/i);
    }
  });
});

describe('the announcement push expires by date, not by memory', () => {
  it('is pinned to a single calendar day', () => {
    expect(RESOURCE_ANNOUNCE_DAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fires only on that day, behind the ordinary morning branch', () => {
    // EvidenceAnnounce ran for eight days because nothing stopped it. A date
    // equality check stops this one whether or not anyone remembers to.
    const s = code(CRON);
    expect(s).toContain('today === RESOURCE_ANNOUNCE_DAY');
    expect(s.match(/planMorningCopyWithLessonNews\(/g)?.length).toBe(1);
  });

  it('does not displace the coaching-class morning, which is more specific', () => {
    const s = code(CRON);
    const classAt = s.indexOf('classMorningCopy(');
    const newsAt = s.indexOf('planMorningCopyWithLessonNews(');
    expect(classAt).toBeGreaterThan(-1);
    expect(classAt).toBeLessThan(newsAt);
  });
});
