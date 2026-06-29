'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Phone, ChevronDown, ChevronUp, UserX, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';
import { StudentDossier, type StudentDossierData } from '@/components/student-dossier';

interface StudentStat {
  student: Profile & StudentDossierData & { onboarding_completed?: boolean | null };
  summary: { band: string; overallScore: number; daysSubmitted: number; avgStudy: number };
  buddy?: Profile;
  submittedToday: boolean;
  hasRedFlags: boolean;
}

interface PendingStudent {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  status: string;
  assigned_buddy_id: string | null;
}

export function AdminStudentsList({
  students,
  buddies,
  pendingStudents = [],
}: {
  students: StudentStat[];
  buddies: Profile[];
  pendingStudents?: PendingStudent[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleAssign(studentId: string, buddyId: string | null) {
    setLoadingId(studentId);
    try {
      const response = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (response.ok) window.location.reload();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* Active students with profiles */}
      {students.map(({ student, summary, buddy, submittedToday }) => {
        const bandColor = summary.band === 'On track' ? 'green' : summary.band === 'Needs nudging' ? 'amber' : 'red';
        const nameParts = (student.full_name || 'S').split(' ').filter(Boolean);
        const initials = nameParts.map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'S';
        const isLoading = loadingId === student.id;
        const isExpanded = expandedId === student.id;
        const isSparse = student.onboarding_completed &&
          (!student.college || !student.exam_target || !(student.dream_colleges?.length) || !student.starting_percentile);

        return (
          <Card key={student.id} className="p-4">
            {/* Header: avatar + name + expand toggle */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-stone-900 text-sm truncate">{student.full_name}</span>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : student.id)}
                    className="-mt-1 -mr-1 p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 flex-shrink-0"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Status badges — wrap cleanly on their own line */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <Badge color={bandColor}>{summary.overallScore}/100</Badge>
                  {submittedToday ? (
                    <Badge color="green"><CheckCircle2 className="w-3 h-3" />Today</Badge>
                  ) : (
                    <Badge color="amber"><Clock className="w-3 h-3" />Pending</Badge>
                  )}
                  {!student.onboarding_completed && <Badge color="stone">Setup incomplete</Badge>}
                  {isSparse && <Badge color="amber"><AlertCircle className="w-3 h-3" />Profile sparse</Badge>}
                </div>

                <div className="text-xs text-stone-500 mt-1">
                  {student.exam_target ?? 'CAT'} · {summary.daysSubmitted}/7 days logged
                </div>
              </div>
            </div>

            {/* Buddy assignment — its own full-width row, never squeezing the name */}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-medium text-stone-400 flex-shrink-0">Buddy</label>
              <select
                value={buddy?.id || ''}
                onChange={(e) => handleAssign(student.id, e.target.value || null)}
                disabled={isLoading}
                className={cn(
                  'flex-1 min-w-0 px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-600',
                  isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                <option value="">Unassigned</option>
                {buddies.map((b) => (
                  <option key={b.id} value={b.id}>{b.full_name}</option>
                ))}
              </select>
            </div>

            {/* Expanded full dossier — everything the student filled in setup */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <StudentDossier data={student} />
              </div>
            )}
          </Card>
        );
      })}

      {/* Pending students — in allowlist but never logged in */}
      {pendingStudents.map((p) => {
        const nameParts = (p.full_name || 'S').split(' ').filter(Boolean);
        const initials = nameParts.map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'S';
        const assignedBuddy = buddies.find(b => b.id === p.assigned_buddy_id);

        return (
          <Card key={p.id} className="p-4 border-dashed border-stone-300 bg-stone-50/60">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center text-stone-500 text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-700 text-sm">{p.full_name}</span>
                    <Badge color="stone"><UserX className="w-3 h-3" />Never logged in</Badge>
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-3">
                    {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                    {p.email && <span>{p.email}</span>}
                    {assignedBuddy && <span>Buddy: {assignedBuddy.full_name.split(' ')[0]}</span>}
                  </div>
                </div>
              </div>
              <Badge color="stone">Invited</Badge>
            </div>
          </Card>
        );
      })}

      {students.length === 0 && pendingStudents.length === 0 && (
        <div className="text-center py-12 text-stone-400 text-sm">No students yet</div>
      )}
    </div>
  );
}
