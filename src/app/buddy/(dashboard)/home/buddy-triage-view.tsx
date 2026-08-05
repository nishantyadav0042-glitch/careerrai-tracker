'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { loadBuddyStudents, getSeverityColor, getSeverityEmoji } from '@/lib/urgency-score';
import { StudentUrgencyData } from '@/lib/urgency-score';
import { MessageSquare, Video, ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduleSessionModal } from '@/components/schedule-session-modal';

interface BuddyTriageViewProps {
  buddyId: string;
}

export function BuddyTriageView({ buddyId }: BuddyTriageViewProps) {
  const router = useRouter();
  const supabase = createClient();
  const [students, setStudents] = useState<StudentUrgencyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<StudentUrgencyData | null>(null);

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, { data: profile }] = await Promise.all([
        loadBuddyStudents(buddyId),
        supabase
          .from('profiles')
          .select('google_calendar_connected')
          .eq('id', buddyId)
          .single(),
      ]);
      setStudents(data);
      // profiles.google_calendar_connected is a legacy column nothing writes
      // any more — reading it meant this list ALWAYS said "not connected".
      // /api/google/me is the same readiness the booking API enforces with.
      try {
        const r = await fetch('/api/google/me');
        setCalendarConnected(r.ok ? (await r.json()).ready === true : false);
      } catch {
        setCalendarConnected(false);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setIsLoading(false);
    }
  }, [buddyId, supabase]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const filteredStudents = students.filter((s) => {
    if (filter === 'all') return true;
    return s.severity === filter;
  });

  const criticalCount = students.filter((s) => s.severity === 'critical').length;
  const warningCount = students.filter((s) => s.severity === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
          <p className="text-sm text-red-700 font-medium">Need attention</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="text-3xl font-bold text-amber-600">{warningCount}</div>
          <p className="text-sm text-amber-700 font-medium">Check in soon</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="text-3xl font-bold text-emerald-600">{students.length}</div>
          <p className="text-sm text-emerald-700 font-medium">Total students</p>
        </Card>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        {['all', 'critical', 'warning'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as typeof filter)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              filter === f
                ? 'bg-orange-600 text-white'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            )}
          >
            {f === 'all'
              ? 'All Students'
              : f === 'critical'
              ? '🚨 Critical'
              : '⚠️ Warning'}
          </button>
        ))}
      </div>

      {/* Student Cards */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-stone-600">Loading students…</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <Card className="p-12 text-center bg-stone-50">
          <p className="text-stone-600">No students in this category</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredStudents.map((student) => (
            <Card
              key={student.student_id}
              className={cn(
                'overflow-hidden border-2 transition-all hover:shadow-md bg-white',
                student.severity === 'critical'
                  ? 'border-red-400'
                  : student.severity === 'warning'
                  ? 'border-amber-400'
                  : 'border-emerald-400'
              )}
            >
              <div className="p-5 space-y-3">
                {/* Header */}
                <div
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => router.push(`/buddy/students/${student.student_id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{getSeverityEmoji(student.severity)}</span>
                      <h3 className="text-lg font-bold text-stone-900">
                        {student.student_name}
                      </h3>
                    </div>
                    <p className="text-sm text-stone-600">
                      CAT percentile:{' '}
                      <span className="font-semibold text-stone-900">
                        {student.cat_percentile?.toFixed(1) || 'N/A'}%
                      </span>
                    </p>
                  </div>

                  {/* Efficacy — percentile delta (north star primary metric) */}
                  <div className="text-right">
                    {student.percentileDelta !== null ? (
                      <>
                        <div className="flex items-center justify-end gap-1">
                          <div className={cn(
                            'text-3xl font-bold',
                            student.percentileDelta > 0 ? 'text-emerald-600' : student.percentileDelta < 0 ? 'text-red-600' : 'text-amber-600'
                          )}>
                            {student.percentileDelta > 0 ? '+' : ''}{student.percentileDelta}
                          </div>
                          {student.percentileDelta > 0 ? (
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                          ) : student.percentileDelta < 0 ? (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          ) : (
                            <Minus className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                        <p className="text-xs text-stone-500">%ile delta</p>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-stone-400">—</div>
                        <p className="text-xs text-stone-400">no baseline</p>
                      </>
                    )}
                    <p className="text-[10px] text-stone-400 mt-0.5">urgency {student.score}</p>
                  </div>
                </div>

                {/* Flat-percentile flag */}
                {student.isFlat && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <span>⚠️</span>
                    <span className="font-medium">Flat — 14+ days logged, no percentile progress</span>
                  </div>
                )}

                {/* Reasons */}
                {student.reasons.length > 0 && (
                  <div className="space-y-1">
                    {student.reasons.slice(0, 2).map((reason, i) => (
                      <p key={i} className="text-sm text-stone-700 flex items-start gap-2">
                        <span className="text-amber-500 mt-1">•</span>
                        <span>{reason}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Status Row */}
                <div className="flex gap-4 text-xs pt-2 border-t border-stone-200">
                  <div>
                    <span className="text-stone-600">Streak:</span>
                    <span
                      className={cn(
                        'ml-1 font-semibold',
                        student.streakStatus === 'active'
                          ? 'text-orange-600'
                          : 'text-red-600'
                      )}
                    >
                      {student.streakStatus === 'active'
                        ? `${student.streakDays} days 🔥`
                        : 'Broken'}
                    </span>
                  </div>

                  {student.recentDrops > 0 && (
                    <div className="flex items-center gap-1 text-red-600 font-semibold">
                      <TrendingDown className="w-3 h-3" />
                      {student.recentDrops} drop{student.recentDrops !== 1 ? 's' : ''}
                    </div>
                  )}

                  {student.daysSinceLastMock !== null && (
                    <div>
                      <span className="text-stone-600">Last mock:</span>
                      <span className={cn('ml-1 font-semibold', student.daysSinceLastMock > 21 ? 'text-red-600' : 'text-stone-900')}>
                        {student.daysSinceLastMock}d ago
                      </span>
                    </div>
                  )}

                  <div className="ml-auto">
                    <span className="text-stone-600">Last feedback:</span>
                    <span className="ml-1 font-semibold text-stone-900">
                      {student.daysSinceFeedback > 60
                        ? '∞ days'
                        : `${student.daysSinceFeedback}d`}
                      ago
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {/* Was "Voice note" until voice notes were removed (5 Aug).
                      The action a mentor wanted here is "reach this student
                      now", and chat is the surviving way to do that — it also
                      takes attachments, which a voice note never could. */}
                  <button
                    onClick={() => router.push(`/buddy/chat/${student.student_id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Message
                  </button>

                  <button
                    onClick={() => setScheduleFor(student)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    <Video className="w-4 h-4" />
                    Session
                  </button>

                  <button
                    onClick={() => router.push(`/buddy/students/${student.student_id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-all text-sm font-medium"
                    style={{ minHeight: 44 }}
                  >
                    View
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}


      {/* Schedule modal for the picked student */}
      {scheduleFor && (
        <ScheduleSessionModal
          isOpen={!!scheduleFor}
          onClose={() => setScheduleFor(null)}
          students={[{ id: scheduleFor.student_id, full_name: scheduleFor.student_name, free_onboarding_used: scheduleFor.free_onboarding_used, daysSinceLastMock: scheduleFor.daysSinceLastMock ?? undefined }]}
          defaultStudentId={scheduleFor.student_id}
          calendarConnected={calendarConnected}
        />
      )}
    </div>
  );
}
