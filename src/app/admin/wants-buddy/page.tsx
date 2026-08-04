import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, HeartHandshake, Flame, MousePointerClick, Smartphone } from 'lucide-react';
import { getWantsBuddy } from '@/lib/admin-filters';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Wants a buddy · CareerRai' };

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  if (d.length !== 12 || !d.startsWith('91')) return null;
  return d;
}

function message(first: string): string {
  return `Hi ${first}, Nishant from CareerRai. Signup pe aapne bola tha ki ek mentor chahiye — wo ab ready hai. Ek personal buddy jo aapka plan, weak areas aur mocks track karega. Interested? Bas YES reply kar do. App: ${SITE_URL}`;
}

// The list behind "Want a buddy": students who EXPLICITLY said yes to the
// mentor question during onboarding, still free, still unassigned. A declared
// want — the hottest sales list we have. Membership + ordering come from the
// SAME shared filter as the dashboard count (lib/admin-filters.ts).
export default async function WantsBuddyPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const list = await getWantsBuddy(admin);
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();
  const daysIn = (iso: string) => Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000));
  // Signup moment in IST — Vercel renders in UTC, so the timeZone must be explicit.
  const joinedAt = (iso: string) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    return `${day}, ${time}`;
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2" style={{ fontFamily: 'Georgia, serif' }}>
            <HeartHandshake className="w-5 h-5" /> Wants a buddy
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {list.length} {list.length === 1 ? 'student' : 'students'} said YES to wanting a mentor at signup — still free, still unassigned. Hottest first.
          </p>
        </div>

        {list.length === 0 ? (
          <Card className="p-8 text-center text-stone-500">
            Nobody waiting — every declared yes has a buddy or went premium.
          </Card>
        ) : (
          <div className="space-y-2.5">
            {list.map((r) => {
              const name = r.full_name ?? 'Student';
              const first = (r.full_name ?? '').trim().split(' ')[0] || 'there';
              const wa = waNumber(r.phone);
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{name}</p>
                      <p className="text-xs text-stone-500">{r.phone ?? 'no phone'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {r.buddy_cta_clicks > 0 && (
                          <Badge color="purple">
                            <MousePointerClick className="w-3 h-3 mr-0.5 inline" />
                            {r.buddy_cta_clicks} unlock {r.buddy_cta_clicks === 1 ? 'tap' : 'taps'}
                          </Badge>
                        )}
                        {r.streak >= 1 ? (
                          <Badge color="orange">
                            <Flame className="w-3 h-3 mr-0.5 inline" />{r.streak}-day streak
                          </Badge>
                        ) : r.lastLogDays != null ? (
                          <Badge color="red">last log {r.lastLogDays === 0 ? 'today' : `${r.lastLogDays}d ago`}</Badge>
                        ) : (
                          <Badge color="stone">never logged</Badge>
                        )}
                        {r.mentorDoor && <Badge color="green">🚪 {r.mentorDoor} door</Badge>}
                        {r.app_installed && (
                          <Badge color="stone">
                            <Smartphone className="w-3 h-3 mr-0.5 inline" />installed
                          </Badge>
                        )}
                        <Badge color="stone">joined {joinedAt(r.created_at)} · {daysIn(r.created_at)}d ago</Badge>
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
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
