'use client';

import { useState } from 'react';

// ── "Which students should reach you?" ──────────────────────────────────────
//
// The mentor-facing half of the ₹299 launch. Framed entirely around what the
// mentor gets — students matched to them — because a form framed as
// "complete your profile" is admin, and admin does not get filled in.
//
// Five questions, in the order the WhatsApp message asks them, so a mentor who
// replied there can transcribe without re-thinking.

const SPECIALITIES = [
  { id: 'mock_analysis', label: 'Mock analysis' },
  { id: 'strategy', label: 'Strategy & planning' },
  { id: 'consistency', label: 'Consistency & routine' },
  { id: 'second_attempt', label: 'Second attempts' },
  { id: 'section_depth', label: 'One section in depth' },
] as const;

const SECTIONS = ['QA', 'VARC', 'DILR'] as const;
const NOTICE = [
  { hours: 24, label: 'Within 24 hours' },
  { hours: 72, label: 'Within 3 days' },
  { hours: 168, label: 'Weekends only' },
] as const;

const MAX = 2;

export function SpecialistForm({ initial }: {
  initial: {
    specialities: string[]; strongestSection: string | null; ownWeakestSection: string | null;
    attemptNumber: number | null; previousPercentile: number | null; languages: string[];
    weeklySessionCap: number | null; noticeHours: number | null; buddyStory: string | null;
  };
}) {
  const [specialities, setSpecialities] = useState<string[]>(initial.specialities ?? []);
  const [strongest, setStrongest] = useState(initial.strongestSection ?? '');
  const [ownWeak, setOwnWeak] = useState(initial.ownWeakestSection ?? '');
  const [attempt, setAttempt] = useState(initial.attemptNumber?.toString() ?? '');
  const [previous, setPrevious] = useState(initial.previousPercentile?.toString() ?? '');
  const [languages, setLanguages] = useState<string[]>(initial.languages ?? []);
  const [cap, setCap] = useState(initial.weeklySessionCap?.toString() ?? '');
  const [notice, setNotice] = useState(initial.noticeHours?.toString() ?? '');
  const [story, setStory] = useState(initial.buddyStory ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, value: string, max?: number) => {
    if (list.includes(value)) return set(list.filter((v) => v !== value));
    if (max && list.length >= max) return; // the cap, felt rather than explained
    set([...list, value]);
  };

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/buddy/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialities,
          strongest_section: strongest || null,
          own_weakest_section: ownWeak || null,
          attempt_number: attempt ? Number(attempt) : null,
          previous_percentile: previous ? Number(previous) : null,
          languages,
          weekly_session_cap: cap === '' ? null : Number(cap),
          notice_hours: notice ? Number(notice) : null,
          buddy_story: story,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(json.error ?? 'Could not save — try again.'); return; }
      setSaved(true);
    } catch {
      setError('Could not save — check your connection.');
    } finally {
      setSaving(false);
    }
  }

  const Chip = ({ on, children, onClick, disabled }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-transform active:scale-95 disabled:opacity-40 ${
        on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'
      }`}
    >{children}</button>
  );

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-4">
      <div>
        <h2 className="text-[15px] font-extrabold text-stone-900">Which students should reach you?</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
          We&apos;re opening single ₹299 sessions, and we match each student to the Buddy
          who fits their actual problem. These answers decide which students reach you.
        </p>
      </div>

      <section>
        <p className="text-[12px] font-bold text-stone-900">1. What are you genuinely best at?</p>
        <p className="mb-2 text-[11.5px] text-stone-500">Pick up to {MAX} — we match to specialists, not to everyone.</p>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALITIES.map((s) => (
            <Chip key={s.id} on={specialities.includes(s.id)}
              disabled={!specialities.includes(s.id) && specialities.length >= MAX}
              onClick={() => toggle(specialities, setSpecialities, s.id, MAX)}>{s.label}</Chip>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[12px] font-bold text-stone-900">2. Your sections</p>
        <p className="mb-2 text-[11.5px] text-stone-500">
          The second one matters most — we want to tell a student stuck in VARC that you struggled with VARC too.
        </p>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Strongest</p>
        <div className="mb-2.5 flex gap-1.5">
          {SECTIONS.map((s) => <Chip key={s} on={strongest === s} onClick={() => setStrongest(strongest === s ? '' : s)}>{s}</Chip>)}
        </div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">You struggled with</p>
        <div className="flex gap-1.5">
          {SECTIONS.map((s) => <Chip key={s} on={ownWeak === s} onClick={() => setOwnWeak(ownWeak === s ? '' : s)}>{s}</Chip>)}
        </div>
      </section>

      <section>
        <p className="text-[12px] font-bold text-stone-900">3. Your CAT attempts</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={attempt} onChange={(e) => setAttempt(e.target.value)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-[12.5px] text-stone-800">
            <option value="">Which attempt?</option>
            <option value="1">1st attempt</option>
            <option value="2">2nd attempt</option>
            <option value="3">3rd or more</option>
          </select>
          {attempt !== '' && attempt !== '1' && (
            <input value={previous} onChange={(e) => setPrevious(e.target.value)} inputMode="decimal"
              placeholder="Earlier %ile"
              className="w-32 rounded-lg border border-stone-300 px-2.5 py-1.5 text-[12.5px] text-stone-800" />
          )}
        </div>
        <div className="mt-2.5 flex gap-1.5">
          {['English', 'Hindi'].map((l) => (
            <Chip key={l} on={languages.includes(l)} onClick={() => toggle(languages, setLanguages, l)}>{l}</Chip>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[12px] font-bold text-stone-900">4. Your capacity</p>
        <p className="mb-2 text-[11.5px] text-stone-500">
          We will never book you past this. Honest numbers — 0 is a fine answer for a busy week.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric"
            placeholder="Sessions / week"
            className="w-36 rounded-lg border border-stone-300 px-2.5 py-1.5 text-[12.5px] text-stone-800" />
          <select value={notice} onChange={(e) => setNotice(e.target.value)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-[12.5px] text-stone-800">
            <option value="">How soon can you take one?</option>
            {NOTICE.map((n) => <option key={n.hours} value={n.hours}>{n.label}</option>)}
          </select>
        </div>
      </section>

      <section>
        <p className="text-[12px] font-bold text-stone-900">5. Two lines, in your words</p>
        <p className="mb-2 text-[11.5px] text-stone-500">
          Especially what you got wrong before you got it right. Students trust this far more than a percentile.
        </p>
        <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={3} maxLength={400}
          placeholder="I was a repeater. My mistake was taking mock after mock without ever working out why my score wasn't moving."
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[12.5px] leading-relaxed text-stone-800" />
      </section>

      <div className="flex items-center gap-3 border-t border-stone-100 pt-3">
        <button type="button" onClick={() => void save()} disabled={saving}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-[13px] font-bold text-white active:scale-[0.99] disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-emerald-700">✓ Saved — you can be matched now.</span>}
        {error && <span className="text-[12.5px] font-semibold text-rose-600">{error}</span>}
      </div>

      <p className="text-[11px] leading-relaxed text-stone-400">
        Photo and IIM proof: send them to the CareerRai team on WhatsApp — we verify the IIM
        before showing a &ldquo;verified&rdquo; badge on your profile.
      </p>
    </div>
  );
}
