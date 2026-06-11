'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Volume2, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { BuddyFeedback } from '@/types';

interface StudentAudioResponse extends BuddyFeedback {
  student_name?: string;
}

interface BuddyAudioResponsesCompactProps {
  buddyId: string;
}

export function BuddyAudioResponsesCompact({
  buddyId,
}: BuddyAudioResponsesCompactProps) {
  const supabase = createClient();
  const [responses, setResponses] = useState<StudentAudioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchResponses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`
          id,
          student_id,
          voice_note_url,
          feedback_text,
          created_at,
          feedback_type,
          profiles!buddy_feedback_student_id_fkey(full_name)
        `)
        .eq('buddy_id', buddyId)
        .eq('feedback_type', 'student_response')
        .not('voice_note_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        const formatted = data.map((item) => {
          const profileArr = item.profiles as Array<{ full_name?: string }> | { full_name?: string } | null;
          const fullName = Array.isArray(profileArr)
            ? profileArr[0]?.full_name
            : profileArr?.full_name;
          return { ...item, student_name: fullName || 'Student' };
        });
        setResponses(formatted as unknown as StudentAudioResponse[]);
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, buddyId]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  if (loading) return null;
  if (responses.length === 0) return null;

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <div className="flex items-center gap-1.5 sm:gap-2 px-0.5 sm:px-1">
        <Volume2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-700 flex-shrink-0" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600 truncate flex-1">
          📝 Student Responses
        </h3>
        {responses.length > 0 && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            {responses.length}
          </span>
        )}
      </div>

      <div className="space-y-1 sm:space-y-1.5 max-h-60 sm:max-h-80 overflow-y-auto">
        {responses.map((response) => (
          <div key={response.id} className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
            <button
              onClick={() =>
                setExpandedId(expandedId === response.id ? null : response.id)
              }
              className="w-full flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                <span className="text-xs font-medium text-stone-700 truncate">
                  {response.student_name?.split(' ')[0] || 'Student'}
                </span>
                <span className="text-xs text-stone-500 flex-shrink-0 whitespace-nowrap">
                  {new Date(response.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
              <ChevronRight
                className={`w-3 sm:w-3.5 h-3 sm:h-3.5 text-stone-500 flex-shrink-0 transition-transform ${
                  expandedId === response.id ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Expanded Content */}
            {expandedId === response.id && (
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-t border-blue-200 bg-white space-y-1.5 sm:space-y-2">
                {/* Audio Player - Compact */}
                {response.voice_note_url && (
                  <audio
                    controls
                    className="w-full h-6 rounded text-xs"
                    src={response.voice_note_url}
                  />
                )}

                {/* Text if any */}
                {response.feedback_text && (
                  <p className="text-xs text-stone-700 bg-blue-50 rounded p-1.5 sm:p-2 line-clamp-3">
                    {response.feedback_text}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
