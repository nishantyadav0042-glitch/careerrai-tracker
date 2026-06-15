'use client';

import { useState } from 'react';
import { TrendingUp, MessageSquare, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const STUDENTS = [
  {
    initials: 'RS',
    name: 'Riya S.',
    college: 'IIM Ahmedabad',
    streak: 31,
    logs: [1, 1, 1, 0, 1, 1, 1], // last 7 days (1 = logged)
    hoursWeek: 21,
    percentile: 94,
    prevPercentile: 87,
    color: 'from-orange-500 to-rose-500',
  },
  {
    initials: 'AM',
    name: 'Arjun M.',
    college: 'IIM Bangalore',
    streak: 24,
    logs: [1, 1, 0, 1, 1, 1, 1],
    hoursWeek: 18,
    percentile: 97,
    prevPercentile: 91,
    color: 'from-teal-500 to-cyan-600',
  },
  {
    initials: 'PK',
    name: 'Priya K.',
    college: 'FMS Delhi',
    streak: 14,
    logs: [0, 1, 1, 1, 1, 0, 1],
    hoursWeek: 12,
    percentile: 83,
    prevPercentile: 74,
    color: 'from-violet-500 to-purple-600',
  },
];

const BUDDY = {
  initials: 'NK',
  name: 'Nikhil K.',
  college: 'IIM Ahmedabad',
  percentile: 99.4,
  bio: 'Helped 40+ students crack CAT. Specialises in DILR and time-pressure strategy.',
  messages: [
    {
      text: 'Your DILR caselet accuracy dropped to 54% this week. Before Thursday\'s mock — do 2 sets from CAT \'23 paper. Time yourself at 28 min.',
      time: 'Mon, 2:14 pm',
    },
    {
      text: 'Strong QA session today 🔥 You\'re trending toward 96%ile on that section. Keep this pace for the next 10 days.',
      time: 'Wed, 9:07 pm',
    },
  ],
};

const WEEKS = [
  { label: 'Wk 1', hours: 8, percentile: 74 },
  { label: 'Wk 2', hours: 13, percentile: 79 },
  { label: 'Wk 3', hours: 18, percentile: 83 },
  { label: 'Wk 4', hours: 21, percentile: 91 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SlideStudents() {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
        Active students right now
      </p>
      {STUDENTS.map((s) => {
        const delta = s.percentile - s.prevPercentile;
        return (
          <div
            key={s.initials}
            className="bg-white border border-stone-200 rounded-2xl p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}
              >
                {s.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-900">{s.name}</span>
                  <span className="text-[10px] font-bold text-orange-600 shrink-0">
                    🔥 {s.streak}d
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5">→ {s.college}</p>

                {/* 7-day streak dots */}
                <div className="flex items-center gap-1 mt-2">
                  {s.logs.map((logged, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-4 h-4 rounded-sm',
                        logged ? 'bg-orange-500' : 'bg-stone-100 border border-stone-200'
                      )}
                    />
                  ))}
                  <span className="text-[10px] text-stone-400 ml-1">last 7 days</span>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-stone-500">{s.hoursWeek}h this week</span>
                  <span className="flex items-center gap-0.5 text-[11px] font-semibold text-teal-700">
                    <TrendingUp className="w-3 h-3" />
                    {s.percentile}%ile
                    <span className="text-teal-500 ml-0.5">(+{delta})</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SlideBuddy() {
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
        Your IIM alumni buddy
      </p>

      {/* Buddy profile card */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white text-lg font-bold shrink-0">
            {BUDDY.initials}
          </div>
          <div>
            <p className="text-base font-bold text-stone-900">{BUDDY.name}</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-medium">
                {BUDDY.college}
              </span>
              <span className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium">
                {BUDDY.percentile}%ile CAT
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-stone-600 mt-3 leading-relaxed italic">
          &quot;{BUDDY.bio}&quot;
        </p>
      </div>

      {/* Sample chat messages from buddy */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Sample messages from your buddy
          </p>
        </div>
        <div className="space-y-2">
          {BUDDY.messages.map((msg, i) => (
            <div key={i} className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
              <p className="text-xs text-stone-700 leading-relaxed">{msg.text}</p>
              <p className="text-[10px] text-stone-400 mt-1.5">{BUDDY.name} · {msg.time}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-stone-400 leading-snug">
        Your buddy reviews your logs each week and sends targeted guidance — not generic tips.
      </p>
    </div>
  );
}

function SlideProgress() {
  const maxHours = Math.max(...WEEKS.map((w) => w.hours));
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
        What 4 weeks of logging looks like
      </p>

      {/* Weekly bar chart */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-stone-700 mb-3">Study hours per week</p>
        <div className="flex items-end gap-2 h-20">
          {WEEKS.map((w) => {
            const heightPct = (w.hours / maxHours) * 100;
            return (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-stone-500 font-medium">{w.hours}h</span>
                <div className="w-full flex items-end" style={{ height: 52 }}>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-orange-500 to-orange-400 transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-400">{w.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Percentile progression */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-stone-700 mb-3">Mock test percentile</p>
        <div className="relative">
          {/* Timeline */}
          <div className="flex items-center justify-between">
            {WEEKS.map((w, i) => (
              <div key={w.label} className="flex flex-col items-center gap-1">
                <div className="relative flex flex-col items-center">
                  <span className="text-xs font-bold text-stone-900">{w.percentile}%</span>
                  <div className={cn(
                    'w-3 h-3 rounded-full mt-1 border-2 border-white shadow',
                    i === WEEKS.length - 1 ? 'bg-teal-500' : 'bg-stone-300'
                  )} />
                </div>
                <span className="text-[10px] text-stone-400">{w.label}</span>
              </div>
            ))}
          </div>
          {/* Connecting line */}
          <div className="absolute top-[22px] left-[6%] right-[6%] h-0.5 bg-gradient-to-r from-stone-200 via-orange-300 to-teal-400 -z-0" />
        </div>
        <div className="mt-3 flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          <TrendingUp className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <p className="text-[11px] text-teal-800 font-medium">
            +17 percentile points in 4 weeks of consistent logging
          </p>
        </div>
      </div>

      {/* Sample debrief insight */}
      <div className="bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-3">
        <div className="flex items-start gap-2">
          <BarChart2 className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
              After your mock — auto insight
            </p>
            <p className="text-xs text-stone-700 leading-relaxed">
              &quot;Your percentile rose from 87 to 94. Reading Comprehension accuracy is your strongest gain — focus on DILR caselets next.&quot;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SLIDES = [
  { id: 'students', label: 'Students', icon: '👥', component: SlideStudents },
  { id: 'buddy', label: 'Buddy', icon: '🎓', component: SlideBuddy },
  { id: 'progress', label: 'Progress', icon: '📈', component: SlideProgress },
];

export default function ScreenSocialProof({ onNext, isLoading }: Props) {
  const [slide, setSlide] = useState(0);
  const Slide = SLIDES[slide].component;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSlide(i)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
              slide === i
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            )}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Slide content */}
      <div className="min-h-[340px]">
        <Slide />
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 pt-1">
        {slide > 0 && (
          <button
            type="button"
            onClick={() => setSlide(slide - 1)}
            className="p-2 rounded-xl border border-stone-200 text-stone-500 hover:bg-stone-50 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {slide < SLIDES.length - 1 ? (
          <button
            type="button"
            onClick={() => setSlide(slide + 1)}
            className="flex-1 py-3 rounded-xl font-semibold text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98]"
          >
            See {SLIDES[slide + 1].label} <ChevronRight className="inline w-4 h-4 ml-0.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNext()}
            disabled={isLoading}
            className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            I want this too →
          </button>
        )}

        {/* Slide dots */}
        <div className="flex gap-1.5 shrink-0">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                i === slide ? 'bg-orange-500 w-3' : 'bg-stone-300'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
