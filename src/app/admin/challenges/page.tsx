'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Swords } from 'lucide-react';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// The challenge bank desk: feed and schedule daily challenges, one per
// section per day (live 8am IST).
//
// It used to have a second job — reviewing student submissions into the bank
// — removed 20 Aug. That path read payload.options, an MCQ shape the live
// submission flow has never written, and after the live-pool migration it
// would have claimed the safety-hold queue and offered an Approve button
// that could only 500. Safety holds are reviewed on /admin/daily-pick.
interface PipelineRow {
  id: string; kind: string; topic: string | null; text: string | null;
  hasImage: boolean; displayName: string | null; votingEndsAt: string | null;
  yes: number; no: number;
}
interface BankRow {
  id: string; live_date: string | null; section: string; topic: string;
  question: string; difficulty: string; source: string; status: string;
}

const SECTIONS = ['QA', 'DILR', 'VARC'] as const;
const TOPICS_FOR = (sec: string) =>
  Object.entries(TOPIC_METADATA).filter(([, m]) => m.section === sec).map(([t]) => t);

export default function AdminChallengesPage() {
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [bank, setBank] = useState<BankRow[]>([]);
  const [activeDate, setActiveDate] = useState('');
  const [recentAttempts, setRecentAttempts] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Create form
  const [section, setSection] = useState<string>('QA');
  const [topic, setTopic] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [explanation, setExplanation] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/challenges');
    if (!res.ok) return;
    const json = await res.json();
    setPipeline(json.pipeline ?? []);
    setBank(json.bank ?? []);
    setActiveDate(json.activeDate ?? '');
    setRecentAttempts(json.recentAttempts ?? 0);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key); setMsg(null);
    const res = await fetch('/api/admin/challenges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? 'Failed');
    await load();
    setBusy(null);
    return res.ok;
  }

  async function create() {
    const ok = await post({
      action: 'create', section, topic, question,
      options: options.filter((o) => o.trim()), correct_index: correct,
      difficulty, explanation,
    }, 'create');
    if (ok) {
      setQuestion(''); setOptions(['', '', '', '']); setCorrect(null); setExplanation('');
      setMsg('Added to bank.');
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-2 hover:bg-stone-100"><ArrowLeft className="h-5 w-5 text-stone-600" /></Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600"><Swords className="h-4 w-4 text-white" /></span>
          <div>
            <h1 className="text-lg font-bold text-stone-900">Daily Challenge</h1>
            <p className="text-xs text-stone-500">Active day: {activeDate} · {recentAttempts} attempts in last 48h</p>
          </div>
        </div>

        {msg && <p className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700">{msg}</p>}

        {/* ── Review queue ── */}
        {/* The student-submission review panel was removed 20 Aug: it belonged to
          a moderation generation that never ran, and its Approve button could
          only fail. Safety holds are reviewed on /admin/daily-pick. */}
        

        {/* ── The voting pipeline (Curriculum Selection) ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Community voting pipeline · {pipeline.length} items</h2>
          <p className="mt-1 text-[11px] text-stone-500">
            Ranked by net votes. Students never see these numbers — you use them to
            decide what graduates to featured.
          </p>
          <div className="mt-2 space-y-1.5">
            {pipeline.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl border border-stone-100 px-2.5 py-2">
                <span className="shrink-0 text-[14px]">{r.kind === 'tip' ? '💡' : '📷'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-stone-800">
                    {r.text ?? (r.hasImage ? '(photo question)' : '—')}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    {r.topic ?? 'no topic'} · as “{r.displayName ?? '?'}”
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">👍 {r.yes}</span>
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">👎 {r.no}</span>
              </div>
            ))}
            {pipeline.length === 0 && <p className="text-xs text-stone-400">Pipeline is empty.</p>}
          </div>
        </section>

        {/* ── Add a question ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Add a question to the bank</h2>
          <div className="mt-2 flex gap-2">
            <select value={section} onChange={(e) => { setSection(e.target.value); setTopic(''); }}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
              {SECTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
              <option value="">Topic…</option>
              {TOPICS_FOR(section).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
              {['easy', 'medium', 'hard', 'timed'].map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="Question…"
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
          <div className="mt-2 space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(i)}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${correct === i ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500'}`}>
                  {String.fromCharCode(65 + i)}
                </button>
                <input value={opt} onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                  className="w-full rounded-xl border border-stone-200 px-3 py-1.5 text-sm" />
              </div>
            ))}
          </div>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} placeholder="Explanation…"
            className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
          <button type="button" disabled={busy === 'create' || !topic || correct == null}
            onClick={() => void create()}
            className="mt-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Add to bank
          </button>
        </section>

        {/* ── The bank ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Bank &amp; schedule</h2>
          <p className="mt-1 text-[11px] text-stone-500">Set a date to make a question live that day (8 AM IST). One per section per day.</p>
          <div className="mt-2 space-y-2">
            {bank.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-xl border border-stone-200 p-2.5">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  b.status === 'live' ? 'bg-emerald-100 text-emerald-700' : b.status === 'retired' ? 'bg-stone-100 text-stone-400' : 'bg-amber-100 text-amber-700'
                }`}>{b.status}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-stone-800">{b.section} · {b.topic}{b.source === 'student' ? ' · 🎁 student' : ''}</p>
                  <p className="truncate text-[11px] text-stone-500">{b.question}</p>
                </div>
                <input
                  type="date" defaultValue={b.live_date ?? ''}
                  onChange={(e) => { if (e.target.value) void post({ action: 'schedule', challenge_id: b.id, live_date: e.target.value }, b.id); }}
                  className="shrink-0 rounded-lg border border-stone-200 px-2 py-1 text-[11px]"
                />
                {b.status !== 'retired' && (
                  <button type="button" onClick={() => void post({ action: 'retire', challenge_id: b.id }, b.id)}
                    className="shrink-0 text-[11px] font-semibold text-stone-400 hover:text-rose-600">retire</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
