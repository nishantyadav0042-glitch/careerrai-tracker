'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Check } from 'lucide-react';
import { updateStreakAfterLog, checkAndCreateMilestones } from '@/lib/streak-utils';
import { cn } from '@/lib/utils';

interface QuickLogSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const HOURS_OPTIONS = [
  { label: '0 hrs', value: 0 },
  { label: '1 hr', value: 1 },
  { label: '2 hrs', value: 2 },
  { label: '3 hrs', value: 3 },
  { label: '4+ hrs', value: 4 }
];

const TOPICS = ['Quant', 'VARC', 'LRDI', 'Mock', 'Revision'];

const FEELING_OPTIONS = [
  { emoji: '🙏', label: 'Tough', confidence: 2, stress: 4 },
  { emoji: '💪', label: 'Solid', confidence: 4, stress: 2 },
  { emoji: '🚀', label: 'Easy', confidence: 5, stress: 1 }
];

export function QuickLogSheet({ isOpen, onClose, userId }: QuickLogSheetProps) {
  const supabase = createClient();
  const [hours, setHours] = useState<number | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [buddyId, setBuddyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when closing
      setHours(null);
      setSelectedTopics([]);
      setFeeling(null);
      setShowConfetti(false);
    } else {
      // Load buddy info when opening
      loadBuddyInfo();
    }
  }, [isOpen]);

  async function loadBuddyInfo() {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('buddy_id')
        .eq('id', userId)
        .single();

      if (profile?.buddy_id) {
        setBuddyId(profile.buddy_id);
      }
    } catch (error) {
      console.log('Could not load buddy info');
    }
  }

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const canSubmit = hours !== null && selectedTopics.length > 0 && feeling !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split('T')[0];

      const feelingOption = FEELING_OPTIONS[feeling];

      // Create daily report
      const { error: reportError } = await supabase.from('daily_reports').insert({
        student_id: userId,
        report_date: todayString,
        study_duration: hours,
        topics_covered: selectedTopics,
        confidence: feelingOption.confidence,
        stress: feelingOption.stress,
        quality_focus: 3
      });

      if (reportError) throw reportError;

      // Update streak
      await updateStreakAfterLog(userId);

      // Check for milestones and notify buddy
      if (buddyId) {
        await checkAndCreateMilestones(userId, buddyId);
      }

      // Show confetti
      setShowConfetti(true);

      // Close after animation
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error submitting log:', error);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Confetti */}
      {showConfetti && <ConfettiContainer />}

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-white rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-200 p-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">Quick Log</h2>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* 1. HOURS STUDIED */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                Hours studied today
              </label>
              <div className="grid grid-cols-5 gap-2">
                {HOURS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setHours(option.value)}
                    className={cn(
                      'py-3 px-2 rounded-lg text-sm font-semibold transition-all',
                      hours === option.value
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. TOPICS COVERED */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                What did you study?
              </label>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all',
                      selectedTopics.includes(topic)
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    )}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. HOW DID IT GO? */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                How did it go?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {FEELING_OPTIONS.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => setFeeling(i)}
                    className={cn(
                      'py-4 px-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                      feeling === i
                        ? 'border-orange-600 bg-orange-50'
                        : 'border-stone-200 hover:border-stone-300'
                    )}
                  >
                    <span className="text-3xl">{option.emoji}</span>
                    <span className="text-xs font-medium text-stone-700">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Progress indicator */}
            <div className="flex gap-1">
              <div className={cn('h-1 flex-1 rounded-full transition-all', hours !== null ? 'bg-orange-600' : 'bg-stone-200')} />
              <div className={cn('h-1 flex-1 rounded-full transition-all', selectedTopics.length > 0 ? 'bg-orange-600' : 'bg-stone-200')} />
              <div className={cn('h-1 flex-1 rounded-full transition-all', feeling !== null ? 'bg-orange-600' : 'bg-stone-200')} />
            </div>
          </div>

          {/* Submit Button */}
          <div className="sticky bottom-0 bg-gradient-to-t from-white to-white/80 border-t border-stone-200 p-6">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className={cn(
                'w-full py-4 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-lg',
                canSubmit && !isSubmitting
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Logging...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Log & Continue
                </>
              )}
            </button>
            <p className="text-xs text-stone-500 text-center mt-3">
              Takes ~15 seconds ⚡
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Confetti animation component
 */
function ConfettiContainer() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 2 + Math.random() * 0.5,
    color: ['#E8652D', '#2A9D8F', '#F4A261', '#E76F51', '#264653'][
      Math.floor(Math.random() * 5)
    ]
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>

      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${particle.left}%`,
            top: '50%',
            backgroundColor: particle.color,
            animation: `confetti-fall ${particle.duration}s ease-out ${particle.delay}s forwards`
          }}
        />
      ))}
    </div>
  );
}
