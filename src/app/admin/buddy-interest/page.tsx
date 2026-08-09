import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { assembleBuddyInterest } from '@/lib/os/buddy-interest';
import { Flame, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

// BUDDY INTEREST — the hottest calls, ranked by what students actually did.
//
// Founder, 10 Aug: "students tapping the buddy screen, opening it more than
// once, spending time there — those are the hottest calls." So this is the
// behavioural buy-intent list: free students, no mentor yet, ranked by a heat
// score built from real signals (reached checkout > plan taps > unlock taps >
// repeat opens > minutes on screen). Each row shows WHY they're hot and opens
// straight into a WhatsApp message. Already-premium students never appear.
function heatTone(heat: number): { label: string; cls: string } {
  if (heat >= 50) return { label: 'Scorching', cls: 'bg-red-100 text-red-700' };
  if (heat >= 24) return { label: 'Hot', cls: 'bg-orange-100 text-orange-700' };
  if (heat >= 10) return { label: 'Warm', cls: 'bg-amber-100 text-amber-800' };
  return { label: 'Curious', cls: 'bg-stone-100 text-stone-600' };
}

export default async function BuddyInterestPage() {
  const { admin } = await requireAdmin();
  const leads = await assembleBuddyInterest(admin, Date.now());

  return (
    <WorkspaceShell
      workspaceId="sales"
      activeHref="/admin/buddy-interest"
      title="Buddy interest"
      subtitle={leads.length === 0
        ? 'No buddy-screen interest to act on right now'
        : `${leads.length} hot call${leads.length === 1 ? '' : 's'} — free students showing they want a mentor`}
    >
      {leads.length === 0 ? (
        <AdminEmpty>
          Nobody is circling the buddy screen right now. When a free student opens it repeatedly, lingers, or taps unlock, they show up here — hottest first.
        </AdminEmpty>
      ) : (
        <div className="space-y-2">
          {leads.map((l, i) => {
            const t = heatTone(l.heat);
            const wa = l.phone ? l.phone.replace(/\D/g, '') : null;
            return (
              <div key={l.id} className={`rounded-2xl border p-3.5 ${i === 0 && l.heat >= 24 ? 'border-orange-300 bg-orange-50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-start gap-2.5">
                  {l.heat >= 24 && <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-stone-900">{l.name}</p>
                      <span className="shrink-0 font-mono text-[11px] text-stone-400">heat {l.heat}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-stone-500">{l.reason}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${t.cls}`}>{t.label}</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-6.5">
                  <Link href={`/admin/student/${l.id}`} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                    Open 360 →
                  </Link>
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700">
                      <Phone className="h-3 w-3" /> Call now
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
