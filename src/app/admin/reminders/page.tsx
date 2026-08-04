import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRemindToLog } from '@/lib/admin-filters';
import { ArrowLeft } from 'lucide-react';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

// "Remind to log today" — the founder's door from the dashboard. Lists every
// onboarded student who hasn't filled TODAY's log yet (app 3 AM IST log-day),
// each with a one-tap WhatsApp reminder. Students who might still log late
// tonight get a gentle nudge, not a "you missed it". Logged-before students are
// ranked first (highest intent to keep going).

// wa.me needs digits only, with country code. Indian numbers are stored either
// as +91XXXXXXXXXX or a bare 10-digit — normalise both.
function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  if (d.length !== 12 || !d.startsWith('91')) return null;
  return d;
}

function reminderText(firstName: string): string {
  return `Hi ${firstName}, Nishant from CareerRai. You haven't logged today's study yet — it takes 30 seconds and keeps your plan accurate. Log it now: ${SITE_URL}. Koi dikkat ho to bata do.`;
}

export default async function AdminRemindersPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // Membership comes from the SAME shared filter as the dashboard card
  // (lib/admin-filters.ts) — the card's number is this list's length. This page
  // only adds display extras (WhatsApp link) on top of that exact set.
  const cohort = await getRemindToLog(admin);
  const list = cohort.map((s) => {
    const first = (s.full_name ?? '').trim().split(' ')[0] || 'there';
    const wa = waNumber(s.phone);
    return {
      id: s.id,
      name: s.full_name ?? 'Student',
      first,
      phone: s.phone,
      everLogged: s.lastLogDate != null,
      lastLog: s.lastLogDate,
      waLink: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(reminderText(first))}` : null,
    };
  });

  const remindable = list.filter((s) => s.waLink);
  const noPhone = list.length - remindable.length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Remind to log today</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          {list.length} onboarded {list.length === 1 ? 'student hasn’t' : 'students haven’t'} filled today’s log yet · tap to send a WhatsApp reminder
          {noPhone > 0 ? ` · ${noPhone} have no phone on file` : ''}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-800">
          Everyone has logged today. 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-bold text-stone-900">{s.name}</span>
                  {s.everLogged ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">🔁 logged before</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">🆕 never logged</span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-stone-400">
                  {s.phone ?? 'no phone on file'}{s.lastLog ? ` · last log ${s.lastLog}` : ''}
                </div>
              </div>
              {s.waLink && (
                <a
                  href={s.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#25d366] px-3.5 py-2 text-[13px] font-bold text-[#04331c] active:scale-95"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#04331c]"><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.25-.1-.45-.15-.65.15-.2.3-.75.95-.9 1.15-.15.2-.35.2-.65.05-.3-.15-1.25-.45-2.4-1.5-.9-.8-1.5-1.75-1.65-2.05-.15-.3 0-.45.15-.6.15-.15.3-.35.45-.55.15-.2.2-.3.3-.5.1-.2.05-.4-.05-.55-.1-.15-.65-1.6-.9-2.2-.25-.55-.5-.5-.65-.5h-.55c-.2 0-.5.05-.75.35-.25.3-1 1-1 2.4s1.05 2.8 1.2 3c.15.2 2.05 3.15 5 4.4.7.3 1.25.5 1.65.65.7.2 1.35.2 1.85.1.55-.05 1.7-.7 1.95-1.35.25-.65.25-1.2.15-1.35-.05-.1-.25-.2-.55-.35zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.65 1.4 5.2L2 22l4.95-1.3C8.45 21.5 10.2 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
                  Remind
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
