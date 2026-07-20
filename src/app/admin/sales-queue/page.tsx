import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, PhoneCall, Flame, MousePointerClick } from 'lucide-react';
import { getSalesReadyToCall } from '@/lib/admin-filters';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sales queue · CareerRai' };

// The founder's evening call list: free users flagged sales-ready (§D), hottest
// first. Membership + ordering come from the SAME shared filter the dashboard
// count uses (lib/admin-filters.ts) — the card's number is this list's length.
export default async function SalesQueuePage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const queue = await getSalesReadyToCall(admin);
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const nowMs = Date.now();
  const daysSince = (iso: string | null) =>
    iso ? Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000)) : null;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
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
              const name = r.full_name ?? 'Student';
              const wa = r.phone ? `https://wa.me/${r.phone.replace(/\D/g, '')}` : null;
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
                            {r.buddy_cta_clicks} unlock {r.buddy_cta_clicks === 1 ? 'click' : 'clicks'}
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
                        {r.mock_opened && <Badge color="stone">opened a mock</Badge>}
                        {r.signed_up_at != null && <Badge color="stone">{daysSince(r.signed_up_at)}d in</Badge>}
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
