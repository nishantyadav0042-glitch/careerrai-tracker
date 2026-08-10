'use client';

import { useEffect, useState } from 'react';

interface ScreenMeetBuddyProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface MentorPreview {
  firstName: string;
  fullName: string;
  college: string | null;
  avatarUrl: string | null;
  journey: string | null;
  bio: string | null;
  matchedOn: string[];
}

// The trust screen, honest by construction (founder S2, 10 Aug): show a REAL
// mentor — the assigned one if it exists, else the student's actual best match
// from the same rankBuddies engine the evening nudge uses. Real name, real
// journey, real match reasons. If they aren't assigned yet, the copy says so
// plainly; we never simulate a relationship that doesn't exist. (The old
// generic "IIM Alumni Buddy" persona and the dead "listen 10s" audio gate are
// gone for good.)
export default function ScreenMeetBuddy({ onNext, onBack, canGoBack, isLoading }: ScreenMeetBuddyProps) {
  const [state, setState] = useState<{ mentor: MentorPreview | null; assigned: boolean } | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/mentor-match');
        if (!res.ok) { setState({ mentor: null, assigned: false }); return; }
        setState(await res.json());
      } catch {
        setState({ mentor: null, assigned: false });
      }
    })();
  }, []);

  if (state === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Finding your IIM mentor…</p>
        </div>
      </div>
    );
  }

  const m = state.mentor;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">
          {state.assigned ? 'Your mentor' : 'Matched for you'}
        </p>
      </div>

      {m ? (
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6">
          <div className="flex flex-col items-center">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-teal-700 text-2xl font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
                {m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <h3 className="mt-3 text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{m.fullName}</h3>
            {m.college && <p className="text-xs text-stone-500">{m.college}</p>}
            {m.journey && (
              <span className="mt-3 rounded-full bg-stone-900 px-4 py-1.5 text-[13px] font-extrabold text-white">{m.journey}</span>
            )}
          </div>

          {m.bio && (
            <p className="mt-4 border-t border-orange-100 pt-4 text-center text-sm italic leading-relaxed text-stone-700">
              &quot;{m.bio}&quot;
            </p>
          )}

          {m.matchedOn.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {m.matchedOn.map((r) => (
                <span key={r} className="rounded-full bg-teal-100 px-2.5 py-1 text-[10.5px] font-bold text-teal-700">{r}</span>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {([['1-on-1', 'only yours'], ['Weekly', 'live call'], ['Daily', 'chat replies']] as const).map(([big, small]) => (
              <div key={big} className="rounded-xl bg-stone-100 py-2 text-center">
                <p className="text-[14px] font-extrabold text-stone-900">{big}</p>
                <p className="text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">{small}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6 text-center">
          <p className="text-sm font-semibold text-stone-900">We match you with a real IIM senior after this.</p>
        </div>
      )}

      {/* Honest state: a real person, and exactly when the relationship starts. */}
      {m && !state.assigned && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-[12.5px] leading-snug text-stone-700">
            <b>{m.firstName} is a real mentor, already guiding students like you.</b> Upgrade any time and your match is confirmed the same day.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button onClick={onBack} type="button" className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() => onNext()}
          disabled={isLoading}
          type="button"
          className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
