'use client';

import { useState, useEffect } from 'react';
import { Calendar, Video, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { VideoSession } from '@/types';

interface UpcomingSessionCardProps {
  buddyId: string;
}

/**
 * Shows the buddy's next session within the coming 24 hours.
 * Renders nothing when there's no upcoming session.
 */
export function UpcomingSessionCard({ buddyId }: UpcomingSessionCardProps) {
  const supabase = createClient();
  const [session, setSession] = useState<VideoSession | null>(null);
  const [studentName, setStudentName] = useState<string>('');

  useEffect(() => {
    const fetchUpcoming = async () => {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('video_sessions')
        .select('*')
        .eq('buddy_id', buddyId)
        .eq('session_status', 'scheduled')
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', in24h.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error || !data) return;
      setSession(data as VideoSession);

      const { data: student } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.student_id)
        .single();

      if (student?.full_name) setStudentName(student.full_name);
    };

    fetchUpcoming();
  }, [buddyId]);

  if (!session?.scheduled_at) return null;

  const when = new Date(session.scheduled_at);
  const isToday = when.toDateString() === new Date().toDateString();
  const dayLabel = isToday ? 'Today' : 'Tomorrow';
  const timeLabel = when.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const meetLink = session.google_meet_link || session.gmeet_link;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 border-2 border-[#2A9D8F] shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-4 h-4 text-[#2A9D8F] flex-shrink-0" />
        <span className="font-semibold text-sm sm:text-base text-stone-900">
          {dayLabel} at {timeLabel}
        </span>
      </div>

      <p className="text-sm text-stone-600 mb-3">
        Session with {studentName || 'your student'}
        {session.title ? ` — ${session.title}` : ''}
      </p>

      <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
        {meetLink ? (
          <a
            href={meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2A9D8F] text-white text-sm font-medium rounded-lg hover:bg-[#22867b] transition-colors"
          >
            <Video className="w-4 h-4" />
            Join Google Meet
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-xs text-stone-500">
            Meet link unavailable — contact support
          </span>
        )}
        <Link
          href="/buddy/schedule"
          className="inline-flex items-center px-4 py-2 text-sm text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}
