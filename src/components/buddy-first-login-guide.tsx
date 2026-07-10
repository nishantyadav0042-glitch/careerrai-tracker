'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

// Mandatory one-time buddy playbook — the buddy equivalent of the student
// FirstLoginTour. Shown once after storefront setup, before the dashboard.
// Each slide SHOWS the actual job (triage, nudges, mock debriefs, weekly call)
// with a lightweight product mock, so a brand-new buddy knows exactly what
// "being a buddy" means day to day. Gated by profiles.buddy_tour_completed;
// non-demo buddies only.

/* ── Product-preview visuals (lightweight mock cards) ───────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

function PairVisual() {
  return (
    <Card>
      <div className="flex items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white">You</div>
        <svg width="36" height="12" viewBox="0 0 36 12" className="text-stone-300"><path d="M2 6 H34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" /></svg>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-600">P</div>
      </div>
      <p className="mt-3 text-center text-sm font-bold text-stone-900">Priya · your student</p>
      <p className="text-center text-[11px] font-medium text-stone-500">Target: IIM Bangalore · CAT 2026</p>
      <div className="mt-3 rounded-lg bg-teal-50 py-2 text-center text-[11px] font-semibold text-teal-800">
        She pays for YOU — not videos, not a batch of 200.
      </div>
    </Card>
  );
}

function TriageVisual() {
  const rows = [
    { name: 'Priya', status: 'Logged 4.5h today', tone: 'text-teal-700 bg-teal-50', dot: 'bg-teal-500' },
    { name: 'Rahul', status: 'Silent 2 days ⚠️', tone: 'text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
    { name: 'Aisha', status: 'Mock logged — debrief', tone: 'text-orange-700 bg-orange-50', dot: 'bg-orange-500' },
  ];
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-900">Today&apos;s triage</span>
        <span className="text-[11px] font-semibold text-stone-400">Home tab</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />
            <span className="text-xs font-bold text-stone-900">{r.name}</span>
            <span className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-semibold ${r.tone}`}>{r.status}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NudgeVisual() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">R</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900">Rahul</p>
          <p className="text-[11px] font-medium text-amber-600">Streak broken yesterday</p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl rounded-tr-sm bg-teal-600 px-3 py-2 text-xs leading-relaxed text-white">
        Saw you missed yesterday — one bad day doesn&apos;t matter, two starts a pattern. What&apos;s blocking you tonight?
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold text-stone-400">Sent in 20 seconds · saved the streak</p>
    </Card>
  );
}

function DebriefVisual() {
  const rows = [
    { s: 'VARC', p: '88', w: 'w-[88%]', c: 'bg-teal-500' },
    { s: 'DILR', p: '64', w: 'w-[64%]', c: 'bg-orange-500' },
    { s: 'QA', p: '81', w: 'w-[81%]', c: 'bg-teal-500' },
  ];
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-900">Aisha&apos;s Mock #7</span>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">Debrief due</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.s} className="flex items-center gap-2">
            <span className="w-9 text-[11px] font-semibold text-stone-500">{r.s}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div className={`h-full rounded-full ${r.c} ${r.w}`} />
            </div>
            <span className="w-8 text-right text-[11px] font-bold text-stone-700">{r.p}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-stone-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white">
        Your call: &ldquo;DILR timing, not accuracy. Fix set-selection this week.&rdquo;
      </div>
    </Card>
  );
}

function CallVisual() {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-900">Weekly 1-on-1</span>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">Sun · 7 PM</span>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
        </span>
        <div>
          <p className="text-xs font-bold text-stone-900">Video call with Priya</p>
          <p className="text-[10px] font-medium text-stone-500">Link created automatically — one tap</p>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-teal-50 py-1.5 text-center text-[11px] font-semibold text-teal-800">30 focused minutes beat 2 vague hours</div>
    </Card>
  );
}

function ChecklistVisual() {
  const items = ['Read each student’s profile dossier', 'Send every student a hello message', 'Schedule your first weekly call'];
  return (
    <Card>
      <p className="mb-2 text-sm font-bold text-stone-900">Your first 15 minutes</p>
      <div className="space-y-2">
        {items.map((t, i) => (
          <div key={t} className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-[11px] font-bold text-teal-700">{i + 1}</span>
            <span className="text-xs font-medium text-stone-700">{t}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Slides ─────────────────────────────────────────────────────────────────── */

interface Slide {
  badge: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    badge: 'Your role',
    title: 'One student. One mentor. You.',
    body: 'Students pay ₹999/month for a real IIM senior in their corner — not videos, not a batch. Your name, your mock advice, your nudges. That personal attention IS the product.',
    visual: <PairVisual />,
  },
  {
    badge: 'Daily · 5 minutes',
    title: 'Open your triage every day.',
    body: 'Your Home tab shows who logged, who went silent, and which mock needs a debrief. Five minutes a day is the whole habit — the app queues the work, you just act on it.',
    visual: <TriageVisual />,
  },
  {
    badge: 'The save',
    title: 'Nudge on day one of a slip.',
    body: 'A streak break shows up on your triage the same day. A 2-line message on day one saves it; by day three the habit is gone. Reply to student messages within 24 hours.',
    visual: <NudgeVisual />,
  },
  {
    badge: 'Your biggest lever',
    title: 'Debrief every mock they take.',
    body: 'Most aspirants take 30 mocks and learn from none. When a student logs a mock, decode it with them — silly slips, timing leaks, set selection. This is the #1 thing they stay for.',
    visual: <DebriefVisual />,
  },
  {
    badge: 'Weekly ritual',
    title: 'One 30-minute call, every week.',
    body: 'Book it from the Schedule tab — the video link is created automatically, nothing to set up. Same day, same time each week works best. Use the call to set the week’s one focus.',
    visual: <CallVisual />,
  },
  {
    badge: 'You’re set',
    title: 'Start with a hello.',
    body: 'Read each student’s dossier, send them a first message today, and schedule the first call. A student who hears from you on day one almost never churns.',
    visual: <ChecklistVisual />,
  },
];

export function BuddyFirstLoginGuide() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const slide = SLIDES[i];
  const isLast = i === SLIDES.length - 1;

  function next() {
    if (!isLast) { setI(i + 1); return; }
    finish();
  }

  async function finish() {
    setFinishing(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ buddy_tour_completed: true }).eq('id', user.id);
      }
    } catch { /* refresh re-shows the guide if the flag didn't stick */ }
    // Server layout re-reads buddy_tour_completed and stops rendering the
    // guide — no full app reload needed.
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white bg-gradient-to-b from-teal-50 to-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-6">
        {/* Progress */}
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div key={idx} className={`h-1 flex-1 rounded-full transition-all ${idx <= i ? 'bg-teal-600' : 'bg-stone-200'}`} />
          ))}
        </div>

        {/* Visual — the hero of each slide */}
        <div className="flex flex-1 items-center justify-center py-6">
          {slide.visual}
        </div>

        {/* Copy */}
        <div className="text-center">
          <span className="mb-3 inline-block rounded-full bg-teal-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-800">
            {slide.badge}
          </span>
          <h1 className="text-[26px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {slide.title}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600">{slide.body}</p>
        </div>

        {/* Nav */}
        <div className="mt-7 space-y-3">
          <Button onClick={next} variant="primary" size="lg" className="w-full" disabled={finishing}>
            {finishing ? 'Opening your dashboard…' : isLast ? 'Open my dashboard →' : 'Next →'}
          </Button>
          {i > 0 && !finishing && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setI(i - 1)} className="text-xs text-stone-400 hover:text-stone-600">← Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
