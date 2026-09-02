// ── The student's PROFILE, for the counsellor ───────────────────────────────
//
// Founder, 2 Sep 2026: a Profile button beside every lead, opening "their
// whole profile". The sales 360 already carried the conversion brief — score,
// lane, symptoms, study strip, mock, pitch — and none of the plain facts a
// person expects when they say "profile": which exam, which attempt, working
// or in college, how many hours, which colleges, when they joined. A rep who
// opens Priya and cannot see that she is a working professional with two
// hours a night is about to give the wrong advice.
//
// Pure: a profiles row in, labelled facts out. Nothing here is a judgement —
// every line is something the student told us or the platform observed, and
// a field the student never filled is OMITTED, never rendered as a default
// (L1: a trustworthy UNKNOWN beats a precise lie).

export interface ProfileFact { label: string; value: string }

export interface ProfileRow {
  created_at?: string | null;
  email?: string | null;
  exam_target?: string | null;
  attempt_year?: number | null;
  attempt_number?: number | null;
  category?: string | null;
  college?: string | null;
  course_year?: number | null;
  is_working_professional?: boolean | null;
  work_ex_months?: number | null;
  coaching_enrolled?: boolean | null;
  hours_available?: number | null;
  weekend_hours_available?: number | null;
  study_target_hours?: number | null;
  study_window?: string | null;
  study_windows?: string[] | null;
  target_percentile?: number | string | null;
  dream_colleges?: string[] | null;
  starting_percentile?: number | string | null;
  last_year_percentile?: number | string | null;
  previous_percentile?: number | string | null;
  is_repeater?: boolean | null;
  signup_source?: string | null;
  attr_channel?: string | null;
  app_installed?: boolean | null;
  current_stage?: string | null;
  biggest_blocker?: string | null;
  success_goal?: string | null;
  self_reported_weak_topic?: string | null;
  onboarding_completed?: boolean | null;
}

const has = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0);

const pct = (v: number | string | null | undefined): string | null => {
  if (!has(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%ile` : String(v);
};

const humanise = (s: string): string => s.replace(/_/g, ' ');

/** Facts in the order a counsellor reads them: who, where they are, how they study, what they want. */
export function profileFacts(p: ProfileRow): ProfileFact[] {
  const out: ProfileFact[] = [];
  const add = (label: string, value: string | null | undefined) => { if (has(value)) out.push({ label, value: value as string }); };

  if (has(p.exam_target)) {
    add('Exam', [p.exam_target, has(p.attempt_year) ? String(p.attempt_year) : null].filter(Boolean).join(' '));
  }
  if (has(p.attempt_number)) add('Attempt', p.attempt_number === 1 ? 'first' : `#${p.attempt_number}`);
  else if (p.is_repeater === true) add('Attempt', 'repeater');
  if (p.is_repeater === true) {
    const prev = pct(p.last_year_percentile) ?? pct(p.previous_percentile);
    if (prev) add('Last attempt', prev);
  }

  if (p.is_working_professional === true) {
    add('Status', has(p.work_ex_months)
      ? `working professional · ${Math.round((p.work_ex_months as number) / 12 * 10) / 10} yrs experience`
      : 'working professional');
  } else if (has(p.college) || has(p.course_year)) {
    add('Status', [has(p.college) ? p.college : 'student', has(p.course_year) ? `year ${p.course_year}` : null].filter(Boolean).join(' · '));
  }
  if (has(p.category)) add('Category', p.category as string);
  if (p.coaching_enrolled === true) add('Coaching', 'enrolled elsewhere');
  else if (p.coaching_enrolled === false) add('Coaching', 'self-prep');

  if (has(p.hours_available) || has(p.weekend_hours_available)) {
    add('Hours', [
      has(p.hours_available) ? `${p.hours_available}h weekday` : null,
      has(p.weekend_hours_available) ? `${p.weekend_hours_available}h weekend` : null,
    ].filter(Boolean).join(' · '));
  }
  if (has(p.study_target_hours)) add('Daily target', `${p.study_target_hours}h`);
  const windows = has(p.study_windows) ? (p.study_windows as string[]).map(humanise).join(', ') : has(p.study_window) ? humanise(p.study_window as string) : null;
  add('Studies', windows);

  add('Target', pct(p.target_percentile));
  add('Started at', pct(p.starting_percentile));
  if (has(p.dream_colleges)) add('Dream colleges', (p.dream_colleges as string[]).join(', '));
  if (has(p.success_goal)) add('Goal', humanise(p.success_goal as string));
  if (has(p.current_stage)) add('Stage', humanise(p.current_stage as string));
  if (has(p.biggest_blocker)) add('Blocker', humanise(p.biggest_blocker as string));
  if (has(p.self_reported_weak_topic)) add('Weak topic (self)', p.self_reported_weak_topic as string);

  if (has(p.created_at)) {
    const joined = new Date(p.created_at as string);
    if (!Number.isNaN(joined.getTime())) {
      add('Joined', joined.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
        + (has(p.signup_source) ? ` · via ${humanise(p.signup_source as string)}` : has(p.attr_channel) ? ` · via ${humanise(p.attr_channel as string)}` : ''));
    }
  }
  if (p.app_installed === true) add('App', 'installed');
  if (p.onboarding_completed === false) add('Onboarding', 'not finished');
  if (has(p.email)) add('Email', p.email as string);
  return out;
}
