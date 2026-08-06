'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Trash2, Check } from 'lucide-react';
import { whenLabel, timeLabel, ALLOWED_TOPICS, type TimetableBlock, type TimetableSection } from '@/lib/timetable';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// The buddy's editor for their student's coaching timetable.
//
// Founder, 7 Aug: the timetable is curated "personally with buddy". The
// student uploads whatever the coaching sent; here the buddy fixes the rows
// the scanner mis-read, deletes classes the student dropped, and adds the
// ones the sheet never mentioned. Saving runs the same alignment as a
// student upload — coverage priorities, today's class, plan rebuild — so an
// edit here shows up in the student's plan the next time it builds.
//
// Topics are a strict dropdown of OUR topic names, because a free-typed topic
// the planner has never heard of aligns nothing and silently does no work.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SECTIONS: TimetableSection[] = ['QA', 'VARC', 'DILR'];

const emptyRow = (): TimetableBlock => ({
  day: 0, date: null, dayIndex: null, start: null, end: null,
  allDay: true, section: 'QA', topic: null, label: '', minutes: null,
});

export function StudentTimetableEditor({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [blocks, setBlocks] = useState<TimetableBlock[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/buddy/student-timetable?studentId=${studentId}`);
        const json = await res.json();
        if (res.ok) setBlocks((json.timetable?.blocks as TimetableBlock[] | null) ?? []);
        else setError(json.error ?? 'Could not load.');
      } catch {
        setError('Could not load.');
      }
      setLoading(false);
    })();
  }, [studentId]);

  const topicsFor = useMemo(() => {
    const by: Record<TimetableSection, string[]> = { QA: [], VARC: [], DILR: [] };
    for (const t of ALLOWED_TOPICS) {
      const sec = TOPIC_METADATA[t]?.section as TimetableSection | undefined;
      if (sec) by[sec].push(t);
    }
    return by;
  }, []);

  const patch = useCallback((i: number, changes: Partial<TimetableBlock>) => {
    setBlocks((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], ...changes };
      return next;
    });
    setDirty(true);
    setSavedNote(null);
  }, []);

  const remove = useCallback((i: number) => {
    setBlocks((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
    setDirty(true);
    setSavedNote(null);
  }, []);

  async function save() {
    if (!blocks) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/buddy/student-timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, blocks }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save.');
      } else {
        setDirty(false);
        setSavedNote(json.planRebuilt
          ? `Saved — ${studentName.split(' ')[0]}'s plan for today rebuilds around this.`
          : `Saved — ${studentName.split(' ')[0]}'s plan follows this from tomorrow (today already has ticked work).`);
      }
    } catch {
      setError('Could not save — check your connection.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-sm text-stone-400">Loading timetable…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-stone-500" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-stone-500">Coaching timetable</h2>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-stone-600">
        {blocks && blocks.length > 0
          ? <>What you set here is what {studentName.split(' ')[0]}&apos;s daily plan follows — fix mis-read rows, drop dead classes, add missing ones.</>
          : <>No timetable yet. Add {studentName.split(' ')[0]}&apos;s classes here, or ask them to upload their coaching&apos;s Excel/photo — then curate it.</>}
      </p>

      <div className="space-y-2">
        {(blocks ?? []).map((b, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* WHEN — a date pins the row; otherwise it recurs weekly. */}
              {b.date ? (
                <input
                  type="date" value={b.date}
                  onChange={(e) => patch(i, { date: e.target.value || null })}
                  className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
                />
              ) : (
                <select
                  value={b.day ?? 0}
                  onChange={(e) => patch(i, { day: Number(e.target.value), date: null })}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-semibold"
                >
                  {DAYS.map((d, di) => <option key={d} value={di}>{d}</option>)}
                </select>
              )}
              <span className="text-[11px] text-stone-400">{whenLabel(b)} · {timeLabel(b)}</span>

              <select
                value={b.section ?? 'QA'}
                onChange={(e) => {
                  const section = e.target.value as TimetableSection;
                  // A topic from another section aligns nothing — clear it.
                  patch(i, { section, topic: null });
                }}
                className="ml-auto rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-bold"
              >
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              <button
                type="button" onClick={() => remove(i)} aria-label="Remove class"
                className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={b.topic ?? ''}
                onChange={(e) => patch(i, { topic: e.target.value || null })}
                className="min-w-[180px] flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="">— topic (drives the plan) —</option>
                {topicsFor[b.section ?? 'QA'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text" value={b.label} placeholder="As printed on the sheet"
                onChange={(e) => patch(i, { label: e.target.value.slice(0, 120) })}
                className="min-w-[160px] flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setBlocks((prev) => [...(prev ?? []), emptyRow()]); setDirty(true); setSavedNote(null); }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add class
        </button>
        <button
          type="button" disabled={!dirty || saving || (blocks ?? []).length === 0}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? 'Saving…' : 'Save timetable'}
        </button>
        {savedNote && <span className="text-[11.5px] font-medium text-emerald-700">{savedNote}</span>}
        {error && <span className="text-[11.5px] font-medium text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
