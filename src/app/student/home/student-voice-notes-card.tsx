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
    <div className="space-y-4">
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center gap-2 mb-1">
          <Mic className="w-5 h-5 text-orange-600" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700">
            Your Voice Notes
          </h2>
        </div>
        <p className="text-xs text-stone-600 mt-1">Record your doubts and learning notes</p>
      </div>

      {/* Voice Notes List */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">Loading notes...</div>
      ) : voiceNotes.length === 0 ? (
        <div className="bg-white border-2 border-orange-200 rounded-xl p-6 text-center">
          <Mic className="w-8 h-8 text-orange-300 mx-auto mb-2" />
          <p className="text-stone-600 text-sm font-medium">Start recording your voice notes</p>
          <p className="text-stone-500 text-xs mt-1">Share your doubts and key insights with your buddy</p>
        </div>
      ) : (
        voiceNotes.map((note) => (
          <div key={note.id} className="bg-white border-2 border-orange-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-stone-600">{getTimeAgo(note.created_at)}</span>
            </div>
            {note.transcript && (
              <p className="text-sm text-stone-800 mb-3">{note.transcript}</p>
            )}

            {/* Audio Player */}
            {note.voice_note_url && (
              <audio
                key={`audio-${note.id}`}
                controls
                className="w-full mb-3 h-8"
                src={note.voice_note_url}
              />
            )}

            <button
              onClick={() => setPlayingId(playingId === note.id ? null : note.id)}
              className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium text-sm"
            >
              <Volume2 className="w-4 h-4" />
              {playingId === note.id ? 'Stop' : 'Play'} recording
            </button>
          </div>
        ))
      )}

      {/* Record New Button */}
      <button
        onClick={onRecordNew}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors text-sm"
      >
        <Plus className="w-4 h-4" />
        <Mic className="w-4 h-4" />
        Record new note
      </button>
    </div>
  );
}
