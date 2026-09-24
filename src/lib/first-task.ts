import { studyDayString } from './study-day';

// ── The first day, done instead of explained (24 Sep) ───────────────────────
//
// Founder, 24 Sep, after three options were put to him: "I liked the
// combination on all 3 plus… don't restrict to 2 hrs daily… it can vary
// student to student."
//
// Measured that day: of 743 students who signed up 7–37 days earlier, 103
// (14%) logged within 24 hours. The first session never told them that
// CareerRai does not teach (it says what to study; the studying happens in
// their own material or the one linked video), and the only ask it made was a
// "log your study" sheet that opened before they could have studied anything.
//
// So the first day now runs: how it works (in the tour) → your first task, now
// or at a time you choose → the log is asked for only after the studying.
// This module holds the rules; components/first-task-flow.tsx renders them.
//
// Every number shown to the student is THEIR plan's number. The plan is sized
// by routine-engine from the hours the student gave (hoursForDayOf), so no
// copy here may state a fixed daily load.

export type StudySlot = 'morning' | 'afternoon' | 'evening' | 'night';

/** In the order a student reads a day. `from` is the IST hour the slot opens. */
export const STUDY_SLOTS: { slot: StudySlot; label: string; from: number }[] = [
  { slot: 'morning', label: 'Morning', from: 6 },
  { slot: 'afternoon', label: 'Afternoon', from: 12 },
  { slot: 'evening', label: 'Evening', from: 17 },
  { slot: 'night', label: 'Night', from: 21 },
];

export type CouldntReason = 'too_hard' | 'no_time' | 'where_to_study';
export const COULDNT_REASONS: { reason: CouldntReason; label: string }[] = [
  { reason: 'too_hard', label: 'Too hard' },
  { reason: 'no_time', label: 'No time' },
  { reason: 'where_to_study', label: 'Didn’t know where to study' },
];

/** Per device. Set the moment the student makes any choice on the sheet, so a
 *  student who closes the app mid-sheet is asked again next time. */
export const FIRST_TASK_FLOW_KEY = 'cr_first_task_flow_v1';
/** The time a student promised: { day, slot, at }. Read on later opens. */
export const FIRST_TASK_PROMISE_KEY = 'cr_first_task_promise_v1';

export interface StudyPromise { day: string; slot: StudySlot; at: number }

const IST_OFFSET_MS = 330 * 60_000;

/** Hour of the day in IST, 0–23. */
export function istHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** Minutes past IST midnight, 0–1439. */
function istMinutes(now: Date): number {
  const d = new Date(now.getTime() + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// 00:00–05:29 IST is the END of the previous study day (rollover 05:30), so
// every slot of that day has already opened by then.
const ROLLOVER_MIN = 5 * 60 + 30;

export function slotLabel(slot: StudySlot): string {
  return STUDY_SLOTS.find((s) => s.slot === slot)?.label ?? slot;
}

/**
 * Is the promised time here? Only on the same study day (05:30 IST rollover,
 * the day logs are filed under), and only once the slot has opened. A promise
 * from yesterday is not a reason to ask today.
 */
export function promiseDue(p: StudyPromise | null, now: Date): boolean {
  if (!p) return false;
  if (p.day !== studyDayString(now)) return false;
  const from = STUDY_SLOTS.find((s) => s.slot === p.slot)?.from;
  if (from == null) return false;
  const m = istMinutes(now);
  // Night runs past midnight: 00:00–05:29 IST still belongs to that study day.
  return m >= from * 60 || m < ROLLOVER_MIN;
}

/** "45 min", "1 h", "1 h 30 min". Never rounds a real plan up or down. */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** The first task the student has not marked, in plan order. */
export function firstOpenTask<T extends { id: string }>(tasks: T[], completedIds: ReadonlySet<string>): T | null {
  return tasks.find((t) => !completedIds.has(t.id)) ?? null;
}

/** "3 tasks, about 1 h 30 min" from the student's own plan, or null if empty. */
export function planSizeLine(tasks: { estMinutes: number }[]): string | null {
  if (tasks.length === 0) return null;
  const minutes = tasks.reduce((sum, t) => sum + (Number.isFinite(t.estMinutes) ? t.estMinutes : 0), 0);
  const count = tasks.length === 1 ? '1 task' : `${tasks.length} tasks`;
  return minutes > 0 ? `${count}, about ${formatMinutes(minutes)}` : count;
}

export function readPromise(): StudyPromise | null {
  try {
    const raw = localStorage.getItem(FIRST_TASK_PROMISE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StudyPromise>;
    if (typeof p.day !== 'string' || typeof p.at !== 'number') return null;
    if (!STUDY_SLOTS.some((s) => s.slot === p.slot)) return null;
    return p as StudyPromise;
  } catch {
    return null;
  }
}

/**
 * The study day a promise belongs to. Picking Morning, Afternoon or Evening
 * between midnight and 05:30 IST means the coming day, which is the NEXT study
 * day; only Night can mean the one still running.
 */
export function promiseDay(slot: StudySlot, now: Date): string {
  if (slot !== 'night' && istMinutes(now) < ROLLOVER_MIN) {
    return studyDayString(new Date(now.getTime() + 6 * 3_600_000));
  }
  return studyDayString(now);
}

export function writePromise(slot: StudySlot, now: Date): StudyPromise {
  const p: StudyPromise = { day: promiseDay(slot, now), slot, at: now.getTime() };
  try { localStorage.setItem(FIRST_TASK_PROMISE_KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
  return p;
}
