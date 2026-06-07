'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Square, Play, Pause, Trash2, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNoteRecorderProps {
  studentId: string;
  buddyId: string;
  studentName: string;
  onSendComplete?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const MAX_DURATION = 90; // seconds

export function VoiceNoteRecorder({
  studentId,
  buddyId,
  studentName,
  onSendComplete,
  isOpen,
  onClose
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

  useEffect(() => {
    if (!isOpen) {
      // Reset when closing
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (audioRef.current) audioRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  const startRecording = async () => {
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

        // Stop the stream
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

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(data.path);

      // Create feedback record with voice note URL
      const today = new Date().toISOString().split('T')[0];
      const { error: feedbackError } = await supabase
        .from('buddy_feedback')
        .insert({
          student_id: studentId,
          buddy_id: buddyId,
          voice_note_url: publicData.publicUrl,
          feedback_type: 'voice_note',
          feedback_date: today,
          feedback_text: 'Voice message',
          rating: 3,
          period_covered: 'adhoc'
        });

      if (feedbackError) throw feedbackError;

      // Success - reset and close
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

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-200 p-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">
              Voice Feedback for {studentName}
            </h2>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Recording Section */}
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-stone-700 mb-4">
                  Record a voice message (max 90 seconds)
                </p>

                {/* Timer Display */}
                <div
                  className={cn(
                    'text-5xl font-mono font-bold mb-6 transition-colors',
                    isRecording
                      ? 'text-red-600 animate-pulse'
                      : recordingTime > 0
                      ? 'text-stone-900'
                      : 'text-stone-400'
                  )}
                >
                  {timeDisplay}
                </div>

                {/* Recording Controls */}
                <div className="flex justify-center gap-3">
                  {!isRecording && !audioBlob ? (
                    <button
                      onClick={startRecording}
                      className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg"
                    >
                      <Mic className="w-5 h-5" />
                      Start Recording
                    </button>
                  ) : isRecording ? (
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-8 py-4 bg-stone-600 text-white rounded-xl font-semibold hover:bg-stone-700 transition-all"
                    >
                      <Square className="w-5 h-5" />
                      Stop Recording
                    </button>
                  ) : null}
                </div>

                {/* Warning */}
                {isRecording && recordingTime >= 75 && (
                  <p className="text-sm text-amber-600 font-medium mt-4">
                    ⚠️ Recording will stop at 90 seconds
                  </p>
                )}
              </div>
            </div>

            {/* Playback Section */}
            {audioBlob && (
              <div className="space-y-4 p-5 bg-stone-50 rounded-xl border border-stone-200">
                <p className="text-sm font-semibold text-stone-700">
                  Preview Your Message
                </p>

                <audio
                  ref={audioRef}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {/* Waveform Visualization */}
                <div className="flex items-center justify-center gap-1 py-4 px-4 bg-white rounded-lg border border-stone-200">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-orange-400 to-orange-600 rounded-full"
                      style={{
                        height: `${Math.random() * 30 + 10}px`,
                        opacity: isPlaying ? 1 : 0.5,
                        transition: isPlaying ? 'none' : 'opacity 0.3s'
                      }}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={playAudio}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Play
                      </>
                    )}
                  </button>

                  <button
                    onClick={deleteRecording}
                    className="px-4 py-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all font-medium"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                💡 <strong>Tip:</strong> Be personal, encouraging, and specific. Reference
                their recent performance or streak to make it more meaningful.
              </p>
            </div>
          </div>

          {/* Send Button */}
          <div className="sticky bottom-0 bg-gradient-to-t from-white to-white/80 border-t border-stone-200 p-6">
            <button
              onClick={sendVoiceNote}
              disabled={!audioBlob || isSending}
              className={cn(
                'w-full py-4 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-lg',
                audioBlob && !isSending
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              )}
            >
              {isSending ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Voice Note
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
