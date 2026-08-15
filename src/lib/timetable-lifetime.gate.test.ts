import { describe, it, expect } from 'vitest';
import { buildDayPlan, type DayPlanInput } from './plan-day';
import { coachingBlocksForDate } from './timetable-day';
import { catExamDate } from './exam-calendar';
import { studyDayString } from './study-day';
import type { TimetableBlock } from './timetable';

// ── THE TIMETABLE LIFETIME GATE ─────────────────────────────────────────────
//
// The uploaded-timetable path is the riskiest road in the product and the last
// one still unsimulated. Founder, 14 Aug: "if someone uploads their timetable
// it must be implemented then and there, and the timetable built on our app
// through coverage matrix should become dead instantly. One study plan per
// student."
//
// It is risky because it obeys a DIFFERENT contract from every other day, and
// the difference is deliberate:
//
//   A generated day is SIZED from the student's committed hours, and planned
//   equals committed, always. That is the invariant plan-lifetime pins.
//
//   A timetable day is sized by THE SHEET. If the coaching plans five hours
//   and the student told us eight, the honest output is five — appending our
//   own topic to close the gap is the precise bug timetable-day exists to
//   kill (Vedashri, 13 Aug: a DILR topic her coaching never assigned).
//
// So a test that applied the budget rule here would be demanding the very bug
// we removed. What must hold instead is that the sheet is reproduced FAITHFULLY
// on the days it speaks, that the app takes over cleanly on the days it does
// not, and that the handover between those two worlds never drops a day.
//
// A sheet also RUNS OUT — it covers a month, the student has until November.
// The transition from "sheet owns the day" to "engine owns the day" happens
// once for every coaching student alive, and nothing until now has watched it
// happen.

const EXAM_ISO = studyDayString(catExamDate(2026));
const CONFIRMED = '2026-08-14';

function block(over: Partial<TimetableBlock>): TimetableBlock {
  return {
    day: null, date: null, dayIndex: null, start: null, end: null,
    allDay: false, section: 'QA', topic: null, label: 'x', minutes: null,
    ...over,
  };
}

/** A. Recurring weekly — "Mon 6-8pm QA". Never runs out. */
const WEEKLY: TimetableBlock[] = [
  block({ day: 0, section: 'QA', topic: 'Percentages', label: '2 hrs: Percentages', minutes: 120 }),
  block({ day: 1, section: 'VARC', topic: 'Reading Comprehension', label: 'RC drill', minutes: 90 }),
  block({ day: 2, section: 'DILR', topic: 'Arrangements', label: 'Arrangements set', minutes: 120 }),
  block({ day: 3, section: 'QA', topic: 'Time & Work', label: 'Time & Work', minutes: 90 }),
  block({ day: 4, section: 'VARC', topic: 'Para Jumbles', label: 'Para Jumbles', minutes: 60 }),
  block({ day: 5, section: 'DILR', topic: 'Tables', label: 'Tables practice', minutes: 120 }),
  // Sunday deliberately absent — a rest day the coaching planned.
];

/** B. Dated calendar — real dates, and it ENDS. This is the one that expires. */
const DATED: TimetableBlock[] = [
  block({ date: '2026-08-14', section: 'QA', topic: 'Percentages', label: 'Percentages', minutes: 120 }),
  block({ date: '2026-08-15', section: 'VARC', topic: 'Reading Comprehension', label: 'RC', minutes: 90 }),
  block({ date: '2026-08-16', section: 'DILR', topic: 'Arrangements', label: 'Arrangements', minutes: 120 }),
  block({ date: '2026-08-20', section: 'QA', topic: 'Geometry', label: 'Geometry', minutes: 150 }),
  block({ date: '2026-08-25', section: 'QA', topic: 'Algebra', label: 'Algebra', minutes: 120 }),
  // Nothing after 25 Aug — three months of runway left and no sheet for it.
];

/** C. Relative "Day 1..N" plan — no anchor of its own. */
const SEQUENCE: TimetableBlock[] = [
  block({ dayIndex: 1, section: 'QA', topic: 'Percentages', label: 'Day 1 Percentages', minutes: 120 }),
  block({ dayIndex: 2, section: 'VARC', topic: 'Reading Comprehension', label: 'Day 2 RC', minutes: 90 }),
  block({ dayIndex: 3, section: 'DILR', topic: 'Arrangements', label: 'Day 3 Arrangements', minutes: 120 }),
  block({ dayIndex: 4, section: 'QA', topic: 'Time & Work', label: 'Day 4 Time & Work', minutes: 90 }),
  block({ dayIndex: 5, section: 'QA', topic: 'Geometry', label: 'Day 5 Geometry', minutes: 120 }),
];

/** A sheet with junk rows — sleep, gym, lunch — that must never become tasks. */
const WITH_JUNK: TimetableBlock[] = [
  ...WEEKLY,
  block({ day: 0, section: null, topic: null, label: 'SLEEP', minutes: 480 }),
  block({ day: 1, section: null, topic: null, label: 'GYM', minutes: 60 }),
  block({ day: 2, section: null, topic: null, label: 'LUNCH', minutes: 45 }),
];

const SHEETS: { name: string; blocks: TimetableBlock[]; expires: boolean }[] = [
  { name: 'weekly recurring', blocks: WEEKLY, expires: false },
  { name: 'dated calendar (expires 25 Aug)', blocks: DATED, expires: true },
  { name: 'relative Day 1-5 sequence', blocks: SEQUENCE, expires: true },
  { name: 'weekly + junk rows', blocks: WITH_JUNK, expires: false },
];

interface Day {
  date: string;
  fromTimetable: boolean;
  tasks: { id: string; topic: string | null; label: string; estMinutes: number; section: string }[];
  estMinutes: number;
  hoursToday: number;
}

function liveWithSheet(blocks: TimetableBlock[], committedHours = 8): Day[] {
  const out: Day[] = [];
  let t = Date.parse(CONFIRMED + 'T00:00:00Z');
  const end = Date.parse(EXAM_ISO + 'T00:00:00Z');

  while (t <= end) {
    const today = new Date(t).toISOString().slice(0, 10);
    const plan = buildDayPlan({
      profile: {
        is_working_professional: false, is_repeater: false, target_percentile: 95,
        hours_available: committedHours, study_target_hours: String(committedHours),
        weekend_hours_available: committedHours,
        syllabus_target_date: '2026-10-15',
        self_reported_weakest_section: 'DILR', self_reported_strongest_section: 'QA',
        self_reported_weak_topic: null,
        baseline_varc: null, baseline_dilr: null, baseline_qa: null,
        attempt_year: 2026, current_stage: null, start_with: null,
        plan_source: 'coaching',
      },
      coverageRows: [],
      debriefRows: [],
      timetableRow: { blocks, confirmed_at: CONFIRMED },
      history: {
        recentTopics: [], daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {},
        timesPracticedByTopic: {}, postponedTopics: [], yesterday: null,
        yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: 0,
        daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
      } as unknown as DayPlanInput['history'],
      today,
      now: new Date(`${today}T09:00:00Z`),
    });

    out.push({
      date: today,
      fromTimetable: plan.fromTimetable,
      tasks: plan.tasks.map((k) => ({
        id: k.id, topic: k.topic ?? null, label: k.label,
        estMinutes: k.estMinutes, section: String(k.section),
      })),
      estMinutes: plan.estMinutes,
      hoursToday: plan.hoursToday,
    });
    t += 86_400_000;
  }
  return out;
}

const RUNS = new Map<string, Day[]>();
for (const s of SHEETS) RUNS.set(s.name, liveWithSheet(s.blocks));

describe('TIMETABLE LIFETIME: no day is ever lost between the two worlds', () => {
  it('every sheet produces a usable plan on every day to CAT day', () => {
    for (const s of SHEETS) {
      const days = RUNS.get(s.name)!;
      for (const d of days) {
        expect(d.tasks.length, `${s.name} @ ${d.date}: blank day`).toBeGreaterThan(0);
        expect(d.estMinutes, `${s.name} @ ${d.date}: zero minutes`).toBeGreaterThan(0);
      }
      expect(days[days.length - 1].date).toBe(EXAM_ISO);
    }
  });

  it('a day is either the sheet or the engine — never a blend of both', () => {
    // The Vedashri bug in one assertion. On a sheet-owned day EVERY task must
    // come from the sheet; the coverage matrix contributes nothing at all.
    for (const s of SHEETS) {
      for (const d of RUNS.get(s.name)!) {
        if (!d.fromTimetable) continue;
        const sheetToday = coachingBlocksForDate(s.blocks, CONFIRMED, d.date);
        const sheetTopics = new Set(sheetToday.map((b) => b.topic).filter(Boolean));
        for (const task of d.tasks) {
          if (!task.topic) continue;
          expect(sheetTopics.has(task.topic),
            `${s.name} @ ${d.date}: "${task.topic}" is in the plan but not in the sheet`).toBe(true);
        }
      }
    }
  });

  it("a sheet day is never padded up to the student's committed hours", () => {
    // The honest-output rule: 5h of coaching stays 5h even for an 8h student.
    // Pinned as a real inequality on at least one day, so a future change that
    // silently reintroduces padding fails here rather than in production.
    const days = RUNS.get('weekly recurring')!.filter((d) => d.fromTimetable);
    expect(days.length, 'no sheet-owned days at all').toBeGreaterThan(0);
    const shortDays = days.filter((d) => d.estMinutes < Math.round(d.hoursToday * 60));
    expect(shortDays.length, 'every sheet day exactly filled the budget — padding is back')
      .toBeGreaterThan(0);
  });

  it('junk rows never become study tasks', () => {
    for (const d of RUNS.get('weekly + junk rows')!) {
      for (const t of d.tasks) {
        expect(/sleep|gym|lunch/i.test(t.label), `${d.date}: "${t.label}" reached the plan`).toBe(false);
      }
    }
  });
});

describe('TIMETABLE LIFETIME: what happens when the sheet runs out', () => {
  it('an expiring sheet hands back to the engine, and the engine sizes the day properly', () => {
    for (const s of SHEETS.filter((x) => x.expires)) {
      const days = RUNS.get(s.name)!;
      const sheetDays = days.filter((d) => d.fromTimetable);
      const engineDays = days.filter((d) => !d.fromTimetable);

      expect(sheetDays.length, `${s.name}: sheet never owned a single day`).toBeGreaterThan(0);
      expect(engineDays.length, `${s.name}: sheet never handed back`).toBeGreaterThan(0);

      // Once the engine owns the day, the ordinary budget law applies again.
      for (const d of engineDays) {
        expect(d.estMinutes, `${s.name} @ ${d.date}: engine day off-budget`)
          .toBe(Math.round(d.hoursToday * 60));
      }
    }
  });

  it('expiry is FINAL — once a sheet is spent it never claims a day again', () => {
    // Written first as "ownership flips exactly once", which was wrong about
    // the product rather than about the code. A dated sheet legitimately has
    // GAPS: 14, 15, 16, then nothing until the 20th, because the coaching has
    // no class on the 17th. Falling back to the engine on those days is the
    // correct behaviour — the student still gets a plan — so ownership flips
    // back and forth all the way through the sheet's life.
    //
    // What must actually hold is that the LAST handover is permanent. A sheet
    // that went quiet in August must not wake up in October and start driving
    // days again from stale rows.
    for (const s of SHEETS.filter((x) => x.expires)) {
      const days = RUNS.get(s.name)!;
      const lastOwned = days.map((d) => d.fromTimetable).lastIndexOf(true);
      expect(lastOwned, `${s.name}: sheet never owned a day`).toBeGreaterThan(-1);
      const after = days.slice(lastOwned + 1);
      expect(after.length, `${s.name}: sheet ran to the exam, nothing to assert`).toBeGreaterThan(0);
      expect(after.every((d) => !d.fromTimetable),
        `${s.name}: sheet reclaimed a day after expiring`).toBe(true);
    }
  });

  it('a recurring weekly sheet keeps owning its days all the way to the exam', () => {
    // The opposite case: a weekly sheet has no end date, so it must still be
    // driving days in November. If it silently stopped, a coaching student
    // would lose their own plan in the final month without being told.
    const days = RUNS.get('weekly recurring')!;
    const november = days.filter((d) => d.date.startsWith('2026-11') && d.fromTimetable);
    expect(november.length, 'weekly sheet stopped owning days before the exam').toBeGreaterThan(0);
  });

  it('rest days the coaching planned fall back rather than showing an empty screen', () => {
    // WEEKLY has no Sunday row. Sunday must still be a real day.
    const sundays = RUNS.get('weekly recurring')!
      .filter((d) => new Date(d.date + 'T00:00:00Z').getUTCDay() === 0);
    expect(sundays.length).toBeGreaterThan(0);
    for (const d of sundays) {
      expect(d.fromTimetable, `${d.date}: sheet claimed a day it has no row for`).toBe(false);
      expect(d.tasks.length, `${d.date}: empty Sunday`).toBeGreaterThan(0);
    }
  });
});

describe('TIMETABLE LIFETIME: the sheet is reproduced, not reinterpreted', () => {
  it("every sheet-owned day uses the sheet's own minutes and order", () => {
    for (const s of SHEETS) {
      for (const d of RUNS.get(s.name)!) {
        if (!d.fromTimetable) continue;
        const sheet = coachingBlocksForDate(s.blocks, CONFIRMED, d.date)
          .filter((b) => (b.minutes ?? 0) >= 15 || b.minutes == null);
        const planTopics = d.tasks.map((t) => t.topic).filter(Boolean);
        const sheetTopics = sheet.map((b) => b.topic).filter(Boolean);
        expect(planTopics, `${s.name} @ ${d.date}: order or content changed`).toEqual(sheetTopics);
      }
    }
  });

  it('no duplicate topic or task id on any sheet-owned day', () => {
    for (const s of SHEETS) {
      for (const d of RUNS.get(s.name)!) {
        const ids = d.tasks.map((t) => t.id);
        expect(new Set(ids).size, `${s.name} @ ${d.date}: duplicate task id`).toBe(ids.length);
        const topics = d.tasks.map((t) => t.topic).filter(Boolean);
        expect(new Set(topics).size, `${s.name} @ ${d.date}: duplicate topic`).toBe(topics.length);
      }
    }
  });

  it('a low-hours student still gets their coaching day in full', () => {
    // The sheet outranks the student's number in BOTH directions: we do not pad
    // up to their hours, and we do not cut their coaching down to fit either.
    // A student whose coaching plans two hours is told the truth about their
    // day even if they committed one — timetable-day: "if the sheet priced
    // everything, the day is exactly as long as the coaching planned it".
    //
    // One hour, not two: at two the budget (120m) exactly equals the largest
    // block, so no day is STRICTLY over and the assertion proves nothing. The
    // first draft of this test made that mistake.
    const tight = liveWithSheet(WEEKLY, 1).filter((d) => d.fromTimetable);
    expect(tight.length).toBeGreaterThan(0);
    const overBudget = tight.filter((d) => d.estMinutes > Math.round(d.hoursToday * 60));
    expect(overBudget.length, 'coaching day was silently trimmed to the student\'s hours')
      .toBeGreaterThan(0);
  });
});
