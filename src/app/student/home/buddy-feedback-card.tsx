'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageSquare } from 'lucide-react';

interface BuddyFeedback {
  id: string;
  feedback_text: string | null;
  created_at: string;
  buddy_id: string;
  buddy_name: string;
  buddy_college?: string;
  read_at: string | null;
  thanked_at: string | null;
}

// Raw row shape returned by the server (Supabase join result)
type RawFeedbackRow = {
  id: string;
  feedback_text: string | null;
  created_at: string;
  buddy_id: string;
  read_at: string | null;
  thanked_at: string | null;
  profiles: { full_name?: string; college?: string } | null;
};

function formatRows(rows: RawFeedbackRow[]): BuddyFeedback[] {
  return rows.map((f) => ({
    id: f.id,
    feedback_text: f.feedback_text,
    created_at: f.created_at,
    buddy_id: f.buddy_id,
    buddy_name: f.profiles?.full_name || 'Buddy',
    buddy_college: f.profiles?.college,
    read_at: f.read_at,
    thanked_at: f.thanked_at,
  }));
}

interface BuddyFeedbackCardProps {
  studentId: string;
  buddyId: string;
  buddyName: string;
  /** Pre-fetched on the server — avoids a client-side loading flash on first paint */
  initialFeedbacks?: RawFeedbackRow[];
}

export function BuddyFeedbackCard({ studentId, buddyId, buddyName, initialFeedbacks }: BuddyFeedbackCardProps) {
  const supabase = createClient();
  const [feedbacks, setFeedbacks] = useState<BuddyFeedback[]>(() =>
    initialFeedbacks ? formatRows(initialFeedbacks) : []
  );
  // If initial data was supplied by the server, skip the loading state entirely.
  const [loading, setLoading] = useState(!initialFeedbacks);

  const fetchFeedbacks = useCallback(async () => {
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
          created_at,
          buddy_id,
          read_at,
          thanked_at,
          profiles!buddy_feedback_buddy_id_fkey(full_name, college)
        `)
        .eq('student_id', studentId)
        .eq('buddy_id', buddyId)
        .in('feedback_type', ['buddy_note', 'text'])
        .neq('buddy_id', studentId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      setFeedbacks(formatRows((data ?? []) as RawFeedbackRow[]));
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoading(false);
    }
  }, [buddyId, studentId, supabase]);

  // Only run on mount if no initial data was provided by the server.
  useEffect(() => {
    if (!initialFeedbacks) {
      fetchFeedbacks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <MessageSquare className="w-4 h-4 text-teal-700" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">
            Buddy Feedback
          </h2>
        </div>
        <p className="text-xs text-stone-600 mt-1">Messages and guidance from {buddyName}</p>
      </div>

      {/* Feedback Items */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">Loading feedback…</div>
      ) : feedbacks.length === 0 ? (
        <div className="bg-white border-2 border-stone-200 rounded-xl p-6 text-center">
          <MessageSquare className="w-5 h-5 text-stone-300 mx-auto mb-2" />
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

          </div>
        ))
      )}


    </div>
  );
}
