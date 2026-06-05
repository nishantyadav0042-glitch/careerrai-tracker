'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Flame, Sparkles } from 'lucide-react';
import { updateStreakAfterLog, checkAndCreateMilestones } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';

interface ScreenLogDayOneProps {
  onNext: (data?: any) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const TOPICS = ['Quant', 'VARC', 'LRDI', 'Mock', 'Revision'];
const FEELING_OPTIONS = [
  { emoji: '🙏', label: 'Tough', value: 1 },
  { emoji: '💪', label: 'Solid', value: 2 },
  { emoji: '🙊', label: 'Easy', value: 3 }
];
const HOURS_OPTIONS = [0, 1, 2, 3, '4+'];

export default function ScreenLogDayOne({ onNext, onBack, canGoBack, isLoading }: ScreenLogDayOneProps) {
  const supabase = createClient();
  const [showConfetti, setShowConfetti] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [buddyId, setBuddyId] = useState<string | null>(null);

  const [hours, setHours] = useState<number | string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id')
          .eq('id', user.id)
          .single();
        if (profile?.buddy_id) {
          setBuddyId(profile.buddy_id);
        }
      }
    }
    loadUser();
  }, [supabase]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleSubmit = async () => {
    if (hours === null || selectedTopics.length === 0 || feeling === null) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!userId) return;

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const hoursValue = typeof hours === 'string' ? 4 : hours;

      // Map feeling to confidence/stress
      let confidence = 3;
      let stress = 3;
      if (feeling === 1) {
        // Tough
        confidence = 2;
        stress = 4;
      } else if (feeling === 2) {
        // Solid
        confidence = 4;
        stress = 2;
      } else if (feeling === 3) {
        // Easy
        confidence = 5;
        stress = 1;
      }

      // Create daily report
      const { error: reportError } = await supabase.from('daily_reports').insert({
        student_id: userId,
        report_date: todayString,
        study_duration: hoursValue,
        topics_covered: selectedTopics,
        confidence,
        stress,
        quality_focus: 3, // Default middle value
        mock_taken: false
      });

      if (reportError) throw reportError;

      // Update streak
      await updateStreakAfterLog(userId);

      // Check for milestones and notify buddy
      if (buddyId) {
        await checkAndCreateMilestones(userId, buddyId);
      }

      // Show confetti animation
      setShowConfetti(true);

      // Wait for animation then complete
      setTimeout(() => {
        onNext({ logSubmitted: true });
      }, 1500);
    } catch (error) {
      console.error('Error submitting log:', error);
      setIsSubmitting(false);
    }
  };

  const canSubmit = hours !== null && selectedTopics.length > 0 && feeling !== null;

  return (
    <div className="space-y-6 relative">
      {/* Confetti Container */}
      {showConfetti && <ConfettiContainer />}

      {/* Animated Flame */}
      <div className="flex justify-center">
        <Flame
          className={cn(
            'w-16 h-16 text-orange-600 transition-all',
            showConfetti ? 'scale-150 animate-pulse' : 'animate-bounce'
          )}
        />
      </div>

      {/* Subtitle */}
      <div className="text-center">
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Day 1. Streak starts now.</p>
        <p className="text-xs text-stone-500 mt-1">Log today's study session. Even 30 minutes counts.</p>
      </div>

      {/* Quick Log Card */}
      <div className="bg-white rounded-2xl p-6 border-2 border-orange-100 space-y-6">
        {/* Hours Studied */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">How many hours today?</label>
          <div className="grid grid-cols-5 gap-2">
            {HOURS_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHours(option);
                }}
                type="button"
                className={cn(
                  'py-3 rounded-lg font-medium transition-all text-sm',
                  hours === option
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Topics */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">Topics covered</label>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleTopic(topic);
                }}
                type="button"
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  selectedTopics.includes(topic)
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* How did it go? */}
        <div>
          <label className="text-sm font-semibold text-stone-900 block mb-3">How did it go?</label>
          <div className="flex gap-3 justify-around">
            {FEELING_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFeeling(option.value);
                }}
                type="button"
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-xl transition-all',
                  feeling === option.value
                    ? 'bg-orange-600 text-white'
                    : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                )}
              >
                <span className="text-2xl">{option.emoji}</span>
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Motivation */}
      <p className="text-xs text-stone-600 text-center italic">
        Your buddy sees every log. This consistency is what separates successful CAT aspirants from the rest.
      </p>

      {/* Submit Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
        disabled={!canSubmit || isSubmitting || isLoading}
        type="button"
        className={cn(
          'w-full py-3 rounded-xl font-medium transition-all active:scale-[0.98]',
          canSubmit
            ? 'bg-orange-600 text-white hover:bg-orange-700 cursor-pointer'
            : 'bg-stone-200 text-stone-400 cursor-not-allowed'
        )}
      >
        {isSubmitting || isLoading ? 'Submitting...' : 'Submit and Enter Dashboard'}
      </button>

      {/* Helper Text */}
      {!canSubmit && (
        <p className="text-xs text-amber-600 text-center">
          Fill in all fields to continue
        </p>
      )}
    </div>
  );
}

/**
 * Simple Confetti Component
 * CSS-based confetti animation
 */
function ConfettiContainer() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {[...Array(30)].map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 2 + Math.random() * 1;
        const colors = ['#E8652D', '#2A9D8F', '#F4A261', '#E76F51', '#264653'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-fall"
            style={{
              left: `${left}%`,
              top: '-10px',
              backgroundColor: color,
              animation: `fall ${duration}s linear ${delay}s forwards`,
              opacity: 0.8
            }}
          />
        );
      })}

      <style>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
