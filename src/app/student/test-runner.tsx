'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { TestResult } from '@/types';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATResult } from './exams/cat-result';

export function generateQuestions(testId: string) {
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

interface TestRunnerProps {
  testId: string;
  testName: string;
  onComplete: (r: Omit<TestResult, 'id' | 'student_id' | 'created_at'>) => void;
  onClose: () => void;
}

export function TestRunner({ testId, testName, onComplete, onClose }: TestRunnerProps) {
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
      // eslint-disable-next-line react-hooks/purity
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
