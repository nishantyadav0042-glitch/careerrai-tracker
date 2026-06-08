'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare, Mic, Volume2 } from 'lucide-react';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';

interface BuddyFeedback {
  id: string;
  feedback_text: string | null;
  voice_note_url: string | null;
  created_at: string;
  buddy_id: string;
  buddy_name: string;
  buddy_college?: string;
}

interface BuddyFeedbackCardProps {
  studentId: string;
  buddyId: string;
  buddyName: string;
}

export function BuddyFeedbackCard({ studentId, buddyId, buddyName }: BuddyFeedbackCardProps) {
  const supabase = createClient();
  const [feedbacks, setFeedbacks] = useState<BuddyFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecorder, setShowRecorder] = useState(false);

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    try {
      // Don't fetch if buddy is not set or is the student themselves
      if (!buddyId || buddyId === studentId) {
        setFeedbacks([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`
          id,
          feedback_text,
          voice_note_url,
          created_at,
          buddy_id,
          profiles!buddy_feedback_buddy_id_fkey(full_name, college)
        `)
        .eq('student_id', studentId)
        .eq('buddy_id', buddyId)
        .in('feedback_type', ['buddy_feedback', 'text'])
        .neq('buddy_id', studentId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      const formattedData = data?.map((f) => ({
        id: f.id,
        feedback_text: f.feedback_text,
        voice_note_url: f.voice_note_url,
        created_at: f.created_at,
        buddy_id: f.buddy_id,
        buddy_name: (f.profiles as any)?.full_name || 'Buddy',
        buddy_college: (f.profiles as any)?.college,
      })) || [];

      setFeedbacks(formattedData);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-teal-700" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">
            Buddy Feedback
          </h2>
        </div>
        <p className="text-xs text-stone-600 mt-1">Messages and guidance from {buddyName}</p>
      </div>

      {/* Feedback Items */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">Loading feedback...</div>
      ) : feedbacks.length === 0 ? (
        <div className="bg-white border-2 border-stone-200 rounded-xl p-6 text-center">
          <MessageSquare className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-600 text-sm">No feedback yet</p>
          <p className="text-stone-500 text-xs mt-1">Your buddy will share insights here</p>
        </div>
      ) : (
        feedbacks.map((feedback) => (
          <div key={feedback.id} className="bg-white border-2 border-stone-200 rounded-xl p-4 space-y-3">
            {/* Buddy Info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-stone-900 text-sm">{feedback.buddy_name}</p>
                {feedback.buddy_college && (
                  <p className="text-xs text-stone-600">{feedback.buddy_college}</p>
                )}
              </div>
              <span className="text-xs text-stone-500">{getTimeAgo(feedback.created_at)}</span>
            </div>

            {/* Text Feedback */}
            {feedback.feedback_text && (
              <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
                <p className="text-sm text-stone-800 leading-relaxed">{feedback.feedback_text}</p>
              </div>
            )}

            {/* Audio Feedback */}
            {feedback.voice_note_url && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-teal-700 font-medium">
                  <Volume2 className="w-4 h-4" />
                  <span>Voice message from {feedback.buddy_name}</span>
                </div>
                <VoiceNotePlayer
                  audioUrl={feedback.voice_note_url}
                  buddyName={feedback.buddy_name}
                  createdAt={feedback.created_at}
                />
              </div>
            )}
          </div>
        ))
      )}

      {/* Record Response Button */}
      <button
        onClick={() => setShowRecorder(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors text-sm"
      >
        <Mic className="w-4 h-4" />
        Record voice response
      </button>

      {/* Voice Recorder Modal */}
      {showRecorder && (
        <VoiceNoteRecorder
          studentId={studentId}
          buddyId={buddyId}
          studentName={buddyName}
          isOpen={showRecorder}
          onClose={() => setShowRecorder(false)}
          onSendComplete={() => {
            setShowRecorder(false);
            fetchFeedbacks();
          }}
          feedbackType="student_response"
        />
      )}
    </div>
  );
}
