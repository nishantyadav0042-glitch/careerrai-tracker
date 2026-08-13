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

interface MentorMatchState {
  assigned: boolean;
  mentor: MentorPreview | null;
  mentors: MentorPreview[];
}

// The trust screen. Two states, and the line between them is the whole point.
//
// ASSIGNED — a real match exists (rare at onboarding time, only via the
// pre-signup allowlist path). Show that ONE real person as "your mentor",
// because it is literally true.
//
// NOT ASSIGNED — everyone else. `buddy_id` is written by a human admin AFTER
// payment; nothing at onboarding time has matched anyone to anything. This
// used to label the single top-ranked buddy as a done deal, with a specific,
// confident claim about a relationship that did not exist yet, and a faster
// SLA than the real notification promises (that one says the assignment
// completes within 24 hours, done by a human admin, not automatically).
//
// Founder, 13 Aug, on precisely this: real mentor pool, no fake match — never
// claim one specific person is already assigned. So this state now shows up
// to three REAL mentors (same ranking engine as the paywall showcase) framed
// as a pool, and the SLA line matches the one the product actually keeps.
export default function ScreenMeetBuddy({ onNext, onBack, canGoBack, isLoading }: ScreenMeetBuddyProps) {
  const [state, setState] = useState<MentorMatchState | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/mentor-match');
        if (!res.ok) { setState({ assigned: false, mentor: null, mentors: [] }); return; }
        setState(await res.json());
      } catch {
        setState({ assigned: false, mentor: null, mentors: [] });
      }
    })();
  }, []);

  if (state === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Finding real mentors on CareerRai…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {state.assigned && state.mentor ? (
        <AssignedMentor mentor={state.mentor} />
      ) : (
        <MentorPool mentors={state.mentors} />
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

function Avatar({ m, size }: { m: MentorPreview; size: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-14 w-14 text-base';
  if (m.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.avatarUrl} alt="" className={`${dim} rounded-full object-cover`} />;
  }
  return (
    <div className={`flex ${dim} items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-teal-700 font-bold text-white`} style={{ fontFamily: 'Georgia, serif' }}>
      {m.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
    </div>
  );
}

function AssignedMentor({ mentor: m }: { mentor: MentorPreview }) {
  return (
    <>
      <div className="text-center">
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Your mentor</p>
      </div>
      <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6">
        <div className="flex flex-col items-center">
          <Avatar m={m} size="lg" />
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
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([['1-on-1', 'only yours'], ['Weekly', 'live call'], ['Daily', 'chat replies']] as const).map(([big, small]) => (
            <div key={big} className="rounded-xl bg-stone-100 py-2 text-center">
              <p className="text-[14px] font-extrabold text-stone-900">{big}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">{small}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MentorPool({ mentors }: { mentors: MentorPreview[] }) {
  return (
    <>
      <div className="text-center">
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Real mentors on CareerRai</p>
      </div>

      {mentors.length > 0 ? (
        <div className="space-y-2.5">
          {mentors.map((m) => (
            <div key={m.fullName} className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-3.5">
              <Avatar m={m} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{m.fullName}</p>
                <p className="truncate text-[11px] text-stone-500">{m.college ?? 'IIM mentor'}{m.journey ? ` · ${m.journey}` : ''}</p>
                {m.matchedOn[0] && (
                  <span className="mt-1 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">{m.matchedOn[0]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6 text-center">
          <p className="text-sm font-semibold text-stone-900">We match you with a real IIM senior after this.</p>
        </div>
      )}

      {/* Honest framing: a real pool, an honest SLA once upgraded, no claim
          that any one of them is already yours. "Within 24 hours" is the same
          line the actual post-payment notification sends
          (lib/premium.ts) — this screen must never promise a faster or more
          certain SLA than the one the product keeps. */}
      <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <p className="text-[12.5px] leading-snug text-stone-700">
          <b>These are real IIM mentors, already guiding students on CareerRai.</b> Upgrade and one of them is assigned to you — a real person, within 24 hours.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {([['1-on-1', 'only yours'], ['Weekly', 'live call'], ['Daily', 'chat replies']] as const).map(([big, small]) => (
          <div key={big} className="rounded-xl bg-stone-100 py-2 text-center">
            <p className="text-[14px] font-extrabold text-stone-900">{big}</p>
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-stone-500">{small}</p>
          </div>
        ))}
      </div>
    </>
  );
}
