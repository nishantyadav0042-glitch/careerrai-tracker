'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Brain, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestRunner } from '../test-runner';
import type { TestResult } from '@/types';

interface CATTestWidgetProps {
  userId: string;
}

export function CATTestWidget({ userId }: CATTestWidgetProps) {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [activeTest, setActiveTest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('test_results')
          .select('*')
          .eq('student_id', userId)
          .eq('test_type', 'cat-readiness')
          .order('attempt_date', { ascending: false })
          .limit(5);
        setResults((data ?? []) as TestResult[]);
      } catch (error) {
        console.error('Error loading test results:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [userId, supabase]);

  async function saveResult(result: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) {
    try {
      const { data } = await supabase
        .from('test_results')
        .insert({ ...result, student_id: userId })
        .select()
        .single();
      if (data) {
        setResults((prev) => [data as TestResult, ...prev]);
        setActiveTest(false);
      }
    } catch (error) {
      console.error('Error saving test result:', error);
    }
  }

  const last = results[0];
  const totalAttempts = results.length;

  return (
    <>
      <Card className="p-5 bg-gradient-to-br from-orange-50 to-white border-orange-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-stone-900">CAT Readiness Test</h3>
            <p className="text-xs text-stone-500 mt-0.5">35 questions · ~15 min · Complete diagnostic</p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-100">
            <Brain className="w-5 h-5 text-orange-600" />
          </div>
        </div>

        {isLoading ? (
          <div className="bg-stone-100 rounded-xl p-3 mb-3 text-center">
            <p className="text-xs text-stone-600">Loading test data...</p>
          </div>
        ) : last ? (
          <div className="bg-white rounded-xl p-3 mb-3 border border-orange-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Last attempt</div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">
                  {last.score}
                  <span className="text-sm text-stone-500 font-normal">/100</span>
                </div>
                <div className="text-xs text-stone-600 mt-0.5">
                  {Math.round(last.percentile)}%ile · {new Date(last.attempt_date).toLocaleDateString('en-IN')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attempts</div>
                <div className="text-xl font-bold text-stone-900 font-mono mt-1">{totalAttempts}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-stone-50 rounded-xl p-3 mb-3 text-center">
            <p className="text-xs text-stone-600">Not attempted yet</p>
            <p className="text-[10px] text-stone-500 mt-1">Take the diagnostic to see where you stand</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActiveTest(true)}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98]',
            isLoading ? 'bg-stone-300 text-stone-500 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'
          )}
        >
          {isLoading ? 'Loading...' : last ? 'Retake Test' : 'Start Test'} {!isLoading && <ArrowRight className="w-4 h-4" />}
        </button>

        <p className="text-[10px] text-stone-500 text-center mt-2">
          💡 Get personalized feedback across 5 prep dimensions
        </p>
      </Card>

      {activeTest && (
        <TestRunner
          testId="cat-readiness"
          testName="CAT Readiness Test"
          onComplete={saveResult}
          onClose={() => setActiveTest(false)}
        />
      )}
    </>
  );
}
