import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stepLabel } from '@/lib/lead-intel';
import { waMessages, waNumber, leadState } from '@/lib/wa-messages';
import { dreamCollegeLabel } from '@/lib/notification-os';

// Build a wa.me link with the SUGGESTED outreach message pre-typed, chosen from
// the lead's state (no app → install nudge, installed-but-no-notifs → turn on
// reminders, engaged → keep going). One tap opens WhatsApp ready to send.
function waPrefilled(
  phone: string | null,
  fullName: string | null,
  dreamColleges: unknown,
  appInstalled: boolean,
  pushOn: boolean
): string | null {
  if (!phone) return null;
  const firstName = (fullName ?? 'there').split(' ')[0];
  const state = leadState(appInstalled, pushOn);
  const msgs = waMessages({ firstName, dreamCollege: dreamCollegeLabel(dreamColleges) });
  const suggested = msgs.find((m) => m.suggestedFor === state) ?? msgs[0];
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(suggested.text)}`;
}

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New Leads · CareerRai' };

// New Leads — THE single leads platform (founder spec, deliberately simple):
// every login is a lead. Two sections (Students / Buddies), newest first,
// tap any card for the complete profile, one-tap WhatsApp, Excel export.
// No tiers, no scoring on this page — the depth lives on the detail page.
function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('91') ? digits : `91${digits}`}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function StatusChip({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
      {on ? yes : no}
    </span>
  );
}

export default async function LeadsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // Test/friend accounts (is_test_account) are hidden from the leads list so
  // founder testing never pollutes the real pipeline. Toggle it per-lead on
  // the detail page.
  const [{ data: students }, { data: buddies }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, created_at, onboarding_completed, onboarding_step_reached, post_signup_done, app_installed, notif_prefs, pain_points, wants_mentor, buddy_id, syllabus_target_date, dream_colleges')
      .eq('role', 'student')
      .eq('is_test_account', false)
      .order('created_at', { ascending: false }),
    admin.from('profiles')
      .select('id, full_name, phone, created_at, college, cat_percentile, app_installed, notif_prefs')
      .eq('role', 'buddy')
      .eq('is_test_account', false)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>New Leads</h1>
            <p className="text-sm text-stone-500 mt-0.5">Everyone who logged in, newest first. Tap a lead for the full profile.</p>
          </div>
          <a
            href="/api/admin/leads-export"
            className="shrink-0 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800"
          >
            ⬇ Excel
          </a>
        </div>

        {/* ── Students ── */}
        <h2 className="mb-2 px-1 text-sm font-bold text-stone-900">
          Students <span className="font-semibold text-stone-400">({(students ?? []).length})</span>
        </h2>
        {(students ?? []).length === 0 ? (
          <p className="px-1 text-sm text-stone-500 mb-8">No student signups yet.</p>
        ) : (
          <div className="space-y-2 mb-8">
            {(students ?? []).map((s) => {
              const push = (s.notif_prefs as { push?: boolean } | null)?.push === true;
              const wa = waPrefilled(s.phone as string | null, s.full_name as string | null, s.dream_colleges, s.app_installed === true, push);
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3.5">
                  <Link href={`/admin/leads/${s.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-stone-900">{(s.full_name as string | null) ?? 'Student'}</p>
                      {s.onboarding_completed
                        ? <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Plan built</span>
                        : <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Dropped: {stepLabel((s.onboarding_step_reached as number | null) ?? 0)}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {(s.phone as string | null) ?? 'no phone'} · {fmtDate(s.created_at as string)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <StatusChip on={s.app_installed === true} yes="App ✓" no="No app" />
                      <StatusChip on={push} yes="Notif ✓" no="Notif ✗" />
                      {s.wants_mentor === true && !s.buddy_id && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">wants buddy · unassigned</span>
                      )}
                      {(Array.isArray(s.pain_points) ? (s.pain_points as string[]) : []).map((p) => (
                        <span key={p} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{p.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white">
                      WhatsApp
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Buddies ── */}
        <h2 className="mb-2 px-1 text-sm font-bold text-stone-900">
          Buddies <span className="font-semibold text-stone-400">({(buddies ?? []).length})</span>
        </h2>
        {(buddies ?? []).length === 0 ? (
          <p className="px-1 text-sm text-stone-500">No buddy signups yet.</p>
        ) : (
          <div className="space-y-2">
            {(buddies ?? []).map((b) => {
              const push = (b.notif_prefs as { push?: boolean } | null)?.push === true;
              const wa = waLink(b.phone as string | null);
              return (
                <div key={b.id} className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-3.5">
                  <Link href={`/admin/leads/${b.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-stone-900">{(b.full_name as string | null) ?? 'Buddy'}</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {(b.phone as string | null) ?? 'no phone'} · {fmtDate(b.created_at as string)}
                      {b.cat_percentile != null && <> · {b.cat_percentile as number} %ile</>}
                      {b.college != null && <> · {b.college as string}</>}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <StatusChip on={b.app_installed === true} yes="App ✓" no="No app" />
                      <StatusChip on={push} yes="Notif ✓" no="Notif ✗" />
                    </div>
                  </Link>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white">
                      WhatsApp
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
