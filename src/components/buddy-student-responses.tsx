'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Volume2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import type { BuddyFeedback } from '@/types';

interface StudentAudioResponse extends BuddyFeedback {
  student_name?: string;
}

interface BuddyStudentResponsesProps {
  buddyId: string;
}

export function BuddyStudentResponses({ buddyId }: BuddyStudentResponsesProps) {
  const supabase = createClient();
  const [responses, setResponses] = useState<StudentAudioResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, []);

  const fetchResponses = async () => {
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
        .limit(10);

      if (!error && data) {
        const formatted = data.map((item: any) => ({
          ...item,
          student_name: item.profiles?.full_name || 'Student',
        }));
        setResponses(formatted);
      }
    } catch (err) {
      console.error('Error fetching responses:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-stone-500 text-xs">Loading responses...</div>;
  }

  if (responses.length === 0) {
    return null; // Don't show if no responses
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Volume2 className="w-4 h-4 text-blue-700" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-600">
          📝 Student Voice Responses
        </h3>
      </div>

      <div className="space-y-2">
        {responses.map((response) => (
          <Card key={response.id} className="p-3 bg-blue-50 border-blue-200">
            <div className="space-y-2">
              {/* Student Name & Date */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-stone-700">
                  💬 {response.student_name}
                </span>
                <span className="text-xs text-stone-500">
                  {new Date(response.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Audio Player */}
              {response.voice_note_url && (
                <audio
                  controls
                  className="w-full h-7 rounded"
                  src={response.voice_note_url}
                />
              )}

              {/* Text if any */}
              {response.feedback_text && (
                <p className="text-xs text-stone-700 bg-white/50 rounded p-2">
                  {response.feedback_text}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
