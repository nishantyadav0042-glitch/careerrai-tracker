import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStreakBreakers } from '@/lib/streak-breakers';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

// "Streak breakers — skipped yesterday": logged the day before yesterday, missed
// yesterday, still silent today. WhatsApp-button-only, one tap per student with
// a simple direct message pre-filled.

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  if (d.length !== 12 || !d.startsWith('91')) return null;
  return d;
}

function message(first: string): string {
  return `Hi ${first}, Nishant from CareerRai. You missed yesterday's log but your Momentum Shield covered it — your streak is safe. Log today's study and keep it going. Koi problem ho to bata do.`;
}

export default async function StreakBreakersPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const cohort = await getStreakBreakers(admin);
  const withPhone = cohort.map((s) => ({ ...s, wa: waNumber(s.phone) })).filter((s) => s.wa);
  const noPhone = cohort.length - withPhone.length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Streak breakers</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          Logged the day before yesterday, skipped yesterday, still silent today · {cohort.length} {cohort.length === 1 ? 'student' : 'students'}
          {noPhone > 0 ? ` · ${noPhone} without a phone` : ''}
        </p>
      </div>

      {withPhone.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-800">
          No streak breakers right now. 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {withPhone.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-stone-900">{s.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-stone-400">{s.phone}</div>
              </div>
              <a
                href={`https://wa.me/${s.wa}?text=${encodeURIComponent(message(s.first))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#25d366] px-4 py-2.5 text-[13px] font-bold text-[#04331c] active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#04331c]"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.25-.1-.45-.15-.65.15-.2.3-.75.95-.9 1.15-.15.2-.35.2-.65.05-.3-.15-1.25-.45-2.4-1.5-.9-.8-1.5-1.75-1.65-2.05-.15-.3 0-.45.15-.6.15-.15.3-.35.45-.55.15-.2.2-.3.3-.5.1-.2.05-.4-.05-.55-.1-.15-.65-1.6-.9-2.2-.25-.55-.5-.5-.65-.5h-.55c-.2 0-.5.05-.75.35-.25.3-1 1-1 2.4s1.05 2.8 1.2 3c.15.2 2.05 3.15 5 4.4.7.3 1.25.5 1.65.65.7.2 1.35.2 1.85.1.55-.05 1.7-.7 1.95-1.35.25-.65.25-1.2.15-1.35-.05-.1-.25-.2-.55-.35zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.65 1.4 5.2L2 22l4.95-1.3C8.45 21.5 10.2 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
                WhatsApp
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
