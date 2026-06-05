'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Play, Pause, Volume2 } from 'lucide-react';

interface ScreenMeetBuddyProps {
  onNext: (data?: any) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface BuddyInfo {
  full_name: string;
  college: string | null;
  cat_percentile: number | null;
  intro_audio_url: string | null;
  buddy_bio: string | null;
}

export default function ScreenMeetBuddy({ onNext, onBack, canGoBack, isLoading }: ScreenMeetBuddyProps) {
  const supabase = createClient();
  const [buddy, setBuddy] = useState<BuddyInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [hasPlayedEnough, setHasPlayedEnough] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function loadBuddy() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id')
          .eq('id', user.id)
          .single();

        if (!profile?.buddy_id) {
          // Generic IIM Alumni card if no buddy assigned
          setBuddy({
            full_name: 'IIM Alumni Buddy',
            college: 'IIM Network',
            cat_percentile: null,
            intro_audio_url: null,
            buddy_bio: 'Your dedicated IIM alumni buddy is ready to guide your CAT journey'
          });
          setAudioLoaded(true);
          setHasPlayedEnough(true);
          return;
        }

        const { data: buddyData } = await supabase
          .from('profiles')
          .select('full_name, college, cat_percentile, intro_audio_url, buddy_bio')
          .eq('id', profile.buddy_id)
          .single();

        if (buddyData) {
          setBuddy(buddyData as BuddyInfo);
          if (!buddyData.intro_audio_url) {
            setAudioLoaded(true);
            setHasPlayedEnough(true);
          }
        }
      } catch (error) {
        console.error('Error loading buddy:', error);
        setAudioLoaded(true);
        setHasPlayedEnough(true);
      }
    }

    loadBuddy();
  }, [supabase]);

  const handlePlayClick = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current && audioRef.current.currentTime >= 10 && !hasPlayedEnough) {
      setHasPlayedEnough(true);
    }
  };

  const handleAudioEnd = () => {
    setIsPlaying(false);
    setHasPlayedEnough(true);
  };

  if (!buddy) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Loading buddy profile...</p>
        </div>
      </div>
    );
  }

  const initials = buddy.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Meet Your Buddy</p>
        <p className="text-xs text-stone-500 mt-1">"Your buddy is ready" to guide your CAT prep</p>
      </div>

      {/* Buddy Card */}
      <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100">
        {/* Avatar & Name */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3">
            {initials}
          </div>
          <h3 className="text-xl font-bold text-stone-900">{buddy.full_name}</h3>

          {/* Badges */}
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {buddy.college && (
              <div className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                {buddy.college}
              </div>
            )}
            {buddy.cat_percentile && (
              <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                {buddy.cat_percentile.toFixed(1)}%ile CAT
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-orange-100 my-4" />

        {/* Audio Player or Bio */}
        {buddy.intro_audio_url ? (
          <div className="space-y-3">
            <audio
              ref={audioRef}
              src={buddy.intro_audio_url}
              onTimeUpdate={handleAudioTimeUpdate}
              onEnded={handleAudioEnd}
            />

            {/* Play Button */}
            <button
              onClick={handlePlayClick}
              type="button"
              className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-6 h-6" />
                  <span className="font-medium">Listening...</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 ml-1" />
                  <span className="font-medium">Play Introduction</span>
                </>
              )}
            </button>

            {/* Waveform Placeholder */}
            {isPlaying && (
              <div className="flex items-center justify-center gap-1 py-2">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-orange-400 rounded-full animate-pulse"
                    style={{
                      height: `${Math.random() * 20 + 4}px`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            )}

            {/* Progress Text */}
            <p className="text-xs text-stone-500 text-center">
              {hasPlayedEnough ? '✓ Audio heard. Ready to continue.' : 'Listen for at least 10 seconds to continue'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Volume2 className="w-6 h-6 text-stone-400 mx-auto" />
            {buddy.buddy_bio && (
              <p className="text-sm text-stone-700 text-center italic">&quot;{buddy.buddy_bio}&quot;</p>
            )}
            <p className="text-xs text-stone-500 text-center">Audio message coming soon</p>
          </div>
        )}
      </div>

      {/* Info Text */}
      <p className="text-xs text-stone-500 text-center">
        Your buddy is an IIM alumni who scored in the{' '}
        {buddy.cat_percentile ? `${buddy.cat_percentile.toFixed(0)}%ile` : 'top percentiles'} on CAT. They'll review
        your progress every week and give you personalized guidance.
      </p>

      {/* Next Button Info */}
      {hasPlayedEnough && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 text-center font-medium">
          ✓ Ready to continue
        </div>
      )}
    </div>
  );
}
