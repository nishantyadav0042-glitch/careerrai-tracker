'use client';

import { useState } from 'react';
import { Video, Calendar, Clock, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  shouldScheduleVideoSession,
  daysSinceLastSession,
  SESSION_TOPICS,
  SESSION_DURATIONS,
  formatSessionTime,
} from '@/lib/meeting-utils';
import { cn } from '@/lib/utils';

interface VideoSessionPromptProps {
  studentId: string;
  studentName: string;
  buddyId: string;
  buddyName: string;
  lastSessionDate: Date | null;
  isOpen?: boolean;
}

export function VideoSessionPrompt({
  studentId,
  studentName,
  buddyId,
  buddyName,
  lastSessionDate,
  isOpen = true,
}: VideoSessionPromptProps) {
  const [showForm, setShowForm] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [error, setError] = useState('');

  const [sessionType, setSessionType] = useState('session');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('14:00');

  const daysSince = daysSinceLastSession(lastSessionDate);
  const shouldSchedule = shouldScheduleVideoSession(lastSessionDate);

  if (!isOpen || !shouldSchedule) {
    return null;
  }

  const handleSchedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      setError('Please select date and time');
      return;
    }

    setScheduling(true);
    setError('');

    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);

      const res = await fetch('/api/video-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          buddy_id: buddyId,
          scheduled_at: scheduledAt.toISOString(),
          session_type: sessionType,
          duration_minutes: duration,
          notes,
        }),
      });

      if (!res.ok) throw new Error('Failed to schedule session');

      const { session } = await res.json();
      setScheduled(true);
      setShowForm(false);

      // Reset form
      setTimeout(() => {
        setScheduled(false);
        setSessionType('session');
        setDuration(30);
        setNotes('');
        setScheduledDate('');
        setScheduledTime('14:00');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule');
    } finally {
      setScheduling(false);
    }
  };

  if (scheduled) {
    return (
      <Card className="p-4 bg-green-50 border-green-200 mb-4">
        <div className="flex items-center gap-2 text-green-700">
          <Video className="w-5 h-5" />
          <span className="font-medium">Session scheduled! Google Meet link sent to {studentName}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(
      'p-4 mb-4 border-2',
      daysSince >= 15 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
    )}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            daysSince >= 15 ? 'bg-red-100' : 'bg-orange-100'
          )}>
            <Video className={cn(
              'w-5 h-5',
              daysSince >= 15 ? 'text-red-600' : 'text-orange-600'
            )} />
          </div>
          <div className="flex-1">
            <h3 className={cn(
              'font-semibold mb-1',
              daysSince >= 15 ? 'text-red-900' : 'text-orange-900'
            )}>
              {daysSince >= 15 ? 'Schedule a Video Session' : 'Time for a Check-in'}
            </h3>
            <p className={cn(
              'text-sm',
              daysSince >= 15 ? 'text-red-800' : 'text-orange-800'
            )}>
              {daysSince === 0
                ? `It's time for your first video session with ${buddyName}`
                : `It's been ${daysSince} days since your last session`}
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        {daysSince > 0 && (
          <div className="flex gap-2 text-xs">
            <div className="flex items-center gap-1 text-stone-600">
              <Calendar className="w-3 h-3" />
              Last: {new Date(lastSessionDate!).toLocaleDateString('en-IN')}
            </div>
            <div className={cn(
              'flex items-center gap-1 font-semibold',
              daysSince >= 15 ? 'text-red-700' : 'text-orange-700'
            )}>
              <AlertCircle className="w-3 h-3" />
              {daysSince} days ago
            </div>
          </div>
        )}

        {/* Form or CTA */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className={cn(
              'w-full py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm',
              daysSince >= 15
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            )}
          >
            <Video className="w-4 h-4" />
            Schedule Session
          </button>
        ) : (
          <div className="space-y-3 pt-2 border-t border-current border-opacity-20">
            {/* Session Type */}
            <div>
              <label className="block text-xs font-medium mb-2 text-stone-700">
                Session Type
              </label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-orange-500"
              >
                {SESSION_TOPICS.map((topic) => (
                  <option key={topic} value={topic.toLowerCase().replace(/\s+/g, '_')}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-medium mb-2 text-stone-700">
                Duration
              </label>
              <div className="flex gap-2">
                {SESSION_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      'flex-1 py-1.5 text-xs rounded-lg border transition-colors',
                      duration === d.value
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'border-stone-300 text-stone-700 hover:border-orange-500'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium mb-2 text-stone-700">
                Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Time */}
            <div>
              <label className="block text-xs font-medium mb-2 text-stone-700">
                Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium mb-2 text-stone-700">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Focus on Geometry doubts"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={scheduling}
                className="flex-1 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium"
              >
                {scheduling ? 'Scheduling...' : 'Send Invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
