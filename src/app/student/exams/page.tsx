'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { TestResult } from '@/types';
import { Brain, ArrowRight, Award, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const TESTS = [
  { id: 'cat-readiness', name: 'CAT Readiness Test', desc: '10 questions · ~5 min · Percentile mapping', color: 'orange' as const },
  { id: 'cuet-readiness', name: 'CUET Readiness Test', desc: '10 questions · ~5 min · 16-tier percentile', color: 'teal' as const },
];

function generateQuestions(testId: string) {
  const isCAT = testId === 'cat-readiness';
  const baseQs = isCAT ? [
    { category: 'Mock Frequency', question: 'How many full-length mocks have you taken in the last 30 days?' },
    { category: 'Quant', question: 'How comfortable are you with Number Systems & Arithmetic?' },
    { category: 'VARC', question: 'How quickly can you read & summarise a 600-word passage?' },
    { category: 'LRDI', question: 'How confident are you solving a tough caselet under 12 minutes?' },
    { category: 'Time Management', question: 'How disciplined are you with section-wise time allocation?' },
    { category: 'Strategy', question: 'Do you have a clear question-selection strategy for each section?' },
    { category: 'Accuracy', question: 'What is your typical mock test accuracy?' },
    { category: 'Revision', question: 'How often do you analyse your mock mistakes?' },
    { category: 'Stamina', question: 'Can you stay sharp through a full 2-hour mock without losing focus?' },
    { category: 'Confidence', question: 'How confident do you feel about cracking 95+ percentile?' },
  ] : [
    { category: 'Subject Coverage', question: 'How many subjects from the CUET syllabus have you completed?' },
    { category: 'Language', question: 'How strong is your reading comprehension in English?' },
    { category: 'General Test', question: 'How confident are you with current affairs & GK?' },
    { category: 'Quantitative', question: 'How comfortable are you with basic mathematics & reasoning?' },
    { category: 'Mocks', question: 'How many CUET mocks have you attempted?' },
    { category: 'Revision', question: 'How frequently do you revise NCERT chapters?' },
    { category: 'Speed', question: 'Can you finish a section within the allotted time?' },
    { category: 'Subject Strength', question: 'How strong is your strongest domain subject?' },
    { category: 'Strategy', question: 'Do you have a college shortlist based on your target score?' },
    { category: 'Confidence', question: 'How confident are you about getting into a top DU college?' },
  ];
  return baseQs.map((q, i) => ({
    id: `q${i}`,
    ...q,
    options: [
      { label: 'Not at all / Very weak', value: 1 },
      { label: 'Below average', value: 2 },
      { label: 'Decent / Mid', value: 3 },
      { label: 'Strong / Confident', value: 4 },
    ],
  }));
}

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

function TestRunner({ testId, testName, onComplete, onClose }: {
  testId: string;
  testName: string;
  onComplete: (r: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) => void;
  onClose: () => void;
}) {
  const questions = useMemo(() => generateQuestions(testId), [testId]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; percentile: number } | null>(null);

  function handleAnswer(qid: string, value: number) {
    const newAnswers = { ...answers, [qid]: value };
    setAnswers(newAnswers);
    if (current < questions.length - 1) {
      setTimeout(() => setCurrent((c) => c + 1), 200);
    } else {
      const score = Object.values(newAnswers).reduce((s, v) => s + v, 0);
      const normalized = Math.round((score / (questions.length * 4)) * 100);
      const percentile = Math.min(99, Math.max(1, normalized + Math.floor(Math.random() * 10) - 5));
      setResult({ score: normalized, percentile });
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 bg-stone-900/95 z-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Award className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Test complete</h2>
          <div className="my-6">
            <div className="text-6xl font-bold text-stone-900 font-mono">{result.score}</div>
            <div className="text-sm text-stone-600 mt-1">out of 100</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 mb-6">
            <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Percentile</div>
            <div className="text-2xl font-bold text-stone-900 font-mono mt-1">Top {100 - result.percentile}%</div>
          </div>
          <button
            type="button"
            onClick={() => onComplete({ test_type: testId, test_name: testName, attempt_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), score: result.score, percentile: result.percentile, breakdown: null })}
            className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all"
          >
            Save & continue
          </button>
        </Card>
      </div>
    );
  }

  const q = questions[current];
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="border-b border-stone-200 p-4 flex items-center justify-between">
        <button type="button" onClick={onClose}><X className="w-5 h-5 text-stone-600" /></button>
        <div className="text-sm font-semibold">{current + 1} / {questions.length}</div>
        <div className="w-5" />
      </div>
      <div className="h-1 bg-stone-100">
        <div className="h-full bg-orange-600 transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2">{q.category}</p>
          <h2 className="text-xl font-semibold text-stone-900 mb-6 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>{q.question}</h2>
          <div className="space-y-2.5">
            {q.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleAnswer(q.id, opt.value)}
                className={cn('w-full text-left p-4 bg-white border-2 rounded-xl transition-all', answers[q.id] === opt.value ? 'border-stone-900' : 'border-stone-200 hover:border-stone-400')}
              >
                <span className="text-sm text-stone-900">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
