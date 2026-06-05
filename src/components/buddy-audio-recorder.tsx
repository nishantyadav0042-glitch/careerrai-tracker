'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Square, Play, Pause, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuddyAudioRecorderProps {
  buddyId: string;
  onUploadComplete?: (url: string) => void;
}

export function BuddyAudioRecorder({
  buddyId,
  onUploadComplete
}: BuddyAudioRecorderProps) {
  const supabase = createClient();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_DURATION = 45; // seconds

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      chunksRef.current = [];

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setRecordingTime(0);
        setUploadError(null);

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
    } catch (error) {
      setUploadError('Microphone access denied. Please enable microphone permissions.');
      console.error('Error accessing microphone:', error);
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

  const uploadAudio = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileName = `buddy-intros/${buddyId}-${Date.now()}.webm`;

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('buddy-intros')
        .upload(fileName, audioBlob, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicData } = supabase.storage
        .from('buddy-intros')
        .getPublicUrl(data.path);

      // Update profile with audio URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ intro_audio_url: publicData.publicUrl })
        .eq('id', buddyId);

      if (updateError) throw updateError;

      // Clear audio and notify parent
      setAudioBlob(null);
      setRecordingTime(0);
      onUploadComplete?.(publicData.publicUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(message);
      console.error('Error uploading audio:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const timeDisplay = `${Math.floor(recordingTime / 60)}:${String(
    recordingTime % 60
  ).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{uploadError}</p>
        </div>
      )}

      {/* Recording Section */}
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-stone-700 mb-4">
            Record a 30-45 second intro about yourself
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

          {/* Recording Limit Warning */}
          {isRecording && recordingTime >= 40 && (
            <p className="text-sm text-amber-600 font-medium mt-4">
              ⚠️ Recording will stop at 45 seconds
            </p>
          )}
        </div>
      </div>

      {/* Playback Section */}
      {audioBlob && (
        <div className="space-y-4 p-5 bg-stone-50 rounded-xl border border-stone-200">
          <p className="text-sm font-semibold text-stone-700">
            Preview Your Recording
          </p>

          <audio
            ref={audioRef}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

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

          {/* Upload Button */}
          <button
            onClick={uploadAudio}
            disabled={isUploading}
            className={cn(
              'w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
              isUploading
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            )}
          >
            {isUploading ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-emerald-400 border-t-emerald-600 rounded-full" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Save Intro Audio
              </>
            )}
          </button>

          <p className="text-xs text-stone-600 text-center">
            This will be played to students when they meet you
          </p>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> Introduce yourself as an IIM alumni, share your CAT
          experience, and what you love about mentoring students.
        </p>
      </div>
    </div>
  );
}
