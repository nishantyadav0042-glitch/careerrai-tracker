'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Play, Pause, Trash2, Send, X, Square } from 'lucide-react';
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
const WARN_AT = 75; // amber from 1:15
const BAR_COUNT = 28;

/**
 * Codec fallback chain — audio/mp4 is what iOS Safari supports;
 * webm-opus is the default everywhere else. '' lets the browser pick.
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''].find(
      (t) => t === '' || MediaRecorder.isTypeSupported(t)
    ) ?? ''
  );
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export function VoiceNoteRecorder({
  studentId,
  studentName,
  onSendComplete,
  isOpen,
  onClose,
  feedbackType = 'buddy_feedback',
}: VoiceNoteRecorderProps) {
  type Phase = 'idle' | 'recording' | 'review' | 'sending' | 'sent';
  const [phase, setPhase] = useState<Phase>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [nudge, setNudge] = useState<string | null>(null);

  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef('');
  const durationRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanupCapture = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // Full reset when the sheet closes
  useEffect(() => {
    if (!isOpen) {
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
      cleanupCapture();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      blobRef.current = null;
      setPhase('idle');
      setRecordingTime(0);
      setError(null);
      setNudge(null);
      setIsPlaying(false);
      setPlayTime(0);
    }
  }, [isOpen, cleanupCapture]);

  const startRecording = async () => {
    setError(null);
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      mimeRef.current = mimeType || 'audio/webm';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      // Real waveform from the live mic signal
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BAR_COUNT) || 1;
        const next: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const v = data[i * step] / 255;
          next.push(4 + Math.round(v * 28));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupCapture();
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        blobRef.current = blob;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setPhase('review');
        setIsPlaying(false);
        setPlayTime(0);
        setDuration(durationRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setPhase('recording');
      setRecordingTime(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          durationRef.current = next;
          if (next >= MAX_DURATION) {
            mediaRecorderRef.current?.state === 'recording' &&
              mediaRecorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      cleanupCapture();
      setMicDenied(true);
      console.error('Mic access error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const discard = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setPlayTime(0);
    blobRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhase('idle');
    setRecordingTime(0);
  };

  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el || !urlRef.current) return;
    if (isPlaying) {
      el.pause();
    } else {
      if (el.src !== urlRef.current) el.src = urlRef.current;
      el.play();
    }
  };

  const send = async () => {
    if (!blobRef.current) return;
    setPhase('sending');
    setError(null);
    try {
      const form = new FormData();
      const ext = mimeRef.current.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blobRef.current, `note.${ext}`);
      form.append('studentId', studentId);
      form.append('feedbackType', feedbackType);
      form.append('durationSeconds', String(durationRef.current));

      const res = await fetch('/api/voice-notes/send', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        // Recording stays in memory — user can retry
        setError(data.error || "Send failed — your note is safe, try again.");
        setPhase('review');
        return;
      }
      setNudge(data.streakNudge ?? null);
      setPhase('sent');
      onSendComplete?.();
      setTimeout(onClose, data.streakNudge ? 2600 : 1100);
    } catch {
      setError("No connection — your note is safe, try again.");
      setPhase('review');
    }
  };

  if (!isOpen) return null;

  const reviewProgress =
    duration > 0 ? Math.min(100, (playTime / duration) * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center pointer-events-none"
      >
        <div
          className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md pointer-events-auto animate-in slide-in-from-bottom-6 duration-300"
          style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* Header */}
          <div className="border-b border-stone-100 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 truncate">
              Voice note for {studentName}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 -m-1 text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <audio
              ref={audioRef}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setPlayTime(0);
              }}
              onTimeUpdate={(e) => setPlayTime(e.currentTarget.currentTime)}
            />

            {micDenied && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
                <strong>Allow microphone access</strong> — tap the lock icon in your
                address bar, enable Microphone, then try again.
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}

            {/* ── Idle ── */}
            {phase === 'idle' && (
              <button
                onClick={startRecording}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold transition-transform active:scale-[0.98]"
                style={{ backgroundColor: '#E8652D', minHeight: 56 }}
              >
                <Mic className="w-5 h-5" />
                Tap to record
              </button>
            )}

            {/* ── Recording: live waveform + timer ── */}
            {phase === 'recording' && (
              <div className="space-y-3">
                <div className="flex items-end justify-center gap-[3px] h-10">
                  {levels.map((h, i) => (
                    <span
                      key={i}
                      className="w-[5px] rounded-full transition-[height] duration-75"
                      style={{ height: h, backgroundColor: '#E8652D' }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span
                    className={cn(
                      'text-sm font-mono tabular-nums',
                      recordingTime >= WARN_AT ? 'text-amber-600 font-bold' : 'text-stone-900'
                    )}
                  >
                    {fmt(recordingTime)} / {fmt(MAX_DURATION)}
                  </span>
                </div>
                <button
                  onClick={stopRecording}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-stone-900 text-white font-semibold transition-transform active:scale-[0.98]"
                  style={{ minHeight: 52 }}
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </button>
              </div>
            )}

            {/* ── Review: playback + scrubber + send ── */}
            {(phase === 'review' || phase === 'sending') && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3">
                  <button
                    onClick={togglePlayback}
                    disabled={phase === 'sending'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#E8652D' }}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={duration || 1}
                      step={0.1}
                      value={playTime}
                      disabled={phase === 'sending'}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        if (audioRef.current) {
                          if (audioRef.current.src !== urlRef.current && urlRef.current) {
                            audioRef.current.src = urlRef.current;
                          }
                          audioRef.current.currentTime = t;
                        }
                        setPlayTime(t);
                      }}
                      className="w-full accent-[#E8652D] h-1.5"
                      aria-label="Scrub recording"
                    />
                    <div className="flex justify-between text-[11px] text-stone-500 tabular-nums">
                      <span>{fmt(playTime)}</span>
                      <span>{fmt(duration)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={discard}
                    disabled={phase === 'sending'}
                    className="flex items-center justify-center gap-1.5 px-4 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                    style={{ minHeight: 48 }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Re-record
                  </button>
                  <button
                    onClick={send}
                    disabled={phase === 'sending'}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl text-white font-semibold transition-transform active:scale-[0.98] disabled:opacity-80"
                    style={{ backgroundColor: '#2A9D8F', minHeight: 48 }}
                  >
                    {phase === 'sending' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Sent ── */}
            {phase === 'sent' && (
              <div className="py-4 text-center space-y-2 animate-in zoom-in duration-200">
                <p className="text-sm font-semibold text-emerald-700">
                  ✓ Sent to {studentName.split(' ')[0]}
                </p>
                {nudge && <p className="text-xs text-stone-600">{nudge}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
