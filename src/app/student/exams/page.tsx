'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { TestResult } from '@/types';
import { Brain, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestRunner } from '../test-runner';

const TESTS = [
  { id: 'cat-readiness', name: 'CAT Readiness Test', desc: '35 questions · ~15 min · Complete diagnostic', color: 'orange' as const },
];

export default function ExamsPage() {
  const supabase = createClient();
  const [results, setResults] = useState<TestResult[]>([]);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('test_results').select('*').eq('student_id', user.id).order('attempt_date', { ascending: false });
      setResults((data ?? []) as TestResult[]);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveResult(result: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) {
    if (!userId) return;
    const { data } = await supabase.from('test_results').insert({ ...result, student_id: userId }).select().single();
    if (data) setResults((prev) => [data as TestResult, ...prev]);
    setActiveTest(null);
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Diagnostics</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>Where do you stand?</h1>
        <p className="text-sm text-stone-500 mt-1">Self-assessment · results are private to you and your buddy</p>
      </div>

      {TESTS.map((test) => {
        const history = results.filter((r) => r.test_type === test.id);
        const last = history[0];
        return (
          <Card key={test.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-stone-900">{test.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">{test.desc}</p>
              </div>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', test.color === 'orange' ? 'bg-orange-100' : 'bg-teal-100')}>
                <Brain className={cn('w-5 h-5', test.color === 'orange' ? 'text-orange-600' : 'text-teal-700')} />
              </div>
            </div>

            {last ? (
              <div className="bg-stone-50 rounded-xl p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Last attempt</div>
                    <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{last.score}<span className="text-sm text-stone-500 font-normal">/100</span></div>
                    <div className="text-xs text-stone-600 mt-0.5">Top {100 - last.percentile}% · {formatDate(last.attempt_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attempts</div>
                    <div className="text-xl font-bold text-stone-900 font-mono mt-1">{history.length}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-stone-50 rounded-xl p-3 mb-3 text-center">
                <p className="text-xs text-stone-600">Not attempted yet</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveTest(test.id)}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98]',
                test.color === 'orange' ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-teal-700 text-white hover:bg-teal-800'
              )}
            >
              {last ? 'Retake test' : 'Start test'} <ArrowRight className="w-4 h-4" />
            </button>
          </Card>
        );
      })}

      {activeTest && (
        <TestRunner
          testId={activeTest}
          testName={TESTS.find((t) => t.id === activeTest)!.name}
          onComplete={saveResult}
          onClose={() => setActiveTest(null)}
        />
      )}
    </div>
  );
}
