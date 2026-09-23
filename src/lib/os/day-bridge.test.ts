import { describe, it, expect } from 'vitest';
import { stateLeftBehind, classifyReturn, type DayInputs } from './day-bridge';

const T = (h: number, m = 0) => `2026-09-19T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

const plan = [
  { id: 'dilr-priority', topic: 'Tables', section: 'DILR' },
  { id: 'varc-set', topic: 'RC', section: 'VARC' },
  { id: 'qa-set-2', topic: 'Percentages', section: 'QA' },
];

function day(over: Partial<DayInputs> = {}): DayInputs {
  return {
    date: '2026-09-19',
    tasks: plan,
    completions: [],
    report: null,
    resourceOpens: [],
    logOpens: 0,
    sheetLogged: false,
    lastHiddenAt: null,
    lastEventAt: null,
    ...over,
  };
}

describe('stateLeftBehind — what the plan card was offering when they left', () => {
  it('Ujjwal, 19 Sep: one task ticked, resource opened, two left — the next task is the second in plan order', () => {
    const s = stateLeftBehind(day({
      completions: [{ task_id: 'dilr-priority', completed_at: T(12, 34), confidence: 'green' }],
      report: { study_duration: 4.3, study_duration_source: 'credited', created_at: T(12, 34) },
      resourceOpens: [{ taskId: 'dilr-priority', topic: 'Tables', at: T(12, 35) }],
      lastHiddenAt: T(12, 36),
    }));
    expect(s.planned).toBe(3);
    expect(s.done).toBe(1);
    expect(s.remaining).toBe(2);
    expect(s.nextTaskId).toBe('varc-set');
    expect(s.nextTopic).toBe('RC');
    expect(s.lastCompletedTopic).toBe('Tables');
    expect(s.unfinishedTopics).toEqual(['RC', 'Percentages']);
    expect(s.unfinished).toBe(true);
    expect(s.resourceOpened).toBe(true);
    expect(s.dayClosed).toBe(true);
    expect(s.studyPath).toBe('tick');
    expect(s.sessionEnd).toEqual({ at: T(12, 36), kind: 'inferred_hidden' });
    expect(s.continuationPath).toBe('unfinished_plan');
  });

  it('a half tick counts as done for "next" but leaves its topic unfinished', () => {
    const s = stateLeftBehind(day({
      completions: [{ task_id: 'dilr-priority', completed_at: T(9), confidence: 'blue' }],
    }));
    expect(s.done).toBe(1);
    expect(s.half).toBe(1);
    expect(s.nextTaskId).toBe('varc-set');
    expect(s.unfinishedTopics).toContain('Tables');
    expect(s.unfinished).toBe(true);
  });

  it('a fully ticked plan has no next task and is plan_done', () => {
    const s = stateLeftBehind(day({
      completions: plan.map((t, i) => ({ task_id: t.id, completed_at: T(9, i), confidence: 'green' })),
      report: { study_duration: 6, study_duration_source: 'credited', created_at: T(9) },
    }));
    expect(s.remaining).toBe(0);
    expect(s.nextTaskId).toBeNull();
    expect(s.unfinishedTopics).toEqual([]);
    expect(s.unfinished).toBe(false);
    expect(s.continuationPath).toBe('plan_done');
  });

  it('a sheet-only day is recorded as such — the tick is not the only door', () => {
    const s = stateLeftBehind(day({
      sheetLogged: true,
      logOpens: 1,
      report: { study_duration: 2, study_duration_source: null, created_at: T(18) },
    }));
    expect(s.studyPath).toBe('sheet');
    expect(s.logOpened).toBe(true);
    expect(s.dayClosed).toBe(true);
  });

  it('a zero-hour row is NOT a closed study day', () => {
    const s = stateLeftBehind(day({
      report: { study_duration: 0, study_duration_source: 'declared_zero', created_at: T(20) },
    }));
    expect(s.dayClosed).toBe(false);
    expect(s.studyPath).toBe('none');
  });

  it('no plan generated is its own state, not an empty plan', () => {
    const s = stateLeftBehind(day({ tasks: null }));
    expect(s.continuationPath).toBe('no_plan');
    expect(s.planned).toBe(0);
    expect(s.unfinished).toBe(false);
  });

  it('the session end is inferred, and says which kind of inference', () => {
    expect(stateLeftBehind(day({ lastEventAt: T(22) })).sessionEnd).toEqual({ at: T(22), kind: 'inferred_last_event' });
    expect(stateLeftBehind(day()).sessionEnd).toEqual({ at: null, kind: 'none' });
    expect(stateLeftBehind(day({ lastHiddenAt: T(21), lastEventAt: T(22) })).sessionEnd.kind).toBe('inferred_hidden');
  });
});

describe('classifyReturn — resume, continue, restart, browse, log, elsewhere, gone', () => {
  const day1 = {
    unfinishedTopics: ['RC', 'Percentages'],
    plannedTopics: ['Tables', 'RC', 'Percentages'],
    sessionEnd: { at: T(12, 36), kind: 'inferred_hidden' as const },
  };
  const back = (over: Partial<ReturnInputsDay2> = {}): ReturnInputsDay2 => ({
    entered: true, firstEventAt: '2026-09-20T01:39:00.000Z', firstEventKind: 'app_open', launch: 'icon',
    ticks: [], sheetLogged: false, screens: ['/student/tracker'], studied: false, ...over,
  });
  type ReturnInputsDay2 = Parameters<typeof classifyReturn>[0]['day2'];

  it('no later event at all is abandonment, with no time-to-reentry', () => {
    const r = classifyReturn({ day1, day2: back({ entered: false, firstEventAt: null, screens: [] }) });
    expect(r.kind).toBe('G_abandoned');
    expect(r.msToReentry).toBeNull();
  });

  it('a first tick on a topic Day-1 left unfinished is a resume', () => {
    const r = classifyReturn({ day1, day2: back({ ticks: [{ task_id: 'varc-set-2', topic: 'RC', at: T(2) }], studied: true }) });
    expect(r.kind).toBe('A_resumed_unfinished');
    expect(r.studied).toBe(true);
    expect(r.msToReentry).toBe(Date.parse('2026-09-20T01:39:00.000Z') - Date.parse(T(12, 36)));
  });

  it('a first tick on a Day-1 topic that WAS finished continues the plan; a new topic restarts', () => {
    expect(classifyReturn({ day1, day2: back({ ticks: [{ task_id: 'x', topic: 'Tables', at: T(2) }] }) }).kind).toBe('B_continued_plan');
    expect(classifyReturn({ day1, day2: back({ ticks: [{ task_id: 'y', topic: 'Geometry', at: T(2) }] }) }).kind).toBe('C_started_new_task');
  });

  it('the FIRST tick decides, not the most convenient one', () => {
    const r = classifyReturn({ day1, day2: back({ ticks: [
      { task_id: 'y', topic: 'Geometry', at: T(2) },
      { task_id: 'z', topic: 'RC', at: T(3) },
    ] }) });
    expect(r.kind).toBe('C_started_new_task');
  });

  it('a tick with no topic is a new task, never a resume', () => {
    expect(classifyReturn({ day1, day2: back({ ticks: [{ task_id: 'mock', topic: null, at: T(2) }] }) }).kind).toBe('C_started_new_task');
  });

  it('the sheet alone is log-only; the tracker alone is browsing; elsewhere is elsewhere', () => {
    expect(classifyReturn({ day1, day2: back({ sheetLogged: true }) }).kind).toBe('E_log_only');
    expect(classifyReturn({ day1, day2: back() }).kind).toBe('D_browsed_no_action');
    expect(classifyReturn({ day1, day2: back({ screens: ['/student/buddy', '/student/community'] }) }).kind).toBe('F_other_surface');
  });

  it('opening the same screen is not a resume', () => {
    // The screen came back; no relationship to Day-1 state exists.
    const r = classifyReturn({ day1, day2: back({ screens: ['/student/tracker', '/student/plan'] }) });
    expect(r.kind).toBe('D_browsed_no_action');
    expect(r.reachedStudySurface).toBe(true);
  });

  it('time to re-entry is unknown when Day-1 has no session end', () => {
    const r = classifyReturn({ day1: { ...day1, sessionEnd: { at: null, kind: 'none' } }, day2: back() });
    expect(r.msToReentry).toBeNull();
  });
});
