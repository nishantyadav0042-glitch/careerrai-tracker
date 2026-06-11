'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Zap, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface ScreenBaselineTestProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenBaselineTest({ onNext, onBack, canGoBack, isLoading }: ScreenBaselineTestProps) {
  const supabase = createClient();
  const [hasTest, setHasTest] = useState(false);
  const [testScore, setTestScore] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkForTest() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('test_results')
          .select('score')
          .eq('student_id', user.id)
          .eq('test_type', 'cat-readiness')
          .single();

        if (data) {
          setHasTest(true);
          setTestScore(data.score);
        }
      } catch (error) {
        // No test found, that's okay
        console.log('No test found yet');
      } finally {
        setIsChecking(false);
      }
    }

    checkForTest();
  }, [supabase]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Checking for test...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subtitle */}
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Your Baseline</p>
        <p className="text-xs text-stone-500 mt-1">Get your starting point for CAT prep</p>
      </div>

      {hasTest ? (
        <>
          {/* Test Complete - Show Score */}
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-8 border border-emerald-200 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-stone-900 mb-2">Test Complete!</h3>
            <p className="text-sm text-stone-600 mb-6">Great job finishing the baseline assessment</p>

            {testScore !== null && (
              <div className="bg-white rounded-xl p-4 mb-6 border border-emerald-100">
                <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-1">Your Score</p>
                <div className="text-5xl font-bold text-emerald-700">{testScore}</div>
                <p className="text-xs text-stone-600 mt-1">/100</p>
              </div>
            )}

            <p className="text-sm text-stone-600 mb-4">
              Your buddy has all the information needed to create a personalized strategy for you.
            </p>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNext();
              }}
              disabled={isLoading}
              type="button"
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all disabled:opacity-50 cursor-pointer"
            >
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          {/* No Test Yet - Encourage to Take */}
          <div className="space-y-4">
            {/* Icon */}
            <div className="flex justify-center">
              <Zap className="w-16 h-16 text-orange-600" />
            </div>

            {/* Description */}
            <div className="text-center space-y-3">
              <p className="text-sm text-stone-700 font-medium">Your buddy needs this to guide you</p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Takes 5 minutes. 35 questions. Your score tells your buddy exactly where to focus with you. It&apos;s the
                fastest way to get personalized guidance.
              </p>
            </div>

            {/* Test Button */}
            <Link
              href="/student/exams"
              className="block w-full py-3 bg-orange-600 text-white text-center rounded-xl font-medium hover:bg-orange-700 transition-all active:scale-[0.98]"
            >
              Take the 5-Minute Test
            </Link>

            {/* Alternative */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNext();
              }}
              type="button"
              className="w-full py-3 bg-white text-stone-900 border-2 border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-all cursor-pointer"
            >
              I&apos;ll do this later
            </button>

            {/* Warning Message */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 text-center">
                <span className="font-semibold">Heads up:</span> Your buddy can&apos;t give personalized guidance without
                this. Strongly recommended.
              </p>
            </div>
          </div>

          {/* Quick Note */}
          <p className="text-xs text-stone-500 text-center italic">
            Don&apos;t worry about your score. This is just to understand your current level. Improvement is what matters.
          </p>
        </>
      )}
    </div>
  );
}
