'use client';

import { useState, useEffect } from 'react';
import { Video, Copy, CheckCircle, Clock } from 'lucide-react';
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
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Video className="w-4 h-4 text-teal-700" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
          Your Video Sessions
        </h3>
      </div>

      <div className="space-y-2">
        {sessions.map((session) => (
          <Card key={session.id} className={`p-3 border ${getStatusColor(session.session_status)}`}>
            <div className="space-y-2">
              {/* Status & Time */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-stone-500" />
                  <span className="text-xs text-stone-600">
                    {session.scheduled_at
                      ? new Date(session.scheduled_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'No date set'}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  session.session_status === 'scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : session.session_status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-stone-100 text-stone-800'
                }`}>
                  {session.session_status.charAt(0).toUpperCase() + session.session_status.slice(1)}
                </span>
              </div>

              {/* Meeting Link */}
              {session.gmeet_link && (
                <div className="flex items-center gap-2 bg-white/50 rounded-lg p-2">
                  <a
                    href={session.gmeet_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs text-blue-600 hover:underline truncate"
                  >
                    📞 Join Meeting
                  </a>
                  <button
                    onClick={() => copyMeetLink(session.gmeet_link || '', session.id)}
                    className="p-1 hover:bg-stone-200 rounded transition-colors"
                    title="Copy link"
                  >
                    {copiedId === session.id ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-stone-500" />
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
