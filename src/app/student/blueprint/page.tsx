'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { RotatingBuddyBanner } from '@/components/rotating-buddy-banner';

interface ThisWeekItem { label: string; href: string }
interface FinishProjection {
  status: 'done' | 'stalled' | 'ahead' | 'tight' | 'critical';
  windowLabel: string | null;
  sub: string;
}
interface PlanData {
  totalTopics: number;
  studiedOnceCount: number;
  notStartedCount: number;
  dueForRevisionCount: number;
  mocksCompleted: number;
  finishProjection: FinishProjection;
  thisWeek: ThisWeekItem[];
  biggestPriority: string | null;
  hasBuddy: boolean;
  isPremium: boolean;
}

function PlanRow({ href, icon, label, cta }: { href: string; icon: string; label: string; cta: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-stone-50 transition-colors">
      <span className="text-lg w-6 text-center shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-stone-800">{label}</span>
      <span className="text-xs font-bold text-orange-600 whitespace-nowrap">{cta} →</span>
    </Link>
  );
}

// My CAT Plan — four questions, ten seconds: what have I studied, what's due,
// what's left, and when does the syllabus finish. Every number reads off the
// same engines the rest of the app already trusts (topic memory, mock trend,
// roadmap phase) — nothing on this page is computed just for this page.
export default function MyCatPlanPage() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const res = await fetch('/api/blueprint');
      if (res.ok) setData(await res.json());
      else setFetchFailed(true);
    } catch {
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-stone-500">Loading your plan…</div>
      </div>
    );
  }
  if (fetchFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-stone-500">Couldn&apos;t load your plan — check your connection.</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-stone-500">Build your CAT Plan first — it starts on the Home tab.</p>
      </div>
    );
  }

  const {
    totalTopics, studiedOnceCount, notStartedCount, dueForRevisionCount, mocksCompleted,
    finishProjection, thisWeek, biggestPriority, hasBuddy, isPremium,
  } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>My CAT Plan</h1>
            <p className="text-sm text-stone-500">Your preparation today</p>
          </div>
        </div>

        {/* Studied / revision / not started / mocks — four rows, four taps */}
        <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
          <PlanRow href="/student/analysis" icon="✅" label={`${studiedOnceCount}/${totalTopics} studied once`} cta="View" />
          <PlanRow href="/student/analysis" icon="🔄" label={`${dueForRevisionCount} due for revision`} cta="View" />
          <PlanRow href="/student/analysis" icon="⚪" label={`${notStartedCount} not started`} cta="Start" />
          <PlanRow
            href="/student/analysis?tab=mocks"
            icon="📝"
            label={`${mocksCompleted} mock${mocksCompleted === 1 ? '' : 's'} completed`}
            cta="View"
          />
        </div>

        {/* Finish syllabus — a real date window from trailing pace, or the
            honest reason there isn't one yet. Never "estimated," never a
            verdict — the sub-line is always a lever, not a scolding. */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1">Finish syllabus</p>
          {finishProjection.windowLabel ? (
            <>
              <p className="text-lg font-bold text-stone-900">{finishProjection.windowLabel}</p>
              <p className="text-xs text-stone-500 mt-0.5">{finishProjection.sub}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-stone-800">{finishProjection.sub}</p>
          )}
        </div>

        {thisWeek.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">This week</h2>
            <div className="space-y-2">
              {thisWeek.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-2.5 text-sm font-semibold text-stone-800 hover:text-orange-700"
                >
                  <span className="text-teal-600">✓</span>{item.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* One diagnosis, or none — never a generic filler line. */}
        {biggestPriority && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-1">Biggest priority</p>
            <p className="text-sm font-semibold text-orange-900">{biggestPriority}</p>
          </div>
        )}

        {!hasBuddy && !isPremium && <RotatingBuddyBanner />}

        <div className="pb-16" />
      </div>
    </div>
  );
}
