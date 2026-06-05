'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { TestResult } from '@/types';
import { Brain, ArrowRight, Award, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATResult } from './cat-result';

const TESTS = [
  { id: 'cat-readiness', name: 'CAT Readiness Test', desc: '35 questions · ~15 min · Complete diagnostic', color: 'orange' as const },
];

function generateQuestions(testId: string) {
  const baseQs = [
    // Quantitative Ability (7 questions)
    { category: 'Quantitative Ability', question: 'How comfortable are you with Number Systems & Arithmetic?' },
    { category: 'Quantitative Ability', question: 'Rate your proficiency in Algebra & Polynomials' },
    { category: 'Quantitative Ability', question: 'How confident are you with Geometry & Mensuration?' },
    { category: 'Quantitative Ability', question: 'Rate your speed in solving Profit/Loss & Percentage problems' },
    { category: 'Quantitative Ability', question: 'How comfortable are you with Permutation & Combination?' },
    { category: 'Quantitative Ability', question: 'Rate your proficiency in Probability concepts' },
    { category: 'Quantitative Ability', question: 'How confident are you in completing Quant section within time limits?' },

    // VARC (7 questions)
    { category: 'VARC', question: 'How quickly can you read & understand a 600-word passage?' },
    { category: 'VARC', question: 'Rate your accuracy in Reading Comprehension questions' },
    { category: 'VARC', question: 'How comfortable are you with Verbal Reasoning & Grammar?' },
    { category: 'VARC', question: 'Rate your speed in Para Jumble & Para Completion' },
    { category: 'VARC', question: 'How confident are you in identifying Critical Reasoning fallacies?' },
    { category: 'VARC', question: 'Rate your vocabulary strength (understand difficult passages)' },
    { category: 'VARC', question: 'How confident are you in completing VARC section within time limits?' },

    // LRDI (7 questions)
    { category: 'LRDI', question: 'How confident are you solving Logic Puzzles within time limits?' },
    { category: 'LRDI', question: 'Rate your proficiency in Data Interpretation & Analysis' },
    { category: 'LRDI', question: 'How comfortable are you with Set Theory & Venn Diagrams?' },
    { category: 'LRDI', question: 'Rate your speed in solving case lets under 12 minutes' },
    { category: 'LRDI', question: 'How confident are you with Arrangements & Grouping problems?' },
    { category: 'LRDI', question: 'Rate your ability to handle complex multi-part DI sets' },
    { category: 'LRDI', question: 'How confident are you in completing LRDI within time limits?' },

    // Mock Management & Strategy (7 questions)
    { category: 'Mock Strategy', question: 'How many full-length mocks have you taken in the last 30 days?' },
    { category: 'Mock Strategy', question: 'Do you have a clear question-selection strategy for each section?' },
    { category: 'Mock Strategy', question: 'How often do you analyse your mock mistakes in detail?' },
    { category: 'Mock Strategy', question: 'How disciplined are you with sectional time allocation?' },
    { category: 'Mock Strategy', question: 'Rate your consistency across mock tests (score variation)' },
    { category: 'Mock Strategy', question: 'How well do you track & improve weak question types?' },
    { category: 'Mock Strategy', question: 'How confident do you feel about your overall CAT strategy?' },

    // Physical & Mental Wellness (7 questions)
    { category: 'Wellness & Stamina', question: 'Can you stay mentally sharp through a full 2-hour mock?' },
    { category: 'Wellness & Stamina', question: 'How many hours of quality study can you do daily?' },
    { category: 'Wellness & Stamina', question: 'Rate your sleep quality (avg 7-8 hours/night)' },
    { category: 'Wellness & Stamina', question: 'How consistent is your daily preparation routine?' },
    { category: 'Wellness & Stamina', question: 'How well do you manage stress & pressure during exams?' },
    { category: 'Wellness & Stamina', question: 'Rate your physical fitness & health (exercise frequency)' },
    { category: 'Wellness & Stamina', question: 'How confident do you feel about cracking 95+ percentile?' },
  ];

  return baseQs.map((q, i) => ({
    id: `q${i}`,
    ...q,
    options: [
      { label: 'Not at all / Very weak (1)', value: 1 },
      { label: 'Below average (2)', value: 2 },
      { label: 'Decent / Mid (3)', value: 3 },
      { label: 'Strong / Confident (4)', value: 4 },
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
    // Convert questions to category scores for detailed feedback
    const categoryScores: Record<string, number> = {};
    questions.forEach((q) => {
      const answer = answers[q.id] || 0;
      categoryScores[q.category] = (categoryScores[q.category] || 0) + answer;
    });

    return (
      <CATResult
        score={result.score * 3} // Scale from /100 to /300 for CAT
        categories={categoryScores}
        onComplete={() =>
          onComplete({
            test_type: testId,
            test_name: testName,
            attempt_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
            score: result.score,
            percentile: result.percentile,
            breakdown: null
          })
        }
      />
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
