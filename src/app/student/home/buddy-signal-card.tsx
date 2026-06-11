'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { MessageCircle, Volume2, Play, Pause, ChevronRight } from 'lucide-react';

interface BuddySignalCardProps {
  userId: string;
}

interface BuddyFeedback {
  id: string;
  feedback_text: string | null;
  voice_note_url: string | null;
  created_at: string;
  rating: number | null;
  feedback_type: string;
}

interface BuddyProfile {
  full_name: string;
  avatar_url?: string;
}

export function BuddySignalCard({ userId }: BuddySignalCardProps) {
  const supabase = createClient();
  const [feedback, setFeedback] = useState<BuddyFeedback | null>(null);
  const [buddy, setBuddy] = useState<BuddyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBuddySignal() {
      try {
        // Get latest feedback
        const { data: feedbackData } = await supabase
          .from('feedback')
          .select('*')
          .eq('student_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (feedbackData) {
          setFeedback(feedbackData as BuddyFeedback);

          // Get buddy info
          const { data: buddyData } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', feedbackData.buddy_id)
            .single();

          if (buddyData) {
            setBuddy(buddyData as BuddyProfile);
          }
        }
      } catch (error) {
        console.log('No buddy feedback yet');
      } finally {
        setIsLoading(false);
      }
    }

    loadBuddySignal();
  }, [supabase, userId]);

  if (isLoading) {
    return (
      <Card className="p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100">
        <div className="h-16 bg-teal-100 rounded-lg animate-pulse" />
      </Card>
    );
  }

  if (!feedback || !buddy) {
    return (
      <Card className="p-5 bg-gradient-to-br from-blue-50 to-white border-blue-100">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              🔔 Waiting for your buddy
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Keep logging your daily progress. Your buddy reviews the data every week and will send personalized guidance.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const buddyInitials = buddy.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // eslint-disable-next-line react-hooks/purity
  const daysAgo = Math.floor((Date.now() - new Date(feedback.created_at).getTime()) / (1000 * 60 * 60 * 24));

  const timeAgoText =
    daysAgo === 0
      ? 'Today'
      : daysAgo === 1
      ? 'Yesterday'
      : `${daysAgo} days ago`;

  return (
    <Card className="p-5 bg-gradient-to-br from-teal-50 to-white border-teal-100 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="space-y-3">
        {/* Header with buddy info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Buddy Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
              {buddyInitials}
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {buddy.full_name}
              </p>
              <p className="text-xs text-stone-500">{timeAgoText}</p>
            </div>
          </div>

          {feedback.voice_note_url && (
            <Volume2 className="w-4 h-4 text-teal-600" />
          )}
        </div>

        {/* Voice Note Player */}
        {feedback.voice_note_url ? (
          <VoiceNotePlayer
            audioUrl={feedback.voice_note_url}
            buddyName={buddy.full_name}
            createdAt={feedback.created_at}
          />
        ) : (
          /* Text Feedback Preview */
          <div className="space-y-2">
            {feedback.feedback_text && (
              <p className="text-sm text-stone-700 leading-relaxed">
                &quot;{feedback.feedback_text.substring(0, 100)}
                {feedback.feedback_text.length > 100 ? '...' : ''}&quot;
              </p>
            )}

            {feedback.rating && (
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className={i < feedback.rating! ? 'text-yellow-400' : 'text-stone-300'}
                  >
                    ★
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <button className="w-full flex items-center justify-between p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-700 text-xs font-medium">
          <span>View full feedback</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}
