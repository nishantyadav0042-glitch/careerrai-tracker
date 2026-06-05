'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface StudentStat {
  student: Profile;
  summary: { band: string; overallScore: number; daysSubmitted: number; avgStudy: number };
  buddy?: Profile;
  submittedToday: boolean;
  hasRedFlags: boolean;
}

export function AdminStudentsList({
  students,
  buddies,
}: {
  students: StudentStat[];
  buddies: Profile[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAssign(studentId: string, buddyId: string | null) {
    setLoadingId(studentId);
    try {
      const response = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (response.ok) {
        window.location.reload();
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {students.map(({ student, summary, buddy, submittedToday }) => {
        const bandColor = summary.band === 'On track' ? 'green' : summary.band === 'Needs nudging' ? 'amber' : 'red';
        const initials = student.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
        const isLoading = loadingId === student.id;

        return (
          <Card key={student.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-gradient-to-br from-stone-900 to-stone-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900 text-sm">{student.full_name}</span>
                    <Badge color={bandColor}>{summary.overallScore}/100</Badge>
                    {submittedToday ? (
                      <Badge color="green">
                        <CheckCircle2 className="w-3 h-3" />
                        Today
                      </Badge>
                    ) : (
                      <Badge color="amber">
                        <Clock className="w-3 h-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {student.exam_target} · {buddy?.full_name.split(' ')[0] || 'No buddy'} · {summary.daysSubmitted}/7 days
                  </div>
                </div>
              </div>

              {/* Buddy dropdown */}
              <select
                value={buddy?.id || ''}
                onChange={(e) => handleAssign(student.id, e.target.value || null)}
                disabled={isLoading}
                className={cn(
                  'px-3 py-1.5 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-600',
                  isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                <option value="">Unassigned</option>
                {buddies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
