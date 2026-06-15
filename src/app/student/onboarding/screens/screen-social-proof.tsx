'use client';

import { TrendingUp } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const DEMO_STUDENTS = [
  {
    initials: 'RS',
    name: 'Riya S.',
    college: 'IIM Ahmedabad',
    streak: 24,
    hoursThisWeek: 18,
    percentile: 91,
    delta: '+6',
    color: 'from-orange-500 to-orange-600',
  },
  {
    initials: 'AM',
    name: 'Arjun M.',
    college: 'IIM Bangalore',
    streak: 31,
    hoursThisWeek: 22,
    percentile: 96,
    delta: '+11',
    color: 'from-teal-500 to-teal-600',
  },
  {
    initials: 'PK',
    name: 'Priya K.',
    college: 'IIM Calcutta',
    streak: 18,
    hoursThisWeek: 14,
    percentile: 83,
    delta: '+9',
    color: 'from-violet-500 to-violet-600',
  },
];

const DEMO_BUDDY = {
  initials: 'NK',
  name: 'Nikhil K.',
  college: 'IIM Ahmedabad',
  percentile: 99.4,
  bio: 'Helped 40+ students crack CAT. Specializes in DILR and time pressure strategy.',
};

export default function ScreenSocialProof({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-600 leading-relaxed">
          Here&apos;s who&apos;s already on this path — students just like you, logging daily and climbing
          toward their dream college.
        </p>
      </div>

      {/* Student demo cards */}
      <div className="space-y-3">
        {DEMO_STUDENTS.map((s) => (
          <div
            key={s.initials}
            className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-2xl p-3"
          >
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center text-white text-sm font-bold shrink-0`}
            >
              {s.initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold text-stone-900 truncate">{s.name}</span>
                <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 shrink-0">
                  {s.streak}d streak 🔥
                </span>
              </div>
              <p className="text-[11px] text-stone-500 truncate mt-0.5">→ {s.college}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[11px] text-stone-500">{s.hoursThisWeek}h this week</span>
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-teal-700">
                  <TrendingUp className="w-3 h-3" />
                  {s.percentile}%ile ({s.delta})
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Buddy card */}
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-2">
          Your Buddy — IIM Alumni
        </p>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white font-bold text-base shrink-0">
            {DEMO_BUDDY.initials}
          </div>
          <div>
            <p className="text-sm font-bold text-stone-900">{DEMO_BUDDY.name}</p>
            <div className="flex gap-1.5 mt-1">
              <span className="text-[10px] bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-medium">
                {DEMO_BUDDY.college}
              </span>
              <span className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium">
                {DEMO_BUDDY.percentile}%ile CAT
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-stone-600 mt-3 italic leading-relaxed">
          &quot;{DEMO_BUDDY.bio}&quot;
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onNext()}
          disabled={isLoading}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          I want this too →
        </button>
      </div>
    </div>
  );
}
