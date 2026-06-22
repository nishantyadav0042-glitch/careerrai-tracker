'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

interface StudentDossierData {
  id: string;
  full_name: string;
  is_repeater?: boolean | null;
  starting_percentile?: number | null;
  target_percentile?: number | null;
  baseline_varc?: number | null;
  baseline_dilr?: number | null;
  baseline_qa?: number | null;
  dream_colleges?: string[] | null;
  exam_target?: string | null;
  buddy_id?: string | null;
  created_at?: string | null;
}

interface BuddyData {
  id: string;
  full_name: string;
  cat_percentile?: number | null;
  starting_percentile?: number | null;
  is_repeater?: boolean | null;
  is_working_professional?: boolean | null;
  studentCount: number;
}

interface AdminMatchPanelProps {
  unmatchedStudents: StudentDossierData[];
  buddies: BuddyData[];
}

function weakestSection(s: StudentDossierData): string | null {
  const sections = [
    { name: 'VARC', val: s.baseline_varc },
    { name: 'DILR', val: s.baseline_dilr },
    { name: 'QA', val: s.baseline_qa },
  ].filter(x => x.val != null) as { name: string; val: number }[];
  if (!sections.length) return null;
  return sections.sort((a, b) => a.val - b.val)[0].name;
}

function daysWaiting(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

export function AdminMatchPanel({ unmatchedStudents, buddies }: AdminMatchPanelProps) {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(
    unmatchedStudents[0]?.id ?? null
  );
  const [loadingBuddyId, setLoadingBuddyId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const remaining = unmatchedStudents.filter(s => !assigned.has(s.id));

  async function assign(buddyId: string, studentId: string) {
    setLoadingBuddyId(buddyId);
    try {
      const res = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (res.ok) {
        setAssigned(prev => new Set([...prev, studentId]));
        // Auto-select next unmatched student
        const nextStudent = unmatchedStudents.find(
          s => !assigned.has(s.id) && s.id !== studentId
        );
        setSelectedStudent(nextStudent?.id ?? null);
      }
    } finally {
      setLoadingBuddyId(null);
    }
  }

  if (unmatchedStudents.length === 0) return null;

  const activeStudent = remaining.find(s => s.id === selectedStudent) ?? remaining[0] ?? null;

  return (
    <div className="rounded-2xl bg-stone-900 p-5 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">
          Founder Console · Manual Match
        </p>
        <p className="text-sm text-stone-300 mt-1">
          You are the matching algorithm until ~100 students. Match on{' '}
          <strong className="text-white">journey, not brand.</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* LEFT — Unmatched students */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
              Unmatched Students
            </span>
            <span className="text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-bold">
              {remaining.length}
            </span>
          </div>
          <div className="space-y-2">
            {remaining.map(s => {
              const weak = weakestSection(s);
              const days = daysWaiting(s.created_at);
              const isSelected = s.id === (activeStudent?.id ?? null);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s.id)}
                  className={cn(
                    'w-full text-left rounded-xl p-3.5 border transition-all',
                    isSelected
                      ? 'bg-stone-700 border-orange-500'
                      : 'bg-stone-800 border-stone-700 hover:border-stone-500'
                  )}
                >
                  <div className="font-semibold text-white text-sm">{s.full_name}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {s.is_repeater ? 'Repeater' : 'First attempt'}
                    {s.starting_percentile != null && ` · ${s.starting_percentile}%ile start`}
                    {s.dream_colleges?.[0] && ` · target ${s.dream_colleges[0].replace('IIM ', 'IIM-')}`}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {weak && (
                      <span className="text-[10px] bg-rose-900/60 text-rose-300 rounded px-1.5 py-0.5 font-medium">
                        weak: {weak}
                      </span>
                    )}
                    {days > 0 && (
                      <span className="text-[10px] bg-stone-700 text-stone-400 rounded px-1.5 py-0.5">
                        waiting {days}d
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {remaining.length === 0 && (
              <p className="text-xs text-stone-500 text-center py-4">All students matched ✓</p>
            )}
          </div>
        </div>

        {/* RIGHT — Available buddies */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">
              Available Buddies
            </span>
            <span className="text-[10px] bg-teal-700 text-white rounded-full px-1.5 py-0.5 font-bold">
              {buddies.length}
            </span>
          </div>
          <div className="space-y-2">
            {buddies
              .sort((a, b) => a.studentCount - b.studentCount)
              .map(b => {
                const isLoading = loadingBuddyId === b.id;
                const nameParts = b.full_name.split(' ');
                const firstName = nameParts[0];
                const lastInitial = nameParts[1]?.[0] ? `${nameParts[1][0]}.` : '';
                return (
                  <div key={b.id} className="rounded-xl bg-stone-800 border border-stone-700 p-3.5">
                    <div className="font-semibold text-white text-sm">
                      {firstName} {lastInitial}
                    </div>
                    <div className="text-[11px] text-teal-400 font-bold mt-0.5">
                      {b.starting_percentile != null
                        ? `${b.starting_percentile} → ${b.cat_percentile ?? '?'}%ile`
                        : b.cat_percentile != null
                        ? `${b.cat_percentile}%ile`
                        : 'IIM alumni'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {b.is_repeater && (
                        <span className="text-[10px] bg-stone-700 text-stone-300 rounded px-1.5 py-0.5">
                          was_repeater ✓
                        </span>
                      )}
                      {b.is_working_professional && (
                        <span className="text-[10px] bg-stone-700 text-stone-300 rounded px-1.5 py-0.5">
                          worked full-time
                        </span>
                      )}
                      <span className="text-[10px] bg-stone-700 text-stone-400 rounded px-1.5 py-0.5">
                        {b.studentCount} student{b.studentCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {activeStudent && (
                      <button
                        onClick={() => assign(b.id, activeStudent.id)}
                        disabled={isLoading || !activeStudent}
                        className={cn(
                          'mt-3 w-full py-2 rounded-lg text-sm font-bold transition-all active:scale-[0.98]',
                          isLoading
                            ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
                            : 'bg-orange-600 text-white hover:bg-orange-500'
                        )}
                      >
                        {isLoading
                          ? 'Assigning…'
                          : `Assign → ${activeStudent.full_name.split(' ')[0]}`}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
