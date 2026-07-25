'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Swords, Check, X as XIcon } from 'lucide-react';
import { TOPIC_METADATA } from '@/lib/topics-constants';

// The verification desk. Two jobs:
//  1. Review student submissions — approve puts a question in the bank with
//     the student's credit, or publishes a tip. Reject is silent.
//  2. Feed and schedule the bank — founder-created questions plus approved
//     student ones, scheduled one per section per day (live 8am IST).

interface Pending {
  id: string; kind: string; topic: string | null; created_at: string;
  payload: { text?: string; question?: string; options?: string[]; correct_index?: number; explanation?: string };
  profiles?: { full_name?: string | null } | null;
}
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
  const [pending, setPending] = useState<Pending[]>([]);
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
    setPending(json.pending ?? []);
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
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-bold text-stone-900">Student submissions · {pending.length} waiting</h2>
          {pending.length === 0 && <p className="mt-2 text-xs text-stone-400">Queue is clear.</p>}
          <div className="mt-2 space-y-3">
            {pending.map((p) => (
              <div key={p.id} className="rounded-xl border border-stone-200 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                  {p.kind} · {p.topic ?? 'no topic'} · from {p.profiles?.full_name ?? 'unknown'}
                </p>
                {p.kind !== 'question' ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-stone-800">{p.payload.text}</p>
                ) : (
                  <>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-stone-800">{p.payload.question}</p>
                    <ol className="mt-1.5 space-y-0.5 text-[12px] text-stone-600">
                      {(p.payload.options ?? []).map((o, i) => (
                        <li key={i} className={i === p.payload.correct_index ? 'font-bold text-emerald-700' : ''}>
                          {String.fromCharCode(65 + i)}. {o}{i === p.payload.correct_index ? ' ✓' : ''}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1.5 text-[12px] italic text-stone-500">{p.payload.explanation}</p>
                  </>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button" disabled={busy === p.id}
                    onClick={() => void post({ action: 'review', submission_id: p.id, decision: 'approve' }, p.id)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    type="button" disabled={busy === p.id}
                    onClick={() => void post({ action: 'review', submission_id: p.id, decision: 'reject' }, p.id)}
                    className="flex items-center gap-1 rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-50"
                  >
                    <XIcon className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

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
