'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Volume2, Plus } from 'lucide-react';

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
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    fetchVoiceNotes();
  }, []);

  const fetchVoiceNotes = async () => {
    try {
      // Fetch student's voice responses from buddy_feedback table
      const { data, error } = await supabase
        .from('buddy_feedback')
        .select(`
          id,
          voice_note_url,
          feedback_text,
          created_at
        `)
        .eq('student_id', studentId)
        .eq('feedback_type', 'student_response')
        .not('voice_note_url', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const voiceNotes = data?.map((note) => ({
        id: note.id,
        voice_note_url: note.voice_note_url,
        transcript: note.feedback_text,
        created_at: note.created_at,
      })) || [];

      setVoiceNotes(voiceNotes);
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
    <div className="space-y-2.5 sm:space-y-3">
      {/* Header */}
      <div className="px-0.5 sm:px-1">
        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
          <Mic className="w-4 sm:w-5 h-4 sm:h-5 text-orange-600 flex-shrink-0" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-stone-700 truncate">
            Your Voice Notes
          </h2>
        </div>
        <p className="text-xs text-stone-600 mt-0.5 sm:mt-1">Record your doubts and insights</p>
      </div>

      {/* Voice Notes List - Compact */}
      {loading ? null : voiceNotes.length === 0 ? null : (
        <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
          {voiceNotes.slice(0, 3).map((note) => (
            <div key={note.id} className="bg-white border border-orange-200 rounded-lg p-2 sm:p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs text-stone-600 flex-shrink-0">{getTimeAgo(note.created_at)}</span>
                {note.transcript && (
                  <p className="text-xs text-stone-700 truncate flex-1">{note.transcript}</p>
                )}
              </div>

              {/* Compact Audio Player */}
              {note.voice_note_url && (
                <audio
                  key={`audio-${note.id}`}
                  controls
                  className="w-full h-6 rounded text-xs"
                  src={note.voice_note_url}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Record New Button - Compact */}
      <button
        onClick={onRecordNew}
        className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg sm:rounded-xl font-medium transition-colors text-xs sm:text-sm"
      >
        <Plus className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
        Record note
      </button>
    </div>
  );
}
