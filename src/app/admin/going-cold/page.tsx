import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGoingCold } from '@/lib/admin-filters';
import { ArrowLeft, Snowflake } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Going cold · CareerRai' };

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  if (d.length !== 12 || !d.startsWith('91')) return null;
  return d;
}

function message(first: string): string {
  return `Hi ${first}, Nishant here from CareerRai. Aapne kuch din se log nahi kiya — sab theek? Koi dikkat ho app me ya prep me, seedha yahin bata do. Main personally dekh raha hoon.`;
}

// The list behind "Going cold (4+ days)": students whose last log is 4 or more
// days old. Same shared filter as the dashboard count (lib/admin-filters.ts).
// Students who never logged at all are NOT here — they never had activity to
// go cold from (they live in "Remind to log today").
export default async function GoingColdPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const list = await getGoingCold(admin);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Going cold (4+ days)</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          {list.length} {list.length === 1 ? 'student' : 'students'} last logged 4+ days ago · freshest first — call these before the habit dies
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-800">
          Nobody is going cold. 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const wa = waNumber(r.phone);
            const first = (r.full_name ?? '').trim().split(' ')[0] || 'there';
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Snowflake className="h-4 w-4 shrink-0 text-sky-500" />
                    <span className="truncate text-[15px] font-bold text-stone-900">{r.full_name ?? 'Student'}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-stone-400">
                    {r.phone ?? 'no phone'} · last log {r.lastLogDate} ({r.daysSince}d ago)
                  </div>
                </div>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(message(first))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center rounded-xl bg-[#25d366] px-3.5 py-2 text-[13px] font-bold text-[#04331c] active:scale-95"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
