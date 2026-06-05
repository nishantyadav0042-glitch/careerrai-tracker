import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Profile, DailyReport } from '@/types';
import { getTodayIST } from '@/lib/utils';
import { CheckCircle2, Clock, AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function getBandColor(score: number) {
  if (score >= 70) return 'green' as const;
  if (score >= 50) return 'amber' as const;
  return 'red' as const;
}

function getBandLabel(score: number) {
  if (score >= 70) return 'On track';
  if (score >= 50) return 'Needs nudging';
  return 'Needs intervention';
}

export default async function BuddyStudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get students assigned to this buddy
  const { data: students } = await supabase
    .from('profiles')
    .select('*')
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const today = getTodayIST();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ydStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Get last 7 days reports for each student
  const studentIds = (students ?? []).map((s) => s.id);
  let reportsMap: Record<string, DailyReport[]> = {};

  if (studentIds.length > 0) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const { data: allReports } = await supabase
      .from('daily_reports')
      .select('*')
      .in('student_id', studentIds)
      .gte('report_date', weekAgoStr);

    (allReports ?? []).forEach((r: DailyReport) => {
      if (!reportsMap[r.student_id]) reportsMap[r.student_id] = [];
      reportsMap[r.student_id].push(r);
    });
  }

  return (
    <div className="space-y-5">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Buddy dashboard</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your students
        </h1>
        <p className="text-sm text-stone-600 mt-1">{(students ?? []).length} active</p>
      </div>

      {(students ?? []).map((student: Profile) => {
        const reps = reportsMap[student.id] ?? [];
        const lastReport = reps.sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
        const lastDate = lastReport?.report_date;

        const avgStress = reps.length ? reps.reduce((s, r) => s + r.stress, 0) / reps.length : 0;
        const avgStudy = reps.length ? reps.reduce((s, r) => s + r.study_duration, 0) / reps.length : 0;
        const avgConfidence = reps.length ? reps.reduce((s, r) => s + r.confidence, 0) / reps.length : 0;

        const consistency = (reps.length / 7) * 25;
        const studyScore = Math.min(25, (avgStudy / 6) * 25);
        const moodScore = Math.min(25, ((avgConfidence + (6 - avgStress)) / 10) * 25);
        const overallScore = Math.round(consistency + studyScore + 12 + moodScore);

        let statusBadge;
        if (lastDate === today) {
          statusBadge = <Badge color="green"><CheckCircle2 className="w-3 h-3" />Submitted today</Badge>;
        } else if (lastDate === ydStr) {
          statusBadge = <Badge color="amber"><Clock className="w-3 h-3" />Last: yesterday</Badge>;
        } else {
          statusBadge = <Badge color="red"><AlertCircle className="w-3 h-3" />Inactive</Badge>;
        }

        const initials = student.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

        return (
          <Link key={student.id} href={`/buddy/students/${student.id}`}>
            <Card className="p-5 cursor-pointer hover:border-stone-400 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">{student.full_name}</div>
                    <div className="text-xs text-stone-500">{student.exam_target ?? 'CAT'}</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-400" />
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                {statusBadge}
                <Badge color={getBandColor(overallScore)}>{getBandLabel(overallScore)}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-stone-200">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Days</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{reps.length}/7</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Avg study</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{avgStudy.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Stress</div>
                  <div className="text-base font-bold text-stone-900 font-mono">{avgStress.toFixed(1)}/5</div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}

      {(students ?? []).length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-stone-600">No students assigned yet. Ask your admin to assign students to you.</p>
        </Card>
      )}

      <Card className="p-5 border-dashed border-2 border-stone-300 text-center">
        <Plus className="w-6 h-6 text-stone-400 mx-auto mb-2" />
        <div className="text-sm font-semibold text-stone-700">Add a new student</div>
        <div className="text-xs text-stone-500 mt-0.5">Ask admin to assign a student to you (Phase 2)</div>
      </Card>
    </div>
  );
}
