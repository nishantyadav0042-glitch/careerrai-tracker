'use client';

import { useState, useEffect } from 'react';
import { Video, Copy, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import type { VideoSession } from '@/types';

interface BuddyVideoSessionsDashboardProps {
  buddyId: string;
  buddyName: string;
}

export function BuddyVideoSessionsDashboard({
  buddyId,
  buddyName,
}: BuddyVideoSessionsDashboardProps) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('video_sessions')
        .select('*')
        .eq('buddy_id', buddyId)
        .order('scheduled_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setSessions(data as VideoSession[]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyMeetLink = (link: string, sessionId: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(sessionId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-50 border-blue-200';
      case 'active':
        return 'bg-green-50 border-green-200';
      case 'completed':
        return 'bg-stone-50 border-stone-200';
      default:
        return 'bg-white border-stone-200';
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-stone-500">Loading sessions...</div>;
  }

  if (sessions.length === 0) {
    return null; // Don't show if no sessions
  }

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="flex items-center gap-2 px-0.5 sm:px-1">
        <Video className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-teal-700 flex-shrink-0" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600 truncate">
          Video Sessions
        </h3>
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        {sessions.map((session) => (
          <Card key={session.id} className={`p-2.5 sm:p-3 border ${getStatusColor(session.session_status)}`}>
            <div className="space-y-1.5 sm:space-y-2">
              {/* Status & Time */}
              <div className="flex items-center justify-between gap-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Clock className="w-3 h-3 text-stone-500 flex-shrink-0" />
                  <span className="text-xs text-stone-600 truncate">
                    {session.scheduled_at
                      ? new Date(session.scheduled_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : 'No date'}
                  </span>
                  <span className="text-xs text-stone-500">
                    {session.scheduled_at
                      ? new Date(session.scheduled_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 whitespace-nowrap ${
                  session.session_status === 'scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : session.session_status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-stone-100 text-stone-800'
                }`}>
                  {session.session_status === 'scheduled' ? 'Scheduled' : session.session_status === 'active' ? 'Active' : 'Done'}
                </span>
              </div>

              {/* Title */}
              {(session as any).title && (
                <p className="font-semibold text-xs sm:text-sm text-stone-900 truncate">
                  {(session as any).title}
                </p>
              )}

              {/* Google Meet Link */}
              {((session as any).google_meet_link || session.gmeet_link) && (
                <div className="space-y-1.5">
                  {/* Join Meeting Button */}
                  <a
                    href={(session as any).google_meet_link || session.gmeet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Join Meeting
                  </a>

                  {/* Copy Link Option */}
                  <button
                    onClick={() => copyMeetLink((session as any).google_meet_link || session.gmeet_link || '', session.id)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-white/80 hover:bg-white text-xs text-stone-700 rounded-lg border border-stone-200 transition-colors"
                    title="Copy meeting link"
                  >
                    {copiedId === session.id ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-600" />
                        <span>Link Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-stone-500" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Session Details */}
              {session.notes && (
                <p className="text-xs text-stone-700 bg-white/30 rounded p-1.5">
                  📝 {session.notes}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
