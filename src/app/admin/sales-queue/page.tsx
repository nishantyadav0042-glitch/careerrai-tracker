import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, PhoneCall, Flame, MousePointerClick } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sales queue · CareerRai' };

// The founder's evening call list: free users flagged sales-ready (§D), hottest
// first (most buddy-CTA clicks). Each row is someone whose usage data you can
// open the call with ("you logged Mon–Wed, missed Thu…").
export default async function SalesQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // Sales-ready, not yet called, hottest (most buddy-CTA clicks) first.
  const { data: rows } = await admin
    .from('student_engagement')
    .select('student_id, buddy_cta_clicks, mock_opened, first_log_at, signed_up_at, sales_ready_at, sales_called_at')
    .eq('sales_ready', true)
    .is('sales_called_at', null)
    .order('buddy_cta_clicks', { ascending: false })
    .limit(200);

  const ids = (rows ?? []).map((r) => r.student_id);
  const [{ data: profs }, { data: streaks }] = await Promise.all([
    ids.length
      ? admin.from('profiles').select('id, full_name, phone, is_premium').in('id', ids)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; phone: string | null; is_premium: boolean | null }[] }),
    ids.length
      ? admin.from('streak_data').select('student_id, current_streak').in('student_id', ids)
      : Promise.resolve({ data: [] as { student_id: string; current_streak: number }[] }),
  ]);
  const profById = new Map((profs ?? []).map((p) => [p.id, p]));
  const streakById = new Map((streaks ?? []).map((s) => [s.student_id, s.current_streak]));

  // Only show those who are still free (a paid student isn't a sales lead anymore).
  const queue = (rows ?? [])
    .map((r) => ({ ...r, prof: profById.get(r.student_id), streak: streakById.get(r.student_id) ?? 0 }))
    .filter((r) => r.prof && !r.prof.is_premium);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const daysSince = (iso: string | null) =>
    iso ? Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000) : null;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <LogoutButton />
        </div>

        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Admin
        </Link>

        <div className="mb-4">
          <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <PhoneCall className="w-5 h-5" /> Sales queue
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Free users ready for the buddy call — hottest first. {queue.length} waiting.
          </p>
        </div>

        {queue.length === 0 ? (
          <Card className="p-8 text-center text-stone-500">
            No one in the queue right now. Hot leads appear here the moment they reach for the locked buddy.
          </Card>
        ) : (
          <div className="space-y-2.5">
            {queue.map((r) => {
              const name = r.prof?.full_name ?? 'Student';
              const phone = r.prof?.phone ?? null;
              const wa = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : null;
              const signupDays = daysSince(r.signed_up_at);
              return (
                <Card key={r.student_id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{name}</p>
                      <p className="text-xs text-stone-500">{phone ?? 'no phone'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {r.buddy_cta_clicks > 0 && (
                          <Badge color="purple">
                            <MousePointerClick className="w-3 h-3 mr-0.5 inline" />
                            {r.buddy_cta_clicks} unlock {r.buddy_cta_clicks === 1 ? 'click' : 'clicks'}
                          </Badge>
                        )}
                        {r.streak >= 1 && (
                          <Badge color="orange">
                            <Flame className="w-3 h-3 mr-0.5 inline" />{r.streak}-day streak
                          </Badge>
                        )}
                        {r.mock_opened && <Badge color="stone">opened a mock</Badge>}
                        {signupDays != null && <Badge color="stone">{signupDays}d in</Badge>}
                      </div>
                    </div>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800"
                      >
                        <PhoneCall className="w-4 h-4" /> WhatsApp
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
