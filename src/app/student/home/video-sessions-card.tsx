'use client';

import { useState, useEffect } from 'react';
import { Video, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import type { VideoSession } from '@/types';

interface VideoSessionsCardProps {
  userId: string;
}

export function VideoSessionsCard({ userId }: VideoSessionsCardProps) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('video_sessions')
        .select('*')
        .eq('student_id', userId)
        .order('scheduled_at', { ascending: true })
        .limit(3);

      if (!error && data) {
        setSessions(data as VideoSession[]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (sessions.length === 0) return null;

  const upcomingSessions = sessions.filter(
    (s) => new Date(s.scheduled_at) > new Date()
  );

  if (upcomingSessions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Video className="w-4 h-4 text-teal-700" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
          Upcoming Sessions
        </h3>
      </div>

      <div className="space-y-2">
        {upcomingSessions.map((session) => (
          <Card
            key={session.id}
            className="p-3 bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200"
          >
            <div className="space-y-2">
              {/* Date & Time */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Calendar className="w-3 h-3 text-teal-600 flex-shrink-0" />
                  <span className="text-xs text-stone-600 truncate">
                    {new Date(session.scheduled_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Clock className="w-3 h-3 text-teal-600" />
                  <span className="text-xs text-stone-600">
                    {new Date(session.scheduled_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Meet Link Button */}
              {session.gmeet_link && (
                <a
                  href={session.gmeet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Video className="w-3 h-3" />
                  Join Meeting
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Notes */}
              {session.notes && (
                <p className="text-xs text-stone-700 bg-white/50 rounded p-1.5">
                  {session.notes}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
