'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Lock, ArrowRight, MessageCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RadioQ { kind: 'radio'; id: string; text: string; area: string | null; options: string[]; scores: number[]; }
interface StarsQ  { kind: 'stars';  id: string; text: string; area: string; }
interface SliderQ { kind: 'slider'; id: string; text: string; area: string; min: number; max: number; step: number; maxScore: number; scoreOf: (v: number) => number; fmt: (v: number) => string; }
type Question = RadioQ | StarsQ | SliderQ;
type InsightTag = 'strength' | 'gap' | 'risk';
interface InsightData { tag: InsightTag; title: string; body: string; }

// ─── Question Data ────────────────────────────────────────────────────────────

const QS: Question[] = [
  { kind:'radio', id:'q1',  area:null,          text:'Which attempt is this for you?',                                                              options:['1st attempt','2nd attempt','3rd attempt','4th+ attempt'],                                                                                      scores:[0,0,0,0] },
  { kind:'radio', id:'q2',  area:null,          text:"What's your target CAT percentile?",                                                          options:['Below 90','90–95','95–99','99+'],                                                                                                              scores:[0,0,0,0] },
  { kind:'radio', id:'q3',  area:'consistency', text:'How long have you been actively preparing?',                                                   options:['Just started','1–3 months','3–6 months','6+ months'],                                                                                          scores:[0,1,2,3] },
  { kind:'slider',id:'q4',  area:'consistency', text:'How many hours do you study per day on average?',                                              min:0, max:10, step:0.5, maxScore:5, scoreOf:(v)=>Math.min(5,Math.round(v)), fmt:(v)=>`${v} hrs` },
  { kind:'radio', id:'q5',  area:'consistency', text:'In the past 2 weeks, how many days did you actually study?',                                   options:['0–3 days','4–7 days','8–11 days','12–14 days'],                                                                                                scores:[0,1,2,3] },
  { kind:'radio', id:'q6',  area:'consistency', text:"What's your biggest reason for skipping study days?",                                          options:['Fatigue / burnout','Distractions','No clear plan','Low motivation','Job / college load','I rarely skip'],                                    scores:[1,1,1,2,2,3] },
  { kind:'radio', id:'q7',  area:'consistency', text:'Do you follow a written weekly study plan?',                                                   options:['Yes, and I stick to it','Yes, loosely','Only in my head','No plan at all'],                                                                  scores:[3,2,1,0] },
  { kind:'stars', id:'q8',  area:'readiness',   text:'Rate your current readiness in VARC (Verbal Ability & Reading Comprehension)' },
  { kind:'stars', id:'q9',  area:'readiness',   text:'Rate your current readiness in DILR (Data Interpretation & Logical Reasoning)' },
  { kind:'stars', id:'q10', area:'readiness',   text:'Rate your current readiness in QA (Quantitative Aptitude)' },
  { kind:'radio', id:'q11', area:'strategy',    text:'How many full-length mock tests have you taken so far?',                                       options:['None yet','1–5','6–15','15+'],                                                                                                                  scores:[0,1,2,3] },
  { kind:'radio', id:'q12', area:'strategy',    text:'Your best recent mock percentile?',                                                            options:['No mock yet','Below 80%ile','80–90%ile','90–95%ile','95%ile+'],                                                                             scores:[0,1,2,3,4] },
  { kind:'radio', id:'q13', area:'strategy',    text:'After each mock, do you do a detailed error analysis?',                                        options:['Always — every question','Sometimes','Rarely','Never done this'],                                                                            scores:[3,2,1,0] },
  { kind:'radio', id:'q14', area:null,          text:'Which area causes the most score drop in your mocks?',                                         options:['VARC','DILR','QA','Time management','Accuracy / silly errors',"Don't know yet"],                                                            scores:[0,0,0,0,0,0] },
  { kind:'radio', id:'q15', area:'support',     text:'Do you have anyone actively tracking your preparation?',                                       options:['Yes — a mentor/buddy','A friend / peer group','Family only','Completely solo'],                                                              scores:[3,2,1,0] },
  { kind:'radio', id:'q16', area:'support',     text:'When you have a bad week, what do you usually do?',                                            options:['Analyse it and reset the plan immediately','Feel off for a few days, then push back','Lose momentum for a week or more','It derails my prep significantly'], scores:[3,2,1,0] },
  { kind:'radio', id:'q17', area:'consistency', text:'How would you describe your daily study environment?',                                         options:['Dedicated, distraction-free space','Mostly quiet, minor interruptions','Inconsistent — varies a lot','Frequently interrupted or noisy'],         scores:[3,2,1,0] },
  { kind:'radio', id:'q18', area:'consistency', text:'In a typical study session, how often are you genuinely focused (phone away, no mid-topic breaks)?', options:['Almost always — deep work blocks','More often than not','About half the time','Rarely — lots of distractions'],  scores:[3,2,1,0] },
  { kind:'radio', id:'q19', area:'support',     text:'When you score below your target in a mock, how quickly do you reset mentally?',               options:['Same day — I analyse and move on','A day or two','About a week',"I haven't fully recovered from my last bad mock"],        scores:[3,2,1,0] },
  { kind:'radio', id:'q20', area:'consistency', text:"Do you revise the previous day's material before starting each new session?",                  options:['Yes, always — 10–15 min spaced revision','Usually','Rarely','No'],                                                                          scores:[3,2,1,0] },
];

const SECTIONS = [
  { title:'Background & Goal',           icon:'🎯', bg:'bg-orange-50', qids:['q1','q2'] },
  { title:'Study Habits & Consistency',  icon:'📅', bg:'bg-teal-50',   qids:['q3','q4','q5','q6','q7'] },
  { title:'Subject-wise Readiness',      icon:'📚', bg:'bg-stone-100', qids:['q8','q9','q10'] },
  { title:'Mock Tests & Error Analysis', icon:'📝', bg:'bg-purple-50', qids:['q11','q12','q13','q14'] },
  { title:'Accountability & Support',    icon:'🤝', bg:'bg-green-50',  qids:['q15','q16','q17','q18','q19','q20'] },
];

// ─── Scoring Engine (weighted blocks) ─────────────────────────────────────────
// Consistency 35pts / Strategy 30pts / Readiness 25pts / Support 10pts = 100 total

function computeScores(answers: Record<string, number>) {
  // CONSISTENCY (max 35)
  let consistency = 0;
  const daysIdx = answers['q5'];
  if (daysIdx === 1) consistency += 7;
  else if (daysIdx === 2) consistency += 14;
  else if (daysIdx === 3) consistency += 20;

  const skipIdx = answers['q6'];
  if (skipIdx === 5) consistency += 8;
  else if (skipIdx === 3 || skipIdx === 4) consistency += 5;
  else if (skipIdx !== undefined) consistency += 2;

  const planIdx = answers['q7'];
  if (planIdx === 0) consistency += 7;
  else if (planIdx === 1) consistency += 5;
  else if (planIdx === 2) consistency += 2;
  // max: 20+8+7 = 35

  // STRATEGY (max 30)
  let strategy = 0;
  const mocksIdx = answers['q11'];
  if (mocksIdx === 1) strategy += 3;
  else if (mocksIdx === 2) strategy += 7;
  else if (mocksIdx === 3) strategy += 9;

  const percentileIdx = answers['q12'];
  if (percentileIdx === 1) strategy += 3;
  else if (percentileIdx === 2) strategy += 6;
  else if (percentileIdx === 3) strategy += 8;
  else if (percentileIdx === 4) strategy += 10;

  const errorIdx = answers['q13'];
  if (errorIdx === 0) strategy += 8;
  else if (errorIdx === 1) strategy += 5;
  else if (errorIdx === 2) strategy += 2;

  const weakAreaIdx = answers['q14'];
  if (weakAreaIdx !== undefined && weakAreaIdx !== 5) strategy += 3;
  // max: 9+10+8+3 = 30

  // READINESS (max 25)
  let readiness = 0;
  const varc = answers['q8'] ?? 0;
  const dilr = answers['q9'] ?? 0;
  const qa   = answers['q10'] ?? 0;
  readiness += Math.round((varc / 5) * 8);
  readiness += Math.round((dilr / 5) * 8);
  readiness += Math.round((qa   / 5) * 9);
  // max: 8+8+9 = 25

  // SUPPORT (max 10)
  let support = 0;
  const accountabilityIdx = answers['q15'];
  if (accountabilityIdx === 0) support += 6;
  else if (accountabilityIdx === 1) support += 4;
  else if (accountabilityIdx === 2) support += 2;

  const badWeekIdx = answers['q16'];
  if (badWeekIdx === 0) support += 4;
  else if (badWeekIdx === 1) support += 2;
  else if (badWeekIdx === 2) support += 1;
  // max: 6+4 = 10

  const overall = Math.min(100, consistency + strategy + readiness + support);
  return { overall, consistency, strategy, readiness, support };
}

function getTierForApi(score: number): string {
  if (score >= 85) return 'Top 10%';
  if (score >= 70) return 'Top 25%';
  if (score >= 55) return 'Top 45%';
  if (score >= 40) return 'Top 65%';
  return 'Top 80%';
}

function getBandLabel(score: number): string {
  if (score >= 85) return 'Genuinely battle-ready';
  if (score >= 70) return 'Almost there — gaps are showing';
  if (score >= 55) return 'Potential clear, system isn\'t';
  if (score >= 40) return 'Foundation there, structure missing';
  return 'Starting point identified';
}

// ─── Verdict (pattern-based, blunt, specific) ─────────────────────────────────

function getVerdict(answers: Record<string, number>, overall: number): string {
  const hours        = answers['q4'] ?? 2;
  const daysIdx      = answers['q5'];
  const accIdx       = answers['q15'];
  const targetIdx    = answers['q2'];
  const percentileIdx = answers['q12'];
  const errorIdx     = answers['q13'];
  const mocksIdx     = answers['q11'];

  if (hours >= 4 && daysIdx !== undefined && daysIdx <= 1)
    return "You're working hard on the wrong rhythm. Discipline, not effort, is your gap.";
  if (accIdx === 3 && overall >= 50)
    return "You've come this far alone. That's exactly why you're stuck.";
  if (mocksIdx === 0 || (mocksIdx !== undefined && mocksIdx >= 1 && errorIdx !== undefined && errorIdx >= 2))
    return "You're studying, not preparing. The gap is process, not effort.";
  if (targetIdx !== undefined && targetIdx >= 2 && percentileIdx !== undefined && percentileIdx <= 1)
    return `Your target says ${targetIdx === 3 ? '99+' : '95+'}%ile. Your current scores say otherwise. Closable — but not on autopilot.`;
  if (overall >= 80) return "You're on the right track. The marginal gains now are about process, not effort.";
  if (overall >= 65) return "Real strengths here — but 1–2 gaps are quietly costing you percentile points.";
  if (overall >= 50) return "You're preparing. You're not yet preparing to win.";
  if (overall >= 35) return "The foundation is there. The system that makes it consistent — that's what's missing.";
  return "Starting from clarity. That's the only starting point that actually leads somewhere.";
}

// ─── Diagnosis Cards (the conversion engine) ──────────────────────────────────

function getConsistencyInsight(answers: Record<string, number>): InsightData {
  const hours   = answers['q4'] ?? 2;
  const daysIdx = answers['q5'];
  const planIdx = answers['q7'];
  const daysLabel = daysIdx === 0 ? '3 or fewer' : daysIdx === 1 ? '4–7' : daysIdx === 2 ? '8–11' : '12–14';

  if (hours >= 4 && daysIdx !== undefined && daysIdx <= 1) return {
    tag: 'risk', title: 'Effort without consistency',
    body: `${hours} hrs/day sounds strong — but only ${daysLabel} study days in the last 2 weeks. CAT is won by showing up daily, not going hard occasionally. This is your #1 fixable gap.`,
  };
  if (planIdx === 3) return {
    tag: 'gap', title: 'Prep running on fumes',
    body: "No written study plan means your prep runs on motivation. Motivation runs out at Month 3 — a written plan doesn't. Structure beats willpower every time.",
  };
  if (daysIdx === 3 && hours >= 3) return {
    tag: 'strength', title: 'Your daily consistency is real',
    body: `${daysLabel} study days and ${hours} hrs/day — you're actually showing up. This is rarer than you think, and it's the foundation everything else sits on.`,
  };
  if (daysIdx !== undefined && daysIdx >= 2) return {
    tag: 'gap', title: 'Almost consistent — not quite locked',
    body: `${daysLabel} study days in 2 weeks — close to the daily habit, not quite there. The last few days of consistency are where most students quietly slip at the end of prep.`,
  };
  return {
    tag: 'risk', title: 'The consistency gap',
    body: `${daysLabel} study days in 2 weeks isn't enough to close the gap to your target. You don't need more motivation — you need a system that runs even when motivation doesn't.`,
  };
}

function getStrategyInsight(answers: Record<string, number>): InsightData {
  const mocksIdx    = answers['q11'];
  const errorIdx    = answers['q13'];
  const weakAreaIdx = answers['q14'];
  const weakLabels  = ['VARC', 'DILR', 'QA', 'time management', 'accuracy/silly errors'];

  if (mocksIdx === 0) return {
    tag: 'risk', title: 'No full-length mocks yet',
    body: "No full-length mocks means you're preparing in the dark — no feel for real time pressure, no data on where you actually lose marks. Mocks aren't optional; they're the training.",
  };
  if (mocksIdx !== undefined && mocksIdx >= 1 && errorIdx !== undefined && errorIdx >= 2) {
    const mockCount = mocksIdx === 1 ? '1–5' : mocksIdx === 2 ? '6–15' : '15+';
    return {
      tag: 'risk', title: 'Mocks without review',
      body: `${mockCount} mocks taken but ${errorIdx === 3 ? 'error analysis never done' : 'errors rarely reviewed'}. You're collecting wrong answers without fixing the patterns behind them. That's how you repeat the same mistakes across 10 mocks.`,
    };
  }
  if (weakAreaIdx === 5) return {
    tag: 'gap', title: "You don't know where you're losing",
    body: "Not knowing your weakest area is a strategy problem. CAT rewards smart selection — you can't build a strategy around a gap you haven't diagnosed.",
  };
  if (mocksIdx !== undefined && mocksIdx >= 2 && errorIdx === 0) return {
    tag: 'strength', title: 'Your process is right',
    body: `Taking mocks seriously and reviewing every error — you're doing what most skip.${weakAreaIdx !== undefined && weakAreaIdx !== 5 ? ` Knowing your weak area is ${weakLabels[weakAreaIdx]} means you can stop guessing and start targeting.` : ''} This discipline compounds over months.`,
  };
  return {
    tag: 'gap', title: 'The review habit needs depth',
    body: 'Mocks only work if you dig into every wrong answer. The score from the mock doesn\'t matter — what you learn from reviewing it does. One well-reviewed mock beats three ignored ones.',
  };
}

function getAccountabilityInsight(answers: Record<string, number>, overall: number): InsightData {
  const accIdx     = answers['q15'];
  const badWeekIdx = answers['q16'];
  const targetIdx  = answers['q2'];
  const targets    = ['below 90', '90–95', '95–99', '99+'];

  if (accIdx === 3 && targetIdx !== undefined && targetIdx >= 2) return {
    tag: 'risk', title: `Solo at the ${targets[targetIdx]}%ile level`,
    body: `Targeting ${targets[targetIdx]}%ile completely alone — every topper had someone who caught them when they slipped. Right now, when you go off-track, no one catches it. That's where the percentile points quietly disappear.`,
  };
  if (accIdx === 3 && badWeekIdx !== undefined && badWeekIdx >= 2) return {
    tag: 'risk', title: 'Solo, and bad weeks cost you',
    body: "When you have a bad week, momentum takes a week or more to come back — and you're recovering alone. That gap between slipping and getting back is where serious aspirants lose weeks of preparation.",
  };
  if (accIdx === 0) return {
    tag: 'strength', title: 'You have real accountability',
    body: 'A mentor or buddy actively tracking your preparation is a structural edge most aspirants don\'t have. The data is clear: accountability is the difference between consistent prep and inconsistent effort.',
  };
  if (accIdx === 2) return {
    tag: 'gap', title: 'Accountability — but not the right kind',
    body: "Family support matters — but they can't tell you whether your DILR strategy is off or your mocks need deeper error analysis. CAT-specific accountability from someone who's cracked it is a different thing entirely.",
  };
  if (accIdx === 3) return {
    tag: 'gap', title: 'Completely solo',
    body: 'Every serious CAT topper had someone — a buddy, a mentor — who knew when they slipped. Right now, you\'re catching your own slip-ups. At Month 4 of prep, that\'s harder than it sounds.',
  };
  return {
    tag: 'gap', title: 'The accountability gap',
    body: 'Peer support is real — but CAT-specific accountability from someone who\'s already cracked this exam and knows what slipping looks like is a different level entirely.',
  };
}

// ─── Components ───────────────────────────────────────────────────────────────

const TAG_STYLE: Record<InsightTag, { label: string; pill: string; border: string; bg: string }> = {
  strength: { label: 'Strength 🟢', pill: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  gap:      { label: 'Gap 🟠',      pill: 'bg-orange-100 text-orange-800',   border: 'border-orange-200',  bg: 'bg-orange-50'  },
  risk:     { label: 'Risk 🔴',     pill: 'bg-red-100 text-red-800',         border: 'border-red-200',     bg: 'bg-red-50'     },
};

function InsightCard({ tag, title, body }: InsightData) {
  const s = TAG_STYLE[tag];
  return (
    <div className={cn('rounded-2xl p-4 border', s.bg, s.border)}>
      <span className={cn('inline-block text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-2', s.pill)}>
        {s.label}
      </span>
      <p className="text-sm font-bold text-stone-900 mb-1">{title}</p>
      <p className="text-sm text-stone-700 leading-snug">{body}</p>
    </div>
  );
}

function RadioPills({ q, val, onSelect }: { q: RadioQ; val: number | undefined; onSelect: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {q.options.map((opt, i) => (
        <button key={i} type="button" onClick={() => onSelect(i)}
          className={cn(
            'px-3.5 py-2 rounded-full border-[1.5px] text-sm transition-all',
            val === i ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold' : 'border-stone-200 text-stone-700 hover:border-stone-400'
          )}
        >{opt}</button>
      ))}
    </div>
  );
}

function StarRating({ val, onSelect }: { val: number | undefined; onSelect: (v: number) => void }) {
  const v = val ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onSelect(n)}
          className={cn('text-2xl leading-none transition-opacity', v >= n ? 'opacity-100' : 'opacity-25 hover:opacity-60')}
        >⭐</button>
      ))}
      <span className="text-xs text-stone-400 ml-2">{v > 0 ? `${v}/5` : '1 = weak · 5 = strong'}</span>
    </div>
  );
}

function SliderInput({ q, val, onSelect }: { q: SliderQ; val: number; onSelect: (v: number) => void }) {
  return (
    <div>
      <div className="text-2xl font-black text-orange-600 text-center mb-2 font-mono">{q.fmt(val)}</div>
      <input type="range" min={q.min} max={q.max} step={q.step} value={val}
        onChange={e => onSelect(parseFloat(e.target.value))}
        className="w-full accent-orange-500 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-stone-400 mt-1.5">
        <span>0 hrs</span><span>5 hrs</span><span>10 hrs</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CatReadinessClient() {
  const [step, setStep] = useState<'quiz' | 'score'>('quiz');
  const [answers, setAnswers] = useState<Record<string, number>>({ q4: 2 });

  const [gateName, setGateName] = useState('');
  const [gatePhone, setGatePhone] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateUnlocked, setGateUnlocked] = useState(false);

  const answered = QS.filter(q => q.kind === 'slider' || answers[q.id] !== undefined).length;

  const { overall, consistency, strategy, readiness, support } = useMemo(() => computeScores(answers), [answers]);
  const tier    = useMemo(() => getTierForApi(overall), [overall]);
  const verdict = useMemo(() => getVerdict(answers, overall), [answers, overall]);
  const consistencyInsight    = useMemo(() => getConsistencyInsight(answers), [answers]);
  const strategyInsight       = useMemo(() => getStrategyInsight(answers), [answers]);
  const accountabilityInsight = useMemo(() => getAccountabilityInsight(answers, overall), [answers, overall]);

  const waNumber   = process.env.NEXT_PUBLIC_DEMO_WHATSAPP ?? '';
  const waMsg      = encodeURIComponent(`Hi, I just took the CAT Preparedness Check on CareerRai and scored ${overall}/100 (${tier}). I'd like my free 15-min buddy session.`);
  const whatsappUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMsg}` : null;
  const appInstallUrl = process.env.NEXT_PUBLIC_APP_INSTALL_URL ?? '#';

  function setAnswer(id: string, v: number) { setAnswers(prev => ({ ...prev, [id]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep('score');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gateName.trim()) { setGateError('Enter your name.'); return; }
    if (gatePhone.replace(/\D/g, '').length < 10) { setGateError('Enter a valid 10-digit phone number.'); return; }
    setGateSubmitting(true);
    setGateError(null);
    try {
      const res = await fetch('/api/cat-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName.trim(), phone: gatePhone.trim(), score: overall, tier }),
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

  // ── Score Screen ─────────────────────────────────────────────────────────────

  if (step === 'score') {
    return (
      <div className="min-h-screen bg-stone-50">

        {/* Hero — score + verdict, always visible */}
        <div className="bg-[#1A1A2E] px-5 py-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">CAT Preparedness Score</p>
          <div className="text-[88px] font-black text-orange-500 leading-none font-mono">{overall}</div>
          <div className="text-2xl font-bold text-stone-500 mt-1">/ 100</div>
          <div className="inline-block mt-3 px-3 py-1 bg-white/10 text-white/80 text-xs font-bold rounded-full border border-white/15">
            {getBandLabel(overall)}
          </div>
          <p className="mt-5 text-base font-semibold text-white leading-snug max-w-xs mx-auto">
            {verdict}
          </p>

          {/* Score bar breakdown — small, always visible */}
          <div className="mt-6 grid grid-cols-4 gap-2 max-w-sm mx-auto">
            {[
              { label: 'Consistency', val: consistency, max: 35 },
              { label: 'Strategy',    val: strategy,    max: 30 },
              { label: 'Readiness',   val: readiness,   max: 25 },
              { label: 'Support',     val: support,     max: 10 },
            ].map(({ label, val, max }) => {
              const pct = Math.round(val / max * 100);
              const color = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={label} className="text-center">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1">
                    <div className={cn('h-full rounded-full', color)} style={{ width:`${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-stone-500 font-medium">{label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">

          {/* Diagnosis cards — BLURRED until gate, this is the sales hook */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3 px-1">Your Diagnosis</p>
            <div className="relative">
              <div className={cn('space-y-3', !gateUnlocked && 'blur-sm pointer-events-none select-none')}>
                <InsightCard {...consistencyInsight} />
                <InsightCard {...strategyInsight} />
                <InsightCard {...accountabilityInsight} />
              </div>
              {!gateUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded-2xl px-6 py-5 shadow text-center">
                    <Lock className="w-5 h-5 mx-auto mb-2 text-stone-400" />
                    <p className="text-sm font-bold text-stone-900">Your diagnosis is locked</p>
                    <p className="text-xs text-stone-500 mt-0.5">Enter your name + phone below to read it</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* After unlock: reframe + sell */}
          {gateUnlocked && (
            <>
              <div className="bg-[#1A1A2E] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3">The truth</p>
                <p className="text-sm text-stone-300 leading-relaxed">
                  Here's what most won't tell you: you probably have the brain for CAT. What you're missing isn't intelligence — it's someone who keeps you consistent when motivation runs out. That's the whole game. And that's exactly what CareerRai is.
                </p>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600 mb-2">What CareerRai actually does</p>
                <p className="text-sm text-stone-700 leading-relaxed">
                  An IIM buddy who's already cracked CAT — tracking you daily like an elder sibling who actually gets it. Not coaching. Not content. Consistency, accountability, and honest strategy from someone who's been exactly where you are.
                </p>
              </div>
            </>
          )}

          {/* Gate form OR CTA */}
          {!gateUnlocked ? (
            <div className="bg-gradient-to-br from-teal-50 to-stone-50 border border-teal-200 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-stone-900 leading-snug mb-1" style={{ fontFamily:'Georgia, serif' }}>
                What does your score actually mean for you?
              </h2>
              <p className="text-sm text-stone-600 mb-5 leading-relaxed">
                Enter your details and we'll unlock your personalised diagnosis — plus set you up with a free 15-min session with an IIM buddy who's cracked CAT.
              </p>
              <form onSubmit={handleGateSubmit} className="space-y-3">
                <input type="text" autoComplete="name" value={gateName} onChange={e => setGateName(e.target.value)}
                  placeholder="Your name" required
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
                <input type="tel" inputMode="numeric" autoComplete="tel" value={gatePhone} onChange={e => setGatePhone(e.target.value)}
                  placeholder="10-digit mobile number" required
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
                {gateError && <p className="text-xs text-rose-600">{gateError}</p>}
                <button type="submit" disabled={gateSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-teal-700 hover:bg-teal-800 active:scale-[0.98] text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-60"
                >
                  {gateSubmitting ? 'Saving…' : 'Unlock my diagnosis + free session'}
                  {!gateSubmitting && <ArrowRight className="w-4 h-4" />}
                </button>
                <p className="text-center text-xs text-stone-400">Only used to set up your free session. No spam.</p>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Hero CTA */}
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-2xl p-5 text-center shadow-lg shadow-orange-600/20">
                <p className="text-base font-black text-white mb-1">Book a FREE demo session</p>
                <p className="text-xs text-orange-100 mb-4">with an IIM buddy who's already cracked CAT</p>
                {whatsappUrl ? (
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white text-orange-700 font-bold text-sm px-6 py-3 rounded-xl hover:bg-orange-50 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Book on WhatsApp — it's free
                  </a>
                ) : (
                  <p className="text-sm text-orange-200">WhatsApp booking coming soon</p>
                )}
              </div>

              {/* Secondary */}
              <p className="text-center text-xs text-stone-500">Opens WhatsApp — a buddy confirms within 24 hours.</p>
              <div className="text-center pt-1">
                <a href={appInstallUrl} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                  Already on CareerRai? Open the app →
                </a>
              </div>
            </div>
          )}

          {/* Shareable watermark */}
          <p className="text-center text-[10px] text-stone-300 pt-2">careerrai.com · CAT Preparedness Check</p>
        </div>
      </div>
    );
  }

  // ── Quiz Screen ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-[#1A1A2E] px-5 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center gap-3 pb-4">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0">CR</div>
          <div>
            <h1 className="text-white font-bold text-[15px] leading-tight">CAT Preparedness Check</h1>
            <p className="text-stone-400 text-xs mt-0.5">by CareerRai · ~4 minutes</p>
          </div>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width:`${(answered / QS.length) * 100}%` }} />
        </div>
        <p className="text-stone-400 text-[11px] text-right py-2">{answered} of {QS.length} answered</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-lg mx-auto px-4 pb-8">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div className="flex items-center gap-2.5 mt-7 mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0', section.bg)}>
                  {section.icon}
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-stone-500">{section.title}</p>
              </div>
              {section.qids.map(qid => {
                const q = QS.find(x => x.id === qid)!;
                const num = QS.indexOf(q) + 1;
                const val = answers[q.id];
                return (
                  <div key={qid} className="bg-white border border-stone-200 rounded-xl p-4 mb-3 focus-within:border-orange-300 transition-colors">
                    <p className="text-[15px] font-semibold text-stone-900 leading-snug mb-3.5">
                      <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-orange-500 text-white text-[11px] font-bold mr-2 align-middle shrink-0">
                        {num}
                      </span>
                      {q.text}
                    </p>
                    {q.kind === 'radio'  && <RadioPills  q={q} val={val} onSelect={v => setAnswer(q.id, v)} />}
                    {q.kind === 'stars'  && <StarRating   val={val} onSelect={v => setAnswer(q.id, v)} />}
                    {q.kind === 'slider' && <SliderInput  q={q} val={val ?? q.min} onSelect={v => setAnswer(q.id, v)} />}
                  </div>
                );
              })}
            </div>
          ))}

          <button type="submit"
            className="mt-6 w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-orange-600/25"
          >
            See my result <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-center text-xs text-stone-400 mt-3">Your answers are never shared publicly.</p>
        </div>
      </form>
    </div>
  );
}
