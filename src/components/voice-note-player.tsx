'use client';

import { useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceNotePlayerProps {
  audioUrl: string;
  buddyName: string;
  createdAt: string;
  className?: string;
}

export function VoiceNotePlayer({
  audioUrl,
  buddyName,
  createdAt,
  className
}: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
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
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-white px-3 py-2 max-h-[72px]',
        className
      )}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      {/* Row 1: identity + duration */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#2A9D8F] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
            {buddyName ? buddyName.charAt(0).toUpperCase() : <Mic className="w-3 h-3" />}
          </div>
          <span className="text-xs font-medium text-stone-800 truncate">
            {buddyName} · {getTimeAgo(createdAt)}
          </span>
        </div>
        <span className="text-xs text-stone-500 tabular-nums flex-shrink-0">
          {formatTime(duration)}
        </span>
      </div>

      {/* Row 2: play + progress */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-7 h-7 rounded-full bg-[#2A9D8F] hover:bg-[#22867b] text-white flex items-center justify-center flex-shrink-0 transition-colors"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        <div
          className="flex-1 h-1.5 bg-stone-200 rounded-full cursor-pointer"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-[#2A9D8F] rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-stone-500 tabular-nums flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
