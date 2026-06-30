'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SchedulableStudent {
  id: string;
  full_name: string;
  free_onboarding_used?: boolean;
  daysSinceLastMock?: number;
}

interface ScheduleSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: SchedulableStudent[];
  /** No longer used for gating — sessions need no Google connection. Kept optional for callers. */
  calendarConnected?: boolean;
  onScheduled?: () => void;
  /** Preselect a student (e.g. opened from a student card) */
  defaultStudentId?: string;
}

const DURATIONS = [20, 30, 45, 60];
type SessionType = 'guidance' | 'onboarding';

function todayIST(): string {
  // YYYY-MM-DD in IST for the date input min
  return new Date(Date.now() + 5.5 * 60 * 60_000).toISOString().slice(0, 10);
}

export function ScheduleSessionModal({
  isOpen,
  onClose,
  students,
  onScheduled,
  defaultStudentId,
}: ScheduleSessionModalProps) {
  const [studentId, setStudentId] = useState(defaultStudentId ?? '');
  const [date, setDate] = useState(todayIST());
  const [time, setTime] = useState('19:00');
  const [duration, setDuration] = useState(30);
  const [sessionType, setSessionType] = useState<SessionType>('guidance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setMeetLink(null);
      setCopied(false);
      if (defaultStudentId) setStudentId(defaultStudentId);
      else if (students.length === 1) setStudentId(students[0].id);
      setSessionType('guidance');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setError(null);
    if (!studentId) {
      setError('Pick a student first.');
      return;
    }
    // The chosen wall-clock time is IST. IST = UTC+5:30.
    const utcMs = new Date(`${date}T${time}:00Z`).getTime() - 5.5 * 60 * 60_000;
    if (isNaN(utcMs)) {
      setError('Pick a valid date and time.');
      return;
    }
    if (utcMs < Date.now() + 60_000) {
      setError('Pick a time in the future (IST).');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/calendar/schedule-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          startTime: new Date(utcMs).toISOString(),
          durationMinutes: duration,
          sessionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create the session — try again.");
        return;
      }
      setMeetLink(data.meetLink);
      onScheduled?.();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!meetLink) return;
    navigator.clipboard.writeText(meetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-50 pointer-events-none">
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom-6 duration-300"
          style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <h2 className="text-base font-bold text-stone-900">
              {meetLink
                ? sessionType === 'onboarding' ? 'Orientation booked!' : 'Session booked!'
                : sessionType === 'onboarding' ? 'Schedule Free Orientation' : 'Schedule Session'}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-2 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5">
            {meetLink ? (
              /* ── Success state ───────────────────────────── */
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#2A9D8F] flex-shrink-0" />
                  <span className="text-sm font-mono text-stone-800 truncate flex-1 text-left">
                    {meetLink.replace('https://', '')}
                  </span>
                  <button
                    onClick={copyLink}
                    aria-label="Copy Meet link"
                    className="p-2 rounded-lg hover:bg-stone-200 transition-colors flex-shrink-0"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-stone-500" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-stone-500">
                  Your student gets this join link in their app — share it anywhere too 🔗
                </p>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl text-white font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#2A9D8F', minHeight: 48 }}
                >
                  Done
                </button>
              </div>
            ) : (
              /* ── Form ────────────────────────────────────── */
              <div className="space-y-4">
                {/* Session type toggle */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Session type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'guidance', label: '📚 Guidance', sub: 'Paid mentoring session' },
                      { value: 'onboarding', label: '🎯 Orientation', sub: 'Free — shows how it works' },
                    ] as const).map(({ value, label, sub }) => {
                      const selectedStudent = students.find((s) => s.id === studentId);
                      const orientationUsed = value === 'onboarding' && selectedStudent?.free_onboarding_used;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!!orientationUsed}
                          onClick={() => !orientationUsed && setSessionType(value)}
                          className={cn(
                            'text-left px-3 py-2.5 rounded-xl border text-xs transition-colors',
                            sessionType === value
                              ? 'border-[#2A9D8F] bg-[#2A9D8F]/10 text-[#2A9D8F]'
                              : orientationUsed
                              ? 'border-stone-100 bg-stone-50 text-stone-300 cursor-not-allowed'
                              : 'border-stone-200 text-stone-600 hover:border-stone-300'
                          )}
                        >
                          <div className="font-semibold">{label}</div>
                          <div className="text-[10px] mt-0.5 opacity-70">
                            {orientationUsed ? 'Already done' : sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {sessionType === 'onboarding' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                      Orientation = how CareerRai works. Not a strategy/guidance session. Free for the student.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Student
                  </label>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                  >
                    <option value="">Choose a student…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Debrief nudge: student had a recent mock that hasn't been debriefed */}
                {(() => {
                  const sel = students.find((s) => s.id === studentId);
                  return sel?.daysSinceLastMock !== undefined &&
                    sel.daysSinceLastMock >= 2 &&
                    sel.daysSinceLastMock <= 21 ? (
                    <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                      <span className="font-semibold">Mock debrief pending:</span>{' '}
                      {sel.full_name.split(' ')[0]} had a mock {sel.daysSinceLastMock}d ago — consider
                      including a debrief in this session.
                    </div>
                  ) : null;
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      min={todayIST()}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                      Time (IST)
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Duration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={cn(
                          'py-2.5 rounded-xl text-sm border transition-colors',
                          duration === d
                            ? 'border-[#2A9D8F] bg-[#2A9D8F]/10 text-[#2A9D8F] font-semibold'
                            : 'border-stone-200 text-stone-600 hover:border-stone-300 font-medium'
                        )}
                        style={{ minHeight: 44 }}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    {error}
                  </p>
                )}

                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className={cn(
                    'w-full py-3.5 rounded-xl text-white font-semibold transition-all',
                    loading ? 'opacity-70 cursor-wait' : 'hover:opacity-90 active:scale-[0.99]'
                  )}
                  style={{ backgroundColor: sessionType === 'onboarding' ? '#E8652D' : '#2A9D8F', minHeight: 48 }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Creating your Meet link…
                    </span>
                  ) : sessionType === 'onboarding' ? (
                    'Book Free Orientation'
                  ) : (
                    'Create Meeting'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
