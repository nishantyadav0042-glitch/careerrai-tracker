'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Play, Pause, Trash2, Send, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNoteRecorderProps {
  studentId: string;
  buddyId: string;
  studentName: string;
  onSendComplete?: () => void;
  isOpen: boolean;
  onClose: () => void;
  feedbackType?: 'buddy_feedback' | 'student_response';
}

const MAX_DURATION = 90; // seconds

export function VoiceNoteRecorder({
  studentId,
  buddyId,
  studentName,
  onSendComplete,
  isOpen,
  onClose,
  feedbackType = 'buddy_feedback'
}: VoiceNoteRecorderProps) {
  const supabase = createClient();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (audioRef.current) audioRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  const startRecording = async () => {
    if (isRecording || audioBlob) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      chunksRef.current = [];

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setRecordingTime(0);

        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => {
            if (prev >= MAX_DURATION) {
              stopRecording();
              return prev;
            }
            return prev + 1;
          });
        }, 1000);
      };

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (err) {
      setError('Microphone access denied. Please enable microphone permissions.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Please choose an audio file.');
      return;
    }
    setError(null);
    setAudioBlob(file);
    e.target.value = '';
  };

  const playAudio = () => {
    if (!audioRef.current || !audioBlob) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const url = URL.createObjectURL(audioBlob);
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const deleteRecording = () => {
    setAudioBlob(null);
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setRecordingTime(0);
  };

  const sendVoiceNote = async () => {
    if (!audioBlob) return;

    setIsSending(true);
    setError(null);

    try {
      const fileName = `voice-notes/${buddyId}-${studentId}-${Date.now()}.webm`;

      const { data, error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(data.path);

      const today = new Date().toISOString().split('T')[0];
      const { error: feedbackError } = await supabase
        .from('buddy_feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          voice_note_url: publicData.publicUrl,
          feedback_type: feedbackType,
          feedback_date: today,
          feedback_text: 'Voice message',
          rating: 3,
          period_covered: 'adhoc'
        });

      if (feedbackError) throw feedbackError;

      setAudioBlob(null);
      setRecordingTime(0);
      onSendComplete?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send voice note';
      setError(message);
      console.error('Error sending voice note:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const timeDisplay = `${Math.floor(recordingTime / 60)}:${String(
    recordingTime % 60
  ).padStart(2, '0')}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Bottom Sheet — compact */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white rounded-t-2xl shadow-2xl">
          {/* Header */}
          <div className="border-b border-stone-100 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 truncate">
              Voice note for {studentName}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <audio
              ref={audioRef}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {!audioBlob ? (
              /* Single compact row: hold-to-record + attach */
              <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                {isRecording ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                    <span className="text-sm font-mono text-stone-900 tabular-nums">
                      {timeDisplay}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-stone-600">Hold to record</span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onPointerDown={startRecording}
                    onPointerUp={stopRecording}
                    onPointerLeave={stopRecording}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium select-none touch-none transition-colors',
                      isRecording
                        ? 'bg-red-600 text-white'
                        : 'bg-[#2A9D8F] text-white hover:bg-[#22867b]'
                    )}
                  >
                    <Mic className="w-4 h-4" />
                    Hold
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach audio file"
                    className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileAttach}
                    className="hidden"
                  />
                </div>
              </div>
            ) : (
              /* Compact preview row: play + send/discard */
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5">
                <button
                  onClick={playAudio}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-8 h-8 rounded-full bg-[#2A9D8F] hover:bg-[#22867b] text-white flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <span className="flex-1 text-xs text-stone-600">
                  {recordingTime > 0 ? `${timeDisplay} recorded` : 'Attached audio'}
                </span>
                <button
                  onClick={deleteRecording}
                  aria-label="Discard"
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={sendVoiceNote}
                  disabled={isSending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isSending
                      ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      : 'bg-[#2A9D8F] text-white hover:bg-[#22867b]'
                  )}
                >
                  {isSending ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
