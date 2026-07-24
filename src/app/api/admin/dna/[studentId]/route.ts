import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isRequestAdmin } from '@/lib/require-admin';

// The instant "why" answer for one student (founder, 24 Jul): "Why is Rahul
// marked high purchase intent?" should never require SQL or guessing — this
// returns the current scores + full explanations, the change-history timeline
// (every metric move with its drivers), the milestones this student has hit,
// and every recommendation the Brain has ever made for them (with outcomes,
// where known) — a complete, inspectable record of the Brain's reasoning.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  if (!(await isRequestAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId } = await params;
  const admin = createAdminClient();

  const [{ data: profile }, { data: dna }, { data: history }, { data: milestones }, { data: decisions }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, is_premium, created_at').eq('id', studentId).maybeSingle(),
    admin.from('student_dna').select('*').eq('student_id', studentId).maybeSingle(),
    admin.from('student_dna_history').select('metric, prev_value, new_value, drivers, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
    admin.from('student_milestones').select('milestone, meta, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
    // `ranked` = every alternative the Brain considered and did NOT choose —
    // the opportunity-cost record ("we chose convert_now over winback_human;
    // was that actually right?").
    admin.from('decision_log').select('action_id, label, channel, impact, why, ranked, executed, outcome, business_impact, outcome_at, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
  ]);

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    student: { id: profile.id, name: profile.full_name, phone: profile.phone, isPremium: profile.is_premium, signedUp: profile.created_at },
    dna: dna ?? null,               // scores + explanations + next_best_action, all in one row
    timeline: history ?? [],        // every metric change, with drivers ("why did this move")
    milestones: milestones ?? [],   // semantic state transitions this student has hit
    decisions: decisions ?? [],     // every recommendation the Brain has made, + outcome if known
  });
}
