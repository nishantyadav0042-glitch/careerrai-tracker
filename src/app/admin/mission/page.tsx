import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildMissionQueue } from '@/lib/mission-queue';
import { MissionDeck } from '@/components/mission-deck';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tonight’s Mission · CareerRai' };

function istHour(): number {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  return parseInt(s, 10) % 24;
}

export default async function MissionPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const { cards, rootCause: rc, sentToday } = await buildMissionQueue(admin, 40);
  const mins = Math.round(cards.length * 1.5);
  const hour = istHour();
  const primeTime = hour >= 18 && hour < 21;

  // Root-cause branches, biggest first — attack the biggest branch.
  const branches = [
    { label: 'Never installed the app', count: rc.notInstalled, color: 'bg-orange-500' },
    { label: 'Installed · notifications off', count: rc.installedNotifOff, color: 'bg-rose-500' },
    { label: 'Reachable · never studied', count: rc.reachableNeverLogged, color: 'bg-amber-400' },
    { label: 'Was active · now silent', count: rc.wasActiveNowSilent, color: 'bg-stone-500' },
    { label: 'Active in last 3 days', count: rc.activeRecently, color: 'bg-emerald-500' },
  ].sort((a, b) => b.count - a.count);
  const maxBranch = Math.max(1, ...branches.map((b) => b.count));

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        {/* The mission header — what to do, how long, one glance. */}
        <div className="rounded-2xl border border-stone-900 bg-stone-900 p-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-400">Tonight&apos;s Founder Mission</p>
          <h1 className="mt-1 text-2xl font-bold">{cards.length} students need you</h1>
          <p className="mt-1 text-sm text-stone-300">~{mins} minutes · ready-to-send messages · no repeats · one tap each.</p>
          <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold',
            primeTime ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-stone-300')}>
            {primeTime ? '🟢 Prime time (6–9 PM) — highest reply rate. Go now.' : '⏰ Best window is 6–9 PM (highest reply rate). You can work it anytime.'}
          </div>
        </div>

        {/* Root cause — attack the biggest branch. */}
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Why {rc.total} students are stuck</p>
          <div className="space-y-1.5">
            {branches.map((b) => (
              <div key={b.label} className="flex items-center gap-2.5">
                <span className="w-40 shrink-0 text-[12px] font-medium text-stone-700">{b.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div className={cn('h-full rounded-full', b.color)} style={{ width: `${(b.count / maxBranch) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-[12px] font-bold text-stone-800 tabular-nums">{b.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">The biggest branch is where the company&apos;s growth is trapped — fix that flow, not one student at a time.</p>
        </div>

        <div className="mt-4">
          <MissionDeck cards={cards} sentToday={sentToday} />
        </div>
      </div>
    </div>
  );
}
