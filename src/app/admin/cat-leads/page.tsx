import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  phone: string;
  score: number;
  tier: string;
  created_at: string;
  source: string;
  consistency_score: number | null;
  strategy_score: number | null;
  support_score: number | null;
  varc_rating: number | null;
  dilr_rating: number | null;
  qa_rating: number | null;
  weak_section: string | null;
  anxiety_idx: number | null;
  belief_idx: number | null;
}

function tierColor(tier: string): 'green' | 'amber' | 'orange' | 'red' | 'stone' {
  const n = parseInt(tier.replace(/\D/g, ''), 10);
  if (n <= 10) return 'green';
  if (n <= 25) return 'amber';
  if (n <= 45) return 'orange';
  if (n <= 65) return 'red';
  return 'stone';
}

function weakColor(section: string | null): 'red' | 'orange' | 'amber' | 'stone' {
  if (!section) return 'stone';
  if (['VARC', 'DILR', 'QA'].includes(section)) return 'red';
  if (section === 'Consistency') return 'orange';
  if (section === 'Strategy') return 'amber';
  return 'stone';
}

function RatingDots({ val, max = 5 }: { val: number | null; max?: number }) {
  if (val === null) return <span className="text-stone-300 text-xs">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full inline-block ${i < val ? 'bg-orange-500' : 'bg-stone-200'}`}
        />
      ))}
    </span>
  );
}

function SectionBar({ label, val, max }: { label: string; val: number | null; max: number }) {
  if (val === null) return null;
  const pct = Math.round((val / max) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-stone-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-stone-600 w-8 text-right">{val}/{max}</span>
    </div>
  );
}

const ANXIETY_LABELS = ['Calm', 'A little nervous', 'Moderate', 'High anxiety', 'Paralysed'];
const BELIEF_LABELS  = ['Fully confident', 'Mostly yes', 'Not sure', 'Honestly no'];

export default async function CatLeadsPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login');

  const [{ data: leads, count }, { data: signups }] = await Promise.all([
    admin
      .from('cat_test_leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(200),
    // Every real student account IS a lead — founder: students who logged in
    // (Brijesh, Dinesh, …) were invisible here because they signed up through
    // /start and never took the readiness quiz. Newest first, demo excluded.
    admin
      .from('profiles')
      .select('id, full_name, phone, created_at, onboarding_completed, signup_source, syllabus_target_date, pain_points, wants_mentor, buddy_id')
      .eq('role', 'student')
      .neq('is_demo', true)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const rows = (leads ?? []) as Lead[];
  const signupRows = (signups ?? []) as {
    id: string; full_name: string | null; phone: string | null; created_at: string;
    onboarding_completed: boolean | null; signup_source: string | null;
    syllabus_target_date: string | null; pain_points: string[] | null;
    wants_mentor: boolean | null; buddy_id: string | null;
  }[];
  const waLink = (phone: string | null) => phone ? `https://wa.me/${phone.replace(/\D/g, '').replace(/^(?!91)/, '91')}` : null;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Badge color="stone">Admin</Badge>
            <LogoutButton />
          </div>
        </div>

        {/* Back link */}
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 mb-5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>

        {/* Title */}
        <div className="px-1 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Lead capture</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
            Leads
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            App signups + quiz leads from <code className="text-xs bg-stone-100 px-1 rounded">/cat-readiness</code>
          </p>
        </div>

        {/* ── App signups — every student who created an account ── */}
        <div className="px-1 mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-stone-900">App signups</h2>
          <span className="text-xs font-semibold text-stone-500">{signupRows.length} student{signupRows.length === 1 ? '' : 's'}</span>
        </div>
        {signupRows.length === 0 ? (
          <Card className="p-6 text-center text-stone-500 text-sm mb-8">No student signups yet.</Card>
        ) : (
          <div className="space-y-2.5 mb-8">
            {signupRows.map((s) => (
              <Card key={s.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">{s.full_name ?? 'Student'}</p>
                    <p className="text-xs text-stone-500">{s.phone ?? 'no phone'} · {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {s.onboarding_completed
                      ? <Badge color="green">Plan built</Badge>
                      : <Badge color="amber">Mid-funnel</Badge>}
                    {waLink(s.phone) && (
                      <a href={waLink(s.phone)!} target="_blank" rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  {s.wants_mentor === true && <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">wants buddy</span>}
                  {!s.buddy_id && s.wants_mentor === true && <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">unassigned</span>}
                  {s.syllabus_target_date && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-600">target {new Date(s.syllabus_target_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  {(s.pain_points ?? []).map((p) => (
                    <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">{p.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Quiz leads (/cat-readiness) ── */}
        <div className="px-1 mb-3">
          <h2 className="text-sm font-bold text-stone-900">Readiness-quiz leads</h2>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-teal-600" />
            <div className="text-2xl font-bold font-mono text-stone-900">{count ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Total leads</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold font-mono text-orange-600">
              {rows.length > 0
                ? Math.round(rows.reduce((s, l) => s + l.score, 0) / rows.length)
                : '—'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">Avg score /100</div>
          </Card>
        </div>

        {/* Leads list */}
        {rows.length === 0 ? (
          <Card className="p-8 text-center text-stone-500 text-sm">
            No leads yet. Share the <code className="text-xs bg-stone-100 px-1 rounded">/cat-readiness</code> link to start capturing.
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((lead) => (
              <Card key={lead.id} className="p-4">
                {/* Top row: name + score */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-900 text-sm truncate">{lead.name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{lead.phone}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {new Date(lead.created_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-lg font-black font-mono text-orange-600">{lead.score}/100</span>
                    <Badge color={tierColor(lead.tier)}>{lead.tier}</Badge>
                  </div>
                </div>

                {/* Primary weakness — prominent */}
                {lead.weak_section && (
                  <div className="mb-3">
                    <Badge color={weakColor(lead.weak_section)}>
                      ⚠ Weakness: {lead.weak_section}
                    </Badge>
                  </div>
                )}

                {/* Subject ratings */}
                {(lead.varc_rating !== null || lead.dilr_rating !== null || lead.qa_rating !== null) && (
                  <div className="bg-stone-50 rounded-lg p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-2">Subject Ratings (1–5)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <div className="text-[10px] text-stone-500 mb-1">VARC</div>
                        <RatingDots val={lead.varc_rating} />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-stone-500 mb-1">DILR</div>
                        <RatingDots val={lead.dilr_rating} />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-stone-500 mb-1">QA</div>
                        <RatingDots val={lead.qa_rating} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Section scores */}
                {(lead.consistency_score !== null || lead.strategy_score !== null || lead.support_score !== null) && (
                  <div className="space-y-1.5 mb-3">
                    <SectionBar label="Consistency" val={lead.consistency_score} max={40} />
                    <SectionBar label="Strategy"    val={lead.strategy_score}    max={40} />
                    <SectionBar label="Accountability" val={lead.support_score}  max={20} />
                  </div>
                )}

                {/* Mental state */}
                {(lead.anxiety_idx !== null || lead.belief_idx !== null) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                    {lead.anxiety_idx !== null && (
                      <span className="text-[10px] text-stone-500">
                        Anxiety: <span className="font-semibold text-stone-700">{ANXIETY_LABELS[lead.anxiety_idx] ?? lead.anxiety_idx}</span>
                      </span>
                    )}
                    {lead.belief_idx !== null && (
                      <span className="text-[10px] text-stone-500">
                        Belief: <span className="font-semibold text-stone-700">{BELIEF_LABELS[lead.belief_idx] ?? lead.belief_idx}</span>
                      </span>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
