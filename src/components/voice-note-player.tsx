'use client';

import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Mic, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNotePlayerProps {
  /** Storage path or legacy public URL — unused when feedbackId is provided */
  audioUrl?: string;
  buddyName: string;
  createdAt: string;
  className?: string;
  /** IIM college label, e.g. "Ahmedabad" */
  buddyCollege?: string | null;
  /** buddy_feedback row id — used to fetch a signed URL and for read receipts + thanks */
  feedbackId?: string;
  /** Show the NEW badge until first play */
  isNew?: boolean;
  /** Already thanked? */
  thanked?: boolean;
  /** Student listening to a buddy note → can send the ❤️ Thanks */
  canThank?: boolean;
}

export function VoiceNotePlayer({
  audioUrl,
  buddyName,
  createdAt,
  className,
  buddyCollege,
  feedbackId,
  isNew = false,
  thanked = false,
  canThank = false,
}: VoiceNotePlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Fetch a fresh signed URL whenever the feedbackId changes.
  useEffect(() => {
    if (!feedbackId) return;
    fetch('/api/voice-notes/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.url) setSignedUrl(d.url); })
      .catch(() => {});
  }, [feedbackId]);

  const srcUrl = feedbackId ? signedUrl : (audioUrl ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5>(1);
  const [showNew, setShowNew] = useState(isNew);
  const [played, setPlayed] = useState(false);
  const [hasThanked, setHasThanked] = useState(thanked);
  const [thanksVisible, setThanksVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const markRead = () => {
    if (!feedbackId || played) return;
    setPlayed(true);
    setShowNew(false);
    fetch('/api/voice-notes/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId }),
    }).catch(() => {});
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !srcUrl) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.playbackRate = speed;
      el.play();
      setIsPlaying(true);
      markRead();
    }
  };

  const toggleSpeed = () => {
    const next = speed === 1 ? 1.5 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const sendThanks = () => {
    if (!feedbackId || hasThanked) return;
    setHasThanked(true);
    fetch('/api/voice-notes/thanks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId }),
    }).catch(() => {});
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(duration, ratio * duration));
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    // eslint-disable-next-line react-hooks/purity
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (feedbackId && !signedUrl) {
    // Still fetching the signed URL — show a compact loading state.
    return (
      <div className={cn('rounded-xl border border-stone-200 bg-white px-3 py-2.5 flex items-center gap-2', className)}>
        <div className="w-11 h-11 rounded-full bg-stone-200 animate-pulse flex-shrink-0" />
        <div className="flex-1 h-2 bg-stone-200 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-stone-200 bg-white px-3 py-2.5', className)}>
      <audio
        ref={audioRef}
        src={srcUrl ?? undefined}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => {
          setIsPlaying(false);
          if (canThank && !hasThanked) setThanksVisible(true);
        }}
        preload="metadata"
      />

      {/* Row 1: identity + badges */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#2A9D8F] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {buddyName ? buddyName.charAt(0).toUpperCase() : <Mic className="w-3 h-3" />}
          </div>
          <span className="text-xs font-medium text-stone-800 truncate">
            {buddyName}
            {buddyCollege ? ` · IIM ${buddyCollege}` : ''} · {getTimeAgo(createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {showNew && (
            <span
              className="text-[9px] font-bold tracking-wider text-white px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#E8652D' }}
            >
              NEW
            </span>
          )}
          <span className="text-xs text-stone-500 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Row 2: play + scrubber + speed */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: '#E8652D' }}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div
          className="flex-1 h-2 bg-stone-200 rounded-full cursor-pointer py-0"
          onClick={handleSeek}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${progress}%`, backgroundColor: '#E8652D' }}
          />
        </div>
        <span className="text-[11px] text-stone-500 tabular-nums flex-shrink-0">
          {formatTime(currentTime)}
        </span>
        <button
          onClick={toggleSpeed}
          aria-label="Playback speed"
          className={cn(
            'text-[11px] font-bold px-1.5 py-1 rounded-md border transition-colors flex-shrink-0',
            speed === 1.5
              ? 'border-[#2A9D8F] text-[#2A9D8F] bg-[#2A9D8F]/10'
              : 'border-stone-200 text-stone-500'
          )}
        >
          {speed}x
        </button>
      </div>

      {/* Row 3: thanks reaction after listening */}
      {canThank && (thanksVisible || hasThanked) && (
        <button
          onClick={sendThanks}
          disabled={hasThanked}
          className={cn(
            'mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
            hasThanked
              ? 'bg-rose-50 text-rose-500 cursor-default'
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-[0.98]'
          )}
          style={{ minHeight: 40 }}
        >
          <Heart className={cn('w-3.5 h-3.5', hasThanked && 'fill-current')} />
          {hasThanked ? `${buddyName.split(' ')[0]} will see your ❤️` : 'Thanks'}
        </button>
      )}
    </div>
  );
}
