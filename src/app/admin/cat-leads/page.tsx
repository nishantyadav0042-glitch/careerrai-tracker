import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
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
}

function tierColor(tier: string): 'green' | 'amber' | 'orange' | 'red' | 'stone' {
  const n = parseInt(tier.replace(/\D/g, ''), 10);
  if (n <= 10) return 'green';
  if (n <= 30) return 'amber';
  if (n <= 60) return 'orange';
  return 'stone';
}

export default async function CatLeadsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login');

  const { data: leads, count } = await admin
    .from('cat_test_leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  const rows = (leads ?? []) as Lead[];

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
            CAT Test Leads
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            From <code className="text-xs bg-stone-100 px-1 rounded">/cat-readiness</code> page
          </p>
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
          <div className="space-y-2">
            {rows.map((lead) => (
              <Card key={lead.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
