'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Lock, ArrowRight, MessageCircle, Smartphone, CheckCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Area =
  | 'mock_analysis'
  | 'exam_strategy'
  | 'varc'
  | 'quant'
  | 'dilr'
  | 'study_habits'
  | 'mental_readiness';

interface Question {
  id: number;
  text: string;
  area: Area;
  type: 'behaviour' | 'knowledge';
  options: string[];
  correctIndex?: number; // knowledge: which option is correct (4 pts)
  scores?: number[];     // custom per-option scoring (overrides defaults)
  placeholder?: boolean; // marks questions the owner intends to replace
}

// ─── Area Labels & Verdicts ───────────────────────────────────────────────────

const AREA_LABELS: Record<Area, string> = {
  mock_analysis: 'Mock Analysis',
  exam_strategy: 'Exam Strategy',
  varc: 'VARC',
  quant: 'Quant',
  dilr: 'DILR',
  study_habits: 'Study Habits',
  mental_readiness: 'Mental Readiness',
};

const AREA_ORDER: Area[] = [
  'mock_analysis',
  'exam_strategy',
  'varc',
  'quant',
  'dilr',
  'study_habits',
  'mental_readiness',
];

const AREA_VERDICTS: Record<Area, { low: string; mid: string; high: string }> = {
  mock_analysis: {
    low: "You're not mining your mocks. A bad mock with deep review beats a good mock with no review.",
    mid: 'Decent review habit — the gap is in the depth, not the intention.',
    high: "You're extracting real value from every mock. This discipline compounds.",
  },
  exam_strategy: {
    low: "No strategy means improvising under pressure. That's expensive in the actual exam.",
    mid: "You know the playbook — the gap is executing it consistently under time pressure.",
    high: 'Sharp exam awareness. This multiplies everything else you\'ve built.',
  },
  varc: {
    low: "VARC is the section most students underestimate — and the one that decides IIM calls.",
    mid: 'Solid foundation. The jump comes from reading quality long-form content daily.',
    high: 'Your VARC awareness is strong. Protect the reading habit.',
  },
  quant: {
    low: 'Quant fundamentals need work. Build the base before attacking speed.',
    mid: 'The concepts are there — the gap is consistent daily practice and error classification.',
    high: 'Quant is working for you. Focus on accuracy and time management now.',
  },
  dilr: {
    low: "DILR is a skill, not a talent — it needs dedicated set practice, not just mocks.",
    mid: "You're building the pattern recognition. More timed set practice will accelerate this.",
    high: 'Strong DILR instincts. Keep the timed practice volume high.',
  },
  study_habits: {
    low: 'Inconsistent prep is the silent score-killer. The system matters more than the hours.',
    mid: 'Your habits are taking shape. Locking in a fixed daily slot will change the results.',
    high: 'Your prep structure is solid — this is the foundation everything else sits on.',
  },
  mental_readiness: {
    low: 'The mental game is where most aspirants lose marks they had. Worth taking seriously.',
    mid: "You're managing the pressure mostly well — the gaps show up under exam conditions.",
    high: 'Good mental framework. CAT is as much about composure as concepts.',
  },
};

// ─── Questions (5 real + 25 placeholder) ─────────────────────────────────────
// Questions marked placeholder: true are intended to be replaced with real content.
// Scoring: behaviour → option 0 = 3 pts, option 3 = 0 pts. knowledge → correct = 4 pts, wrong = 0 pts.
// Custom `scores` array overrides defaults (used for trap/inverted questions).

const QUESTIONS: Question[] = [
  // ── Mock Analysis (4) ─────────────────────────────────────────────────────
  {
    id: 1, area: 'mock_analysis', type: 'behaviour',
    text: 'After each mock, do you spend 2+ hours analysing every wrong answer?',
    options: [
      'Yes — every wrong answer, every concept, every time',
      'Most wrong answers, but I skip the really complex ones',
      'I go through them quickly',
      'I mostly just note my score and move on',
    ],
  },
  {
    id: 2, area: 'mock_analysis', type: 'behaviour', placeholder: true,
    text: 'After your last mock, how long did it take you to complete a full review?',
    options: [
      'Same day — reviewed everything within a few hours',
      'Within 2 days',
      'About a week',
      "I haven't fully reviewed it yet",
    ],
  },
  {
    id: 3, area: 'mock_analysis', type: 'knowledge', placeholder: true,
    text: "In a mock review, what's the most valuable thing to record for each wrong answer?",
    options: [
      'The correct answer for future reference',
      'Whether it was a concept gap, careless error, or deliberate skip',
      'Time spent on the question',
      'Your section percentile that day',
    ],
    correctIndex: 1,
  },
  {
    id: 4, area: 'mock_analysis', type: 'behaviour', placeholder: true,
    text: 'Do you maintain a dedicated error log from your mocks, with root causes and revision notes?',
    options: [
      'Yes — root cause, concept note, and marked for revision',
      'Yes — basic list of wrong answers',
      'Occasionally',
      'No',
    ],
  },

  // ── Exam Strategy (4) ─────────────────────────────────────────────────────
  {
    id: 5, area: 'exam_strategy', type: 'knowledge', placeholder: true,
    text: 'Attempting an unsure question in CAT makes sense when:',
    options: [
      'You can confidently eliminate at least 2 of the 4 options',
      'You have time left at the end of the section',
      'The question looks easier than others nearby',
      "You've already secured the safe attempts",
    ],
    correctIndex: 0,
  },
  {
    id: 6, area: 'exam_strategy', type: 'behaviour', placeholder: true,
    text: 'During mocks, do you strictly follow a pre-set time budget for each section?',
    options: [
      'Always — I move on the moment the clock hits my limit',
      'Usually, with minor adjustments',
      'Sometimes — I get absorbed in hard sections',
      'I adjust freely and often run short on the last section',
    ],
  },
  {
    id: 7, area: 'exam_strategy', type: 'knowledge', placeholder: true,
    text: "You're 4 minutes into a tough RC passage and still confused. The right call is:",
    options: [
      'Mark it and move on immediately',
      'Give it 2 more minutes — you\'re close',
      'Skip this passage entirely',
      "Keep pushing — leaving RC unanswered hurts your percentile most",
    ],
    correctIndex: 0,
  },
  {
    id: 8, area: 'exam_strategy', type: 'behaviour', placeholder: true,
    text: 'Do you have a written slot strategy (section order, time per set) before entering a mock?',
    options: [
      'Yes, written — and I follow it consistently',
      'Rough mental plan that I mostly stick to',
      'Not really — I figure it out during the test',
      'No plan at all',
    ],
  },

  // ── VARC (4) ──────────────────────────────────────────────────────────────
  {
    id: 9, area: 'varc', type: 'knowledge', placeholder: true,
    text: 'In CAT RC, the correct answer to an inference question must:',
    options: [
      'Be explicitly stated in the passage',
      'Follow logically from the passage without overstretching',
      "Match the author's tone throughout",
      'Summarise the main argument',
    ],
    correctIndex: 1,
  },
  {
    id: 10, area: 'varc', type: 'behaviour', placeholder: true,
    text: 'How often do you read quality long-form content (editorials, essays) outside of prep material?',
    options: [
      'Daily — at least 20–30 minutes',
      'A few times a week',
      'Rarely',
      'Never — only prep material',
    ],
  },
  {
    id: 11, area: 'varc', type: 'behaviour', placeholder: true,
    text: 'When you get an RC question wrong, do you re-read the passage to find exactly where you went wrong?',
    options: [
      'Yes — I find the exact line or paragraph I misread',
      'Usually, but not always that precisely',
      'Sometimes',
      'I just note it as wrong and move on',
    ],
  },
  {
    id: 12, area: 'varc', type: 'knowledge', placeholder: true,
    text: 'In a para-jumble, the fastest starting point is usually:',
    options: [
      'Finding a sentence that cannot come first (it references something before it)',
      'Finding the closing sentence',
      'Looking for mandatory adjacent pairs',
      'Trying each option from A to D systematically',
    ],
    correctIndex: 0,
  },

  // ── Quant (5) ─────────────────────────────────────────────────────────────
  {
    id: 13, area: 'quant', type: 'knowledge', placeholder: true,
    text: 'A train goes from A to B at 60 km/h and returns at 40 km/h. The average speed for the full trip is:',
    options: ['50 km/h', '48 km/h', '52 km/h', '45 km/h'],
    correctIndex: 1, // harmonic mean: 2×60×40/(60+40) = 48
  },
  {
    id: 14, area: 'quant', type: 'knowledge',
    text: 'In a CAT slot, roughly how much time per question can you afford in Quant?',
    options: ['~1.5 minutes', '~3 minutes', '~5 minutes', 'Depends on difficulty'],
    correctIndex: 0,
  },
  {
    id: 15, area: 'quant', type: 'behaviour', placeholder: true,
    text: 'Do you practise at least 15–20 Quant questions daily, outside of full mocks?',
    options: ['Yes, every day', 'Most days', 'A few times a week', 'Rarely or never'],
  },
  {
    id: 16, area: 'quant', type: 'knowledge', placeholder: true,
    text: 'The fastest way to check if a number is divisible by 9:',
    options: [
      'Check if the last digit is divisible by 9',
      'Check if the number is even',
      'Check if the sum of all digits is divisible by 9',
      'Check if the last two digits form a multiple of 9',
    ],
    correctIndex: 2,
  },
  {
    id: 17, area: 'quant', type: 'behaviour', placeholder: true,
    text: 'When you get a Quant question wrong in a mock, do you classify the error type before moving on?',
    options: [
      'Yes — concept gap, formula slip, or calculation error',
      'Sometimes',
      'I just note it as wrong',
      'No',
    ],
  },

  // ── DILR (5) ──────────────────────────────────────────────────────────────
  {
    id: 18, area: 'dilr', type: 'behaviour', placeholder: true,
    text: 'How many full DILR sets do you practise per week outside of mocks?',
    options: ['5 or more', '3–4 sets', '1–2 sets', 'Zero — only through mocks'],
  },
  {
    id: 19, area: 'dilr', type: 'knowledge',
    text: 'In DILR, the smartest first move when you see the question paper is to:',
    options: [
      "Quickly scan all sets and pick the 2–3 you're most confident in",
      'Start solving Set 1 immediately',
      'Read all sets fully before attempting any',
      'Pick the sets with the fewest questions',
    ],
    correctIndex: 0,
  },
  {
    id: 20, area: 'dilr', type: 'behaviour', placeholder: true,
    text: "After a DILR set you couldn't crack, do you attempt it again from scratch before checking the solution?",
    options: [
      'Always — at least two independent attempts',
      'Usually',
      'Sometimes',
      'No — I go straight to the solution',
    ],
  },
  {
    id: 21, area: 'dilr', type: 'knowledge', placeholder: true,
    text: "You're mid-way through an LR set and hit a contradiction. The fastest recovery is:",
    options: [
      'Undo the last assumption and try a different value',
      'Restart from scratch with fresh notation',
      "Mark and skip — it's probably a flawed question",
      'Guess the remaining answers and move on',
    ],
    correctIndex: 0,
  },
  {
    id: 22, area: 'dilr', type: 'behaviour', placeholder: true,
    text: 'Do you time every DILR set you practise, even outside of mocks?',
    options: [
      'Yes, always — time pressure is part of the skill',
      'Usually',
      'Occasionally',
      'No',
    ],
  },

  // ── Study Habits (4) ──────────────────────────────────────────────────────
  {
    id: 23, area: 'study_habits', type: 'behaviour',
    text: 'Do you study at the same fixed hours every day?',
    options: [
      'Yes — same slot, every single day',
      'Most days, but I adjust when life gets busy',
      'I study whenever I find free time',
      'No fixed schedule at all',
    ],
  },
  {
    id: 24, area: 'study_habits', type: 'behaviour', placeholder: true,
    text: 'How many focused hours of CAT prep do you average per day (phone away, no distractions)?',
    options: ['4+ hours', '2–3 hours', '1–2 hours', 'Less than 1 hour'],
  },
  {
    id: 25, area: 'study_habits', type: 'behaviour', placeholder: true,
    text: "Do you do a quick revision of yesterday's material before starting today's session?",
    options: [
      'Yes, always — 10–15 min spaced revision',
      'Usually',
      'Rarely',
      'No',
    ],
  },
  {
    id: 26, area: 'study_habits', type: 'behaviour', placeholder: true,
    text: 'After a bad prep day (missed sessions, poor focus), what do you do the next morning?',
    options: [
      "Restart the plan as if yesterday didn't happen",
      'Adjust the plan and keep going',
      'Feel guilty and tend to under-study the next day too',
      '"Restart properly next week"',
    ],
  },

  // ── Mental Readiness (4) ──────────────────────────────────────────────────
  {
    id: 27, area: 'mental_readiness', type: 'behaviour', placeholder: true,
    text: 'When you score below your target in a mock, how quickly do you recover your prep momentum?',
    options: [
      'Same day or next day — analyse and move on',
      'Within 2–3 days',
      'About a week',
      "Still haven't fully recovered from my last bad mock",
    ],
  },
  {
    // TRAP question: completely calm = overconfidence = 0 pts. Healthy nerves = highest score.
    id: 28, area: 'mental_readiness', type: 'behaviour',
    text: 'When you think about CAT day, do you feel completely calm and free of stress?',
    options: [
      'Yes — completely calm, no stress at all',
      'Mostly calm, with some healthy nerves',
      'Quite anxious, but it pushes me to prepare harder',
      'Very anxious — it\'s affecting my prep negatively',
    ],
    scores: [0, 3, 2, 1],
  },
  {
    id: 29, area: 'mental_readiness', type: 'behaviour', placeholder: true,
    text: "Do you have a clear post-CAT plan (reapplication strategy, backup options) if it doesn't go as planned?",
    options: [
      'Yes — fully thought through',
      'Rough plan, not fully fleshed out',
      'Not really',
      "No — I haven't let myself think about it",
    ],
  },
  {
    id: 30, area: 'mental_readiness', type: 'knowledge', placeholder: true,
    text: 'Which best supports mental performance across a 3-hour exam like CAT?',
    options: [
      'Cutting all leisure and social activity in the final weeks',
      '7–8 hours of sleep and light physical activity throughout prep',
      'Studying 10+ hours daily in the final week to maximise coverage',
      'Avoiding thinking about the exam to reduce anxiety',
    ],
    correctIndex: 1,
  },
];

// ─── Scoring Utilities ────────────────────────────────────────────────────────

function getQuestionScore(q: Question, answerIdx: number): number {
  if (q.scores) return q.scores[answerIdx] ?? 0;
  if (q.type === 'knowledge') return answerIdx === q.correctIndex ? 4 : 0;
  return 3 - answerIdx; // behaviour: option 0→3, option 3→0
}

function getQuestionMax(q: Question): number {
  if (q.scores) return Math.max(...q.scores);
  if (q.type === 'knowledge') return 4;
  return 3;
}

const MAX_RAW = QUESTIONS.reduce((sum, q) => sum + getQuestionMax(q), 0);

function computeScore(answers: (number | null)[]): number {
  let raw = 0;
  for (let i = 0; i < QUESTIONS.length; i++) {
    const ans = answers[i];
    if (ans !== null) raw += getQuestionScore(QUESTIONS[i], ans);
  }
  return Math.round((raw / MAX_RAW) * 100);
}

function getTier(score: number): string {
  if (score >= 95) return 'Top 1%';
  if (score >= 90) return 'Top 3%';
  if (score >= 85) return 'Top 8%';
  if (score >= 80) return 'Top 14%';
  if (score >= 75) return 'Top 22%';
  if (score >= 70) return 'Top 30%';
  if (score >= 65) return 'Top 40%';
  if (score >= 60) return 'Top 50%';
  if (score >= 55) return 'Top 60%';
  if (score >= 50) return 'Top 68%';
  if (score >= 45) return 'Top 75%';
  if (score >= 40) return 'Top 82%';
  if (score >= 35) return 'Top 88%';
  if (score >= 30) return 'Top 93%';
  if (score >= 25) return 'Top 96%';
  return 'Top 98%';
}

function getScoreVerdict(score: number): string {
  if (score >= 85) return "You're in a genuinely strong position. The gap to close now is execution, not knowledge.";
  if (score >= 70) return "Real strengths here — but 2–3 areas will cost you marks in the actual exam.";
  if (score >= 55) return "You know the basics. What's missing is the system that makes them reliable under pressure.";
  if (score >= 40) return "A lot of ground to cover — but the students who close this gap fastest are the ones who face it honestly.";
  return "You're starting from clarity. That's the only starting point that actually leads somewhere.";
}

type AreaScore = { earned: number; max: number; pct: number };

function computeAreaScores(answers: (number | null)[]): Record<Area, AreaScore> {
  const result = {} as Record<Area, AreaScore>;
  for (const area of AREA_ORDER) {
    let earned = 0;
    let max = 0;
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      if (q.area !== area) continue;
      max += getQuestionMax(q);
      const ans = answers[i];
      if (ans !== null) earned += getQuestionScore(q, ans);
    }
    result[area] = { earned, max, pct: max > 0 ? Math.round((earned / max) * 100) : 0 };
  }
  return result;
}

function getAreaVerdict(area: Area, pct: number): string {
  const v = AREA_VERDICTS[area];
  if (pct >= 70) return v.high;
  if (pct >= 40) return v.mid;
  return v.low;
}

function barColor(pct: number): string {
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CatReadinessClient() {
  const [step, setStep] = useState<'intro' | 'testing' | 'score'>('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(QUESTIONS.length).fill(null));
  const [pendingOption, setPendingOption] = useState<number | null>(null);

  // Gate state
  const [gateName, setGateName] = useState('');
  const [gatePhone, setGatePhone] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateUnlocked, setGateUnlocked] = useState(false);

  const score = useMemo(() => computeScore(answers), [answers]);
  const tier = useMemo(() => getTier(score), [score]);
  const areaScores = useMemo(() => computeAreaScores(answers), [answers]);

  const waNumber = process.env.NEXT_PUBLIC_DEMO_WHATSAPP ?? '';
  const waMsg = encodeURIComponent(
    `Hi, I just took the CAT Readiness Test and scored ${score}/100 (${tier}). I'd like my free 15-min buddy session.`
  );
  const whatsappUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;
  const appInstallUrl = process.env.NEXT_PUBLIC_APP_INSTALL_URL ?? '#';

  function handleAnswer(optIdx: number) {
    if (pendingOption !== null) return;
    setPendingOption(optIdx);

    const newAnswers = [...answers];
    newAnswers[currentQ] = optIdx;

    setTimeout(() => {
      setAnswers(newAnswers);
      setPendingOption(null);
      if (currentQ + 1 >= QUESTIONS.length) {
        setStep('score');
      } else {
        setCurrentQ((q) => q + 1);
      }
    }, 260);
  }

  async function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gateName.trim()) {
      setGateError('Enter your name.');
      return;
    }
    if (gatePhone.replace(/\D/g, '').length < 10) {
      setGateError('Enter a valid 10-digit phone number.');
      return;
    }
    setGateSubmitting(true);
    setGateError(null);
    try {
      const res = await fetch('/api/cat-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName.trim(), phone: gatePhone.trim(), score, tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setGateError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setGateUnlocked(true);
    } catch {
      setGateError('No connection. Try again.');
    } finally {
      setGateSubmitting(false);
    }
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-orange-100 rounded-full opacity-50 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-teal-100 rounded-full opacity-40 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/careerrai-logo.png"
              alt="CareerRai"
              width={80}
              height={80}
              style={{ height: 80, width: 'auto' }}
              priority
            />
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h1
              className="text-3xl font-bold text-stone-900 leading-tight"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              How ready are you —<br />
              <span className="italic text-orange-600">really?</span>
            </h1>
            <p className="mt-3 text-base text-stone-600">
              30 questions · 5 minutes · no signup required
            </p>
          </div>

          {/* Value list */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-lg shadow-stone-900/5 mb-6 space-y-3">
            {[
              'Your honest readiness score out of 100',
              'Which of 7 CAT areas are your weak points',
              'A free 15-min session with a real IIM buddy to break it down',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span className="text-sm text-stone-700">{item}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => setStep('testing')}
            className="w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-semibold text-base rounded-2xl transition-all shadow-lg shadow-orange-600/25"
          >
            Start the test <ArrowRight className="w-5 h-5" />
          </button>

          <p className="text-center text-xs text-stone-400 mt-4">
            No account. No payment. No catch.
          </p>

          {/* Secondary: install app */}
          <div className="mt-5 text-center">
            <a
              href={appInstallUrl}
              className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Already preparing? Install the app
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Testing ────────────────────────────────────────────────────────────────
  if (step === 'testing') {
    const q = QUESTIONS[currentQ];
    const progress = ((currentQ) / QUESTIONS.length) * 100;

    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-stone-200 w-full">
          <div
            className="h-1 bg-orange-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-5 py-6">
          {/* Counter + area */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
              {AREA_LABELS[q.area]}
            </span>
            <span className="text-xs font-mono text-stone-400">
              {currentQ + 1} / {QUESTIONS.length}
            </span>
          </div>

          {/* Question */}
          <p className="text-xl font-semibold text-stone-900 leading-snug mb-8" style={{ fontFamily: 'Georgia, serif' }}>
            {q.text}
          </p>

          {/* Options */}
          <div className="space-y-3 flex-1">
            {q.options.map((opt, idx) => {
              const isSelected = pendingOption === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={pendingOption !== null}
                  className={cn(
                    'w-full text-left px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
                    isSelected
                      ? 'border-orange-500 bg-orange-50 text-orange-900'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400 active:scale-[0.99]',
                    pendingOption !== null && !isSelected ? 'opacity-50' : '',
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <p className="text-center text-xs text-stone-400 mt-6 pb-2">
            Tap an answer to continue
          </p>
        </div>
      </div>
    );
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-md mx-auto px-5 py-8 pb-20">
        {/* Score hero */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">
            Your CAT readiness score
          </p>
          <div
            className="text-8xl font-black text-orange-600 leading-none"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {score}
          </div>
          <div className="text-2xl font-bold text-stone-400 mt-1">/ 100</div>

          <div className="inline-block mt-4 px-4 py-1.5 bg-stone-900 text-white text-sm font-bold rounded-full">
            {tier} of test-takers
          </div>

          <p className="mt-4 text-sm text-stone-600 italic leading-relaxed max-w-xs mx-auto">
            {getScoreVerdict(score)}
          </p>
        </div>

        {/* Area breakdown — blurred until gate unlocked */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">
            Your detailed breakdown
          </p>

          <div className="relative">
            {/* Bars (blurred when locked) */}
            <div
              style={{ filter: gateUnlocked ? 'none' : 'blur(5px)' }}
              className={cn('space-y-3.5', !gateUnlocked && 'pointer-events-none select-none')}
            >
              {AREA_ORDER.map((area) => {
                const as = areaScores[area];
                return (
                  <div key={area}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-stone-700">{AREA_LABELS[area]}</span>
                      <span className="text-xs font-mono text-stone-500">{as.pct}%</span>
                    </div>
                    <div className="bg-stone-100 rounded-full h-2">
                      <div
                        className={cn('h-2 rounded-full transition-all', barColor(as.pct))}
                        style={{ width: `${as.pct}%` }}
                      />
                    </div>
                    {gateUnlocked && (
                      <p className="text-xs text-stone-500 mt-1 leading-snug">
                        {getAreaVerdict(area, as.pct)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Lock overlay */}
            {!gateUnlocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded-2xl px-6 py-4 shadow-sm text-center">
                  <Lock className="w-5 h-5 mx-auto mb-1.5 text-stone-400" />
                  <p className="text-sm font-semibold text-stone-800">Your breakdown is locked</p>
                  <p className="text-xs text-stone-500 mt-0.5">Complete the form below to unlock it</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gate form OR post-unlock CTA */}
        {!gateUnlocked ? (
          <div className="bg-gradient-to-br from-teal-50 to-stone-50 border border-teal-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-stone-900 leading-snug mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              A real IIM buddy will break down your result — free.
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed mb-5">
              Your score is just the surface. Tell us where to reach you and a CAT buddy
              who&apos;s cracked this exam will walk you through your weak areas in a free
              15-minute session. No payment. No catch.
            </p>

            <form onSubmit={handleGateSubmit} className="space-y-3">
              <div>
                <label htmlFor="gate-name" className="block text-sm font-medium text-stone-800 mb-1.5">
                  Name
                </label>
                <input
                  id="gate-name"
                  type="text"
                  autoComplete="name"
                  value={gateName}
                  onChange={(e) => setGateName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label htmlFor="gate-phone" className="block text-sm font-medium text-stone-800 mb-1.5">
                  Phone number
                </label>
                <input
                  id="gate-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={gatePhone}
                  onChange={(e) => setGatePhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  required
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {gateError && (
                <p className="text-xs text-rose-600">{gateError}</p>
              )}

              <button
                type="submit"
                disabled={gateSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-teal-700 hover:bg-teal-800 active:scale-[0.98] text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-60"
              >
                {gateSubmitting ? 'Saving…' : 'Unlock my analysis + free session'}
                {!gateSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>

              <p className="text-center text-xs text-stone-400">
                We&apos;ll only use this to set up your free session.
              </p>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {/* WhatsApp CTA */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] hover:bg-[#22c55e] active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-green-600/20"
            >
              <MessageCircle className="w-5 h-5" />
              Book your free 15-min session
            </a>
            <p className="text-center text-xs text-stone-500">
              Opens WhatsApp — a buddy will reach out to confirm.
            </p>
          </div>
        )}

        {/* Secondary persistent CTA */}
        <div className="mt-6 text-center">
          <a
            href={appInstallUrl}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Install the CareerRai app
          </a>
        </div>
      </div>
    </div>
  );
}
