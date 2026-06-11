'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Calendar, MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduleSessionModal, type SchedulableStudent } from './schedule-session-modal';

interface Meeting {
  id: string;
  title: string | null;
  scheduledAt: string;
  durationMinutes: number;
  meetLink: string | null;
  counterpartName: string;
  counterpartCollege: string | null;
}

interface MeetingWidgetProps {
  role: 'buddy' | 'student';
  /** Buddy only: students they can schedule with */
  students?: SchedulableStudent[];
  /** Buddy only: whether Google Calendar is connected */
  calendarConnected?: boolean;
}

const LIVE_WINDOW_MS = 15 * 60_000;

function formatIST(date: Date): string {
  const now = new Date();
  const istDay = (d: Date) =>
    d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);

  const time = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (istDay(date) === istDay(now)) return `Today, ${time}`;
  if (istDay(date) === istDay(tomorrow)) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MeetingWidget({ role, students = [], calendarConnected = false }: MeetingWidgetProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/upcoming-meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings ?? []);
      }
    } catch {
      // keep whatever we had
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const meeting = meetings[0] ?? null;
  const startMs = meeting ? new Date(meeting.scheduledAt).getTime() : 0;
  const endMs = meeting ? startMs + meeting.durationMinutes * 60_000 : 0;
  const isLiveWindow = !!meeting && now >= startMs - LIVE_WINDOW_MS && now < endMs;
  const isLiveNow = !!meeting && now >= startMs && now < endMs;

  // Tick every second only inside (or approaching) the live window
  useEffect(() => {
    if (!meeting) return;
    const interval = setInterval(
      () => setNow(Date.now()),
      isLiveWindow ? 1000 : 30_000
    );
    return () => clearInterval(interval);
  }, [meeting, isLiveWindow]);

  // Refresh list when a meeting ends
  useEffect(() => {
    if (meeting && now >= endMs) fetchMeetings();
  }, [now, endMs, meeting, fetchMeetings]);

  // Close kebab on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleCancel = async () => {
    if (!meeting) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/calendar/cancel-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      }
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
      setMenuOpen(false);
    }
  };

  if (!loaded) return null;

  const firstName = meeting?.counterpartName.split(' ')[0] ?? '';
  const initials = firstName ? firstName[0].toUpperCase() : '?';

  // ── State 1: no upcoming meeting ──────────────────────────────
  if (!meeting) {
    return (
      <>
        <div
          className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-opacity duration-200"
          style={{ backgroundColor: '#1A1A2E' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Video className="w-4 h-4 text-stone-400 flex-shrink-0" />
            <span className="text-sm text-stone-300 truncate">
              {role === 'buddy'
                ? 'No sessions scheduled'
                : 'No session booked yet — your buddy will schedule one'}
            </span>
          </div>
          {role === 'buddy' && (
            <button
              onClick={() => setShowModal(true)}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: '#2A9D8F', minHeight: 44 }}
            >
              Schedule Session
            </button>
          )}
        </div>
        {role === 'buddy' && (
          <ScheduleSessionModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            students={students}
            calendarConnected={calendarConnected}
            onScheduled={fetchMeetings}
          />
        )}
      </>
    );
  }

  // ── States 2 & 3: upcoming / live ─────────────────────────────
  return (
    <>
      <div
        className={cn(
          'w-full rounded-2xl p-4 transition-all duration-300',
          isLiveWindow && 'ring-2 ring-[#2A9D8F] shadow-[0_0_24px_rgba(42,157,143,0.45)]'
        )}
        style={{ backgroundColor: '#1A1A2E' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ backgroundColor: isLiveWindow ? '#2A9D8F' : '#E8652D' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {role === 'student'
                  ? `Session with ${firstName}${meeting.counterpartCollege ? ` (IIM ${meeting.counterpartCollege})` : ''}`
                  : `Session with ${meeting.counterpartName}`}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatIST(new Date(meeting.scheduledAt))} IST
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-stone-300 font-medium">
                  {meeting.durationMinutes} min
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {isLiveWindow && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#2A9D8F]/20 text-[#2A9D8F] text-[10px] font-bold tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-ping" />
                {isLiveNow ? 'LIVE NOW' : 'LIVE SOON'}
              </span>
            )}
            {role === 'buddy' && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Session options"
                  className="p-2.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-xl border border-stone-200 py-1 min-w-[160px]">
                    {confirmCancel ? (
                      <div className="px-3 py-2">
                        <p className="text-xs text-stone-600 mb-2">Cancel this session?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancel}
                            disabled={cancelling}
                            className="flex-1 px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                          </button>
                          <button
                            onClick={() => setConfirmCancel(false)}
                            className="px-2 py-1.5 rounded-lg text-stone-600 text-xs hover:bg-stone-100"
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancel(true)}
                        className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel session
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Join area */}
        <div className="mt-3">
          {isLiveWindow ? (
            <div className="space-y-2">
              {!isLiveNow && (
                <p className="text-center text-xs text-stone-300 tabular-nums">
                  Starts in {formatCountdown(startMs - now)}
                </p>
              )}
              {meeting.meetLink ? (
                <a
                  href={meeting.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: '#E8652D', minHeight: 48 }}
                >
                  <Video className="w-5 h-5" />
                  Join Meeting
                </a>
              ) : (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base opacity-60 cursor-not-allowed"
                  style={{ backgroundColor: '#E8652D', minHeight: 48 }}
                >
                  <Video className="w-5 h-5" />
                  Meet link pending...
                </button>
              )}
            </div>
          ) : (
            meeting.meetLink ? (
              <a
                href={meeting.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-white/20 text-stone-300 hover:bg-white/5 transition-colors"
                style={{ minHeight: 44 }}
              >
                <Video className="w-4 h-4" />
                Join
              </a>
            ) : (
              <div className="text-center text-xs text-stone-400 py-2.5">
                Meet link will appear when live
              </div>
            )
          )}
        </div>

        {role === 'buddy' && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-200 py-2 transition-colors"
          >
            + Schedule another session
          </button>
        )}
      </div>

      {role === 'buddy' && (
        <ScheduleSessionModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          students={students}
          calendarConnected={calendarConnected}
          onScheduled={fetchMeetings}
        />
      )}
    </>
  );
}
