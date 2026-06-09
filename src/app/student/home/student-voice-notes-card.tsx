'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Plus } from 'lucide-react';

interface VoiceNote {
  id: string;
  voice_note_url: string;
  transcript?: string;
  created_at: string;
}

interface StudentVoiceNotesCardProps {
  studentId: string;
  buddyId: string;
  onRecordNew?: () => void;
}

export function StudentVoiceNotesCard({ studentId, buddyId, onRecordNew }: StudentVoiceNotesCardProps) {
  const supabase = createClient();
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVoiceNotes();
  }, []);

  const fetchVoiceNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`id, voice_note_url, feedback_text, created_at`)
        .eq('student_id', studentId)
        .eq('feedback_type', 'student_response')
        .not('voice_note_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      setVoiceNotes(data || []);
    } catch (error) {
      console.error('Error fetching voice notes:', error);
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
    <div className="space-y-1.5">
      {/* Last Note Preview - ULTRA COMPACT */}
      {!loading && voiceNotes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-stone-600 font-medium">Last note:</span>
            <span className="text-xs text-stone-500">{getTimeAgo(voiceNotes[0].created_at)}</span>
          </div>
          {voiceNotes[0].voice_note_url && (
            <audio controls className="w-full h-5 rounded text-xs" src={voiceNotes[0].voice_note_url} />
          )}
        </div>
      )}

      {/* Record Button - Single Line */}
      <button
        onClick={onRecordNew}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors text-xs"
      >
        <Plus className="w-3 h-3" />
        Record Note
      </button>
    </div>
  );
}
