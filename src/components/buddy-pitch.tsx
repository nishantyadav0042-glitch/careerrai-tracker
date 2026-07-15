import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import { RecommendedBuddies } from '@/components/recommended-buddies';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { CalendarClock, Repeat2, Flame, Target, ClipboardCheck, TrendingUp } from 'lucide-react';

// The free-student /student/buddy screen = an INDIRECT sales asset. It reads as
// a genuinely useful mock + revision plan built from the student's OWN numbers,
// and the Buddy is positioned as the enabler at each pain point — never a
// billboard. Every block maps to a conversion lever:
//   Mock Sprint  → fear (one shot/year, mocks running out) + real help (a mock
//                  is only worth it once analysed — that's the buddy's job).
//   Revision     → loss aversion (hours already invested decay without revision;
//                  the forgetting curve is real, ~Ebbinghaus).
//   Consistency  → accountability + FOMO (solo aspirants stall; the ones who
//                  convert have someone keeping them honest).
//   What you get → real help, tied to THIS student's weakest section + mocks.

export interface BuddyPitchData {
  firstName: string;
  daysToCat: number;
  mocksLeft: number;      // weeks to CAT = full mocks still possible
  mocksTaken: number;
  nextMocks: { n: number; label: string }[]; // upcoming weekly mock dates
  topicsStudied: number;
  totalTopics: number;
  studyHours: number;
  revisionDue: number;    // studied >1 week ago, not revised
  streak: number;
  loggedDays: number;     // logged days in last 14
  weakestSection: string;
}

function Stat({ value, unit, label }: { value: string | number; unit?: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold leading-none text-stone-900 tabular-nums">
        {value}{unit && <span className="text-base font-bold">{unit}</span>}
      </div>
      <div className="mt-1 text-[11px] font-medium text-stone-500">{label}</div>
    </div>
  );
}

export function BuddyPitch({ data, recommendedBuddies = [], fullName }: {
  data: BuddyPitchData;
  recommendedBuddies?: RecommendedBuddyResult[];
  fullName?: string;
}) {
  const { firstName, daysToCat, mocksLeft, mocksTaken, nextMocks, topicsStudied, totalTopics, studyHours, revisionDue, streak, loggedDays, weakestSection } = data;

  return (
    <div className="mx-auto max-w-md space-y-3 px-1 pb-24 pt-3">
      {/* Countdown header — urgency, honest */}
      <div className="rounded-2xl bg-stone-900 p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Your CAT</p>
            <p className="mt-0.5 text-2xl font-extrabold">{daysToCat} <span className="text-base font-bold text-stone-300">days to go</span></p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-white tabular-nums">{mocksLeft}</p>
            <p className="text-[11px] font-medium text-stone-400">full mocks left</p>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-stone-300">
          One shot a year. From here, CAT is won in the mocks — and a mock only counts once someone helps you decode it.
        </p>
      </div>

      {/* MOCK SPRINT — the wedge */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50"><CalendarClock className="h-4 w-4 text-indigo-600" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Mock sprint</p>
            <p className="text-sm font-bold text-stone-900">One full mock every week — starting now</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3">
          <Stat value={mocksLeft} label="mocks you can still take" />
          <Stat value={mocksTaken} label="taken so far" />
          <Stat value={`${Math.max(0, mocksLeft - mocksTaken > 0 ? 1 : 0)}`} unit="/wk" label="the target from now" />
        </div>

        {nextMocks.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {nextMocks.map((m) => (
              <div key={m.n} className="flex items-center justify-between rounded-lg border border-stone-100 px-3 py-2 text-[13px]">
                <span className="font-semibold text-stone-900">Mock {m.n}</span>
                <span className="text-stone-500">{m.label}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
          <b>A mock you don&apos;t analyse is a mock wasted.</b> Toppers don&apos;t take more mocks — they extract more from each. Your buddy sits with your scorecard and names every error (silly / time / concept), so the next mock actually moves.
        </p>
      </div>

      {/* REVISION — loss aversion */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50"><Repeat2 className="h-4 w-4 text-emerald-600" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Revision plan</p>
            <p className="text-sm font-bold text-stone-900">Protect the hours you&apos;ve already put in</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3">
          <Stat value={topicsStudied} unit={`/${totalTopics}`} label="topics studied" />
          <Stat value={studyHours} unit="h" label="hours invested" />
          <Stat value={revisionDue} label="due for revision" />
        </div>

        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] leading-snug text-rose-800">
          Without revision, roughly <b>70% of a topic fades within a week</b> — that&apos;s the forgetting curve, not an opinion. {revisionDue > 0 ? <>You have <b>{revisionDue} topic{revisionDue === 1 ? '' : 's'} slipping right now.</b></> : <>Your revision is current — a buddy keeps it that way.</>} A buddy runs your revision schedule so those {studyHours}h don&apos;t evaporate.
        </p>
      </div>

      {/* CONSISTENCY — accountability + FOMO */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50"><Flame className="h-4 w-4 text-orange-500" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Accountability</p>
            <p className="text-sm font-bold text-stone-900">Consistency is the whole game — and the hardest part</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3">
          <Stat value={streak} unit="d" label="current streak" />
          <Stat value={loggedDays} unit="/14" label="days logged, last 2 weeks" />
        </div>

        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-[12px] leading-snug text-stone-700">
          Most self-prep aspirants quietly drop off by <b>week 3</b>. The difference between them and the ones who get the call letter usually isn&apos;t IQ — it&apos;s having <b>someone who notices when you slip</b>. That&apos;s what a buddy is: your logs on their screen, a nudge the day you go quiet.
        </p>
      </div>

      {/* WHAT YOUR BUDDY DOES — real help, personalised */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">What your buddy does for you</p>
        <ul className="mt-2.5 space-y-2 text-[13px] text-stone-700">
          <li className="flex gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Debriefs <b>every weekly mock</b> with you — the single biggest score lever this close to CAT.</li>
          <li className="flex gap-2"><Target className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Drills your weakest section — right now that&apos;s <b>{weakestSection}</b> — instead of a one-size plan.</li>
          <li className="flex gap-2"><Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Keeps your revision on schedule so studied topics don&apos;t slip back.</li>
          <li className="flex gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> A senior who <b>already cleared CAT</b> — not theory, lived experience.</li>
        </ul>
      </div>

      {/* Real mentors — a face beats a bullet list */}
      {recommendedBuddies.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <RecommendedBuddies buddies={recommendedBuddies} studentName={fullName} />
        </div>
      )}

      <div className="rounded-2xl bg-indigo-600 p-4 text-center text-white">
        <p className="text-sm font-bold">{firstName}, you&apos;re already showing up.</p>
        <p className="mx-auto mt-1 max-w-xs text-[12px] leading-snug text-indigo-100">
          {mocksLeft} mocks and {daysToCat} days stand between you and the exam. A buddy is what turns your effort into a percentile.
        </p>
        <div className="mt-3">
          <UnlockBuddyButton variant="secondary" size="lg" className="w-full" fullName={fullName}>Get my IIM buddy →</UnlockBuddyButton>
        </div>
      </div>
    </div>
  );
}
