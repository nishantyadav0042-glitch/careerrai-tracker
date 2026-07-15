import { UnlockBuddyButton } from '@/components/unlock-buddy-sheet';
import type { RecommendedBuddyResult } from '@/lib/buddy-match';
import { MessageSquare, ArrowRight, ShieldAlert, Check, X, Users, Star, TrendingUp, GraduationCap, Bell } from 'lucide-react';

// The free-student /student/buddy screen = the conversion asset (mockup
// f1dbd73a). Zero-scroll, one phone screen. Reads as a personal preparation
// dashboard, and every block makes the gap between "alone" and "with a buddy"
// visceral: match → health (with accountability visibly low) → the biggest
// risk → what a buddy would've done this week → alone-vs-buddy → proof → price.

export interface BuddyPitchData {
  firstName: string;
  overall: number; delta: number;
  consistency: number; planning: number; mockAnalysis: number; accountability: number;
  lastMockN: number; skipTopic: string; daysQuiet: number;
}

// tiny up/down sparkline
function Spark({ up, color }: { up: boolean; color: string }) {
  const pts = up ? '0,14 8,11 16,12 24,7 32,8 40,3' : '0,4 8,7 16,6 24,10 32,9 40,13';
  return (
    <svg width="44" height="16" viewBox="0 0 40 16" className="mt-1"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

function Metric({ label, value, up, color }: { label: string; value: number; up: boolean; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-stone-200/70 bg-white px-1 py-2">
      <span className="text-[10px] font-semibold text-stone-500">{label}</span>
      <span className="text-lg font-extrabold text-stone-900 leading-none mt-0.5">{value}</span>
      <Spark up={up} color={color} />
    </div>
  );
}

export function BuddyPitch({ data, recommendedBuddies = [] }: {
  data: BuddyPitchData;
  recommendedBuddies?: RecommendedBuddyResult[];
}) {
  const { overall, delta, consistency, planning, mockAnalysis, accountability, lastMockN, skipTopic, daysQuiet } = data;
  const top = recommendedBuddies[0] ?? null;
  const buddyName = top?.full_name ?? 'Your IIM mentor';
  const iim = top?.iim_converted ?? 'IIM alumnus';
  const pct = top?.cat_percentile != null ? `${top.cat_percentile}%ile` : '99%ile';
  const strength = top?.strongest_section ? `Strong in ${top.strongest_section}` : 'Cracked CAT';
  const R = 30, C = 2 * Math.PI * R, off = C * (1 - overall / 100);

  const wouldHave = [
    { icon: Bell, tint: 'text-emerald-600 bg-emerald-50', label: 'Reminded you yesterday' },
    { icon: MessageSquare, tint: 'text-indigo-600 bg-indigo-50', label: `Reviewed Mock ${lastMockN}` },
    { icon: TrendingUp, tint: 'text-amber-600 bg-amber-50', label: `Suggested skipping ${skipTopic}` },
    { icon: Star, tint: 'text-rose-600 bg-rose-50', label: 'Saved 3 study hours' },
  ];
  const alone = ['Decide tomorrow’s plan yourself', 'Unsure why mock score dropped', 'Nobody checks if you disappear', 'Random revisions', 'Same coaching plan'];
  const withB = ['Tomorrow’s plan, automatically', 'Every mistake categorized', 'Daily follow-up & accountability', 'Structured weekly revision', 'A personal roadmap for you'];

  return (
    <div className="flex h-[calc(100svh-6.5rem)] flex-col gap-2 overflow-hidden">
      {/* YOUR BUDDY */}
      <div className="shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Your buddy</p>
        <div className="rounded-2xl border border-stone-200/70 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-stone-200">
              {top?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={top.avatar_url} alt={buddyName} className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center"><GraduationCap className="h-6 w-6 text-stone-400" /></div>}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">96% Match</span>
              </div>
              <p className="mt-0.5 text-[13px] font-bold text-stone-900">{buddyName} <span className="font-medium text-stone-500">· CAT {pct}</span></p>
              <p className="text-[11px] text-stone-500">{iim} · {strength}</p>
            </div>
          </div>
          <div className="mt-2.5">
            <UnlockBuddyButton variant="primary" size="md" className="w-full">
              <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Start a chat</span>
            </UnlockBuddyButton>
          </div>
        </div>
      </div>

      {/* PREPARATION HEALTH */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Your preparation health</p>
          <p className="text-[10px] text-stone-400">Updated today</p>
        </div>
        <div className="flex items-stretch gap-2">
          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-stone-200/70 bg-white px-3 py-2">
            <div className="relative">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={R} fill="none" stroke="#f1f0ef" strokeWidth="7" />
                <circle cx="36" cy="36" r={R} fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 36 36)" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold leading-none text-stone-900">{overall}</span>
                <span className="text-[8px] text-stone-400">/100</span>
              </div>
            </div>
            <span className="mt-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">↗ +{delta} vs last wk</span>
          </div>
          <div className="grid flex-1 grid-cols-4 gap-1.5">
            <Metric label="Consistency" value={consistency} up color="#10b981" />
            <Metric label="Planning" value={planning} up color="#8b5cf6" />
            <Metric label="Mock analysis" value={mockAnalysis} up={false} color="#f59e0b" />
            <Metric label="Accountability" value={accountability} up={false} color="#f43f5e" />
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
          <p className="min-w-0 flex-1 text-[11px] leading-tight text-rose-800"><b>Biggest risk:</b> nobody notices when you disappear for {daysQuiet} days. A buddy solves this.</p>
        </div>
      </div>

      {/* THIS WEEK YOUR BUDDY WOULD HAVE */}
      <div className="shrink-0">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">This week your buddy would have</p>
        <div className="grid grid-cols-4 gap-1.5">
          {wouldHave.map((w) => (
            <div key={w.label} className="flex flex-col items-center rounded-xl border border-stone-200/70 bg-white px-1 py-2 text-center">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full ${w.tint}`}><w.icon className="h-3.5 w-3.5" /></div>
              <span className="mt-1 text-[9.5px] font-medium leading-tight text-stone-600">{w.label}</span>
              <Check className="mt-1 h-3.5 w-3.5 rounded-full bg-emerald-500 p-0.5 text-white" />
            </div>
          ))}
        </div>
      </div>

      {/* THE DIFFERENCE — alone vs buddy */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">The difference</p>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-xl bg-rose-50 p-2">
            <p className="mb-1 text-[11px] font-bold text-rose-700">Preparing alone</p>
            <ul className="space-y-0.5">
              {alone.map((t) => <li key={t} className="flex gap-1 text-[10px] leading-tight text-stone-600"><X className="mt-0.5 h-2.5 w-2.5 shrink-0 text-rose-400" />{t}</li>)}
            </ul>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2">
            <p className="mb-1 text-[11px] font-bold text-emerald-700">With your buddy</p>
            <ul className="space-y-0.5">
              {withB.map((t) => <li key={t} className="flex gap-1 text-[10px] leading-tight text-stone-700"><Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-600" />{t}</li>)}
            </ul>
          </div>
        </div>
        {/* proof */}
        <div className="mt-1.5 grid grid-cols-4 gap-1.5 rounded-xl border border-stone-200/70 bg-white p-2">
          {[['187', 'calls this month', Users], ['4.9★', 'avg rating', Star], ['96%', 'attend weekly', Users], ['2.3×', 'more syllabus', TrendingUp]].map(([v, l]) => (
            <div key={l as string} className="text-center">
              <div className="text-[13px] font-extrabold text-stone-900">{v as string}</div>
              <div className="text-[8.5px] leading-tight text-stone-500">{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PRICE — the close, always visible */}
      <div className="shrink-0 rounded-2xl bg-stone-900 p-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-stone-400">All this support</p>
            <p className="text-xl font-extrabold leading-none">₹999<span className="text-xs font-semibold text-stone-400">/month</span></p>
            <p className="mt-0.5 text-[9px] text-stone-500">Cancel anytime · no auto-debit</p>
          </div>
          <div className="text-right text-[9px] leading-tight text-stone-300">
            30 daily check-ins · 4 strategy calls<br />unlimited chat · mock review · personal plan
          </div>
        </div>
        <div className="mt-2">
          <UnlockBuddyButton variant="secondary" size="lg" className="w-full">
            <span className="inline-flex items-center gap-2">Choose my buddy <ArrowRight className="h-4 w-4" /></span>
          </UnlockBuddyButton>
        </div>
      </div>
    </div>
  );
}
