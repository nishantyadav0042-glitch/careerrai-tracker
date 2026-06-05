'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { loadBuddyStudents, getSeverityColor, getSeverityEmoji } from '@/lib/urgency-score';
import { StudentUrgencyData } from '@/lib/urgency-score';
import { MessageSquare, Phone, Send, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuddyTriageViewProps {
  buddyId: string;
}

export function BuddyTriageView({ buddyId }: BuddyTriageViewProps) {
  const [students, setStudents] = useState<StudentUrgencyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setIsLoading(true);
    try {
      const data = await loadBuddyStudents(buddyId);
      setStudents(data);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setIsLoading(false);
    }
  }

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
          <p className="text-sm text-red-700 font-medium">Need Attention</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="text-3xl font-bold text-amber-600">{warningCount}</div>
          <p className="text-sm text-amber-700 font-medium">Check In Soon</p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="text-3xl font-bold text-emerald-600">{students.length}</div>
          <p className="text-sm text-emerald-700 font-medium">Total Students</p>
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
          <p className="text-stone-600">Loading students...</p>
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
                'overflow-hidden border-2 transition-all hover:shadow-lg cursor-pointer',
                student.severity === 'critical'
                  ? 'border-red-300 bg-red-50/50'
                  : student.severity === 'warning'
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-emerald-300 bg-emerald-50/50'
              )}
            >
              <div className={cn('h-1 bg-gradient-to-r', getSeverityColor(student.severity))} />

              <div className="p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{getSeverityEmoji(student.severity)}</span>
                      <h3 className="text-lg font-bold text-stone-900">
                        {student.student_name}
                      </h3>
                    </div>
                    <p className="text-sm text-stone-600">
                      CAT Percentile:{' '}
                      <span className="font-semibold text-stone-900">
                        {student.cat_percentile?.toFixed(1) || 'N/A'}%
                      </span>
                    </p>
                  </div>

                  {/* Urgency Score */}
                  <div className="text-right">
                    <div
                      className={cn(
                        'text-3xl font-bold',
                        student.severity === 'critical'
                          ? 'text-red-600'
                          : student.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      )}
                    >
                      {student.score}
                    </div>
                    <p className="text-xs text-stone-500">urgency</p>
                  </div>
                </div>

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
                  {/* Streak */}
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

                  {/* Mock Drops */}
                  {student.recentDrops > 0 && (
                    <div className="flex items-center gap-1 text-red-600 font-semibold">
                      <TrendingDown className="w-3 h-3" />
                      {student.recentDrops} drop{student.recentDrops !== 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Feedback Gap */}
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
                  <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all text-sm font-medium">
                    <MessageSquare className="w-4 h-4" />
                    Message
                  </button>

                  <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-sm font-medium">
                    <Send className="w-4 h-4" />
                    Feedback
                  </button>

                  <button className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all text-sm font-medium">
                    <Phone className="w-4 h-4" />
                    Call
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
