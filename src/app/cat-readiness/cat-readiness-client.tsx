'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Lock, ArrowRight, MessageCircle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

type InsightTag = 'strength' | 'gap' | 'risk';
interface InsightData { tag: InsightTag; title: string; body: string; }
interface Question { id: string; text: string; options: string[]; }

// ─── 20 Questions — 6 sections ────────────────────────────────────

const QS: Question[] = [
  // Section 1 — Background & Goal
  { id:'q1',  text:'Which attempt is this for you?',
    options:['1st attempt','2nd attempt','3rd attempt','4th+ attempt'] },
  { id:'q2',  text:"What's your target CAT percentile?",
    options:['Below 90','90–95','95–99','99+'] },
  { id:'q3',  text:'How long have you been actively preparing?',
    options:['Just started','1–3 months','3–6 months','6+ months'] },

  // Section 2 — Study Habits & Consistency
  { id:'q4',  text:'On average, how many hours do you study per day?',
    options:['Less than 1 hour','1–2 hours','2–4 hours','4+ hours'] },
  { id:'q5',  text:'In the past 2 weeks, how many days did you actually study?',
    options:['0–3 days','4–7 days','8–11 days','12–14 days'] },
  { id:'q6',  text:"What's your biggest reason for skipping study days?",
    options:['Fatigue / burnout','Distractions','No clear plan','Low motivation','Job / college load','I rarely skip'] },
  { id:'q7',  text:'Do you follow a written weekly study plan?',
    options:['Yes, and I stick to it','Yes, loosely','Only in my head','No plan at all'] },

  // Section 3 — Subject-wise Readiness
  { id:'q8',  text:'Rate your current readiness in VARC (Verbal Ability & Reading Comprehension)',
    options:['1 – Very weak','2 – Needs work','3 – Average','4 – Strong','5 – Very strong'] },
  { id:'q9',  text:'Rate your current readiness in DILR (Data Interpretation & Logical Reasoning)',
    options:['1 – Very weak','2 – Needs work','3 – Average','4 – Strong','5 – Very strong'] },
  { id:'q10', text:'Rate your current readiness in QA (Quantitative Aptitude)',
    options:['1 – Very weak','2 – Needs work','3 – Average','4 – Strong','5 – Very strong'] },

  // Section 4 — Mock Tests & Error Analysis
  { id:'q11', text:'How many full-length mock tests have you taken so far?',
    options:['None yet','1–5','6–15','15+'] },
  { id:'q12', text:"Your best recent mock percentile (or score if no percentile yet)?",
    options:["No mock taken yet",'Below 80%ile','80–90%ile','90–95%ile','95%ile+'] },
  { id:'q13', text:'After each mock, do you do a detailed error analysis?',
    options:['Always — every question','Sometimes','Rarely','Never done this'] },
  { id:'q14', text:'Which area causes the most score drop in your mocks?',
    options:['VARC','DILR','QA','Time management','Accuracy / silly errors',"Don't know yet"] },

  // Section 5 — Accountability & Support
  { id:'q15', text:'Do you have anyone actively tracking your preparation?',
    options:['Yes — a mentor or buddy','A friend / peer group','Family only','Completely solo'] },
  { id:'q16', text:'When you have a bad week, what do you usually do?',
    options:['Reset and bounce back fast','Talk to someone and recalibrate','Slow down for a few days','Spiral into self-doubt'] },
  { id:'q17', text:"Have you identified a specific mentor — someone who cleared CAT in the last 3 years — to guide you?",
    options:['Yes, and they\'re actively involved','Yes, but only occasionally','No, but I\'m looking for one','No, and I don\'t feel I need one'] },

  // Section 6 — Mental Readiness
  { id:'q18', text:'How anxious are you about CAT right now?',
    options:['1 — Zero stress, completely calm','2 — A little nervous, manageable','3 — Moderate anxiety, some impact','4 — High anxiety, it\'s affecting me','5 — Extremely anxious, paralysed'] },
  { id:'q19', text:'Honestly — do you believe you\'ll hit your target percentile this attempt?',
    options:['Yes, fully confident','Mostly yes, working on it','Not sure yet','Honestly, no'] },
  { id:'q20', text:'What is your single biggest fear about this attempt?',
    options:['Repeating the same mistake as before','Not staying consistent till CAT day','Score not improving despite effort','What others will think if I don\'t make it','Going blank on exam day','No real fear — I\'m ready'] },
];

const SECTIONS = [
  { title:'Background & Goal',          icon:'🎯', qids:['q1','q2','q3'] },
  { title:'Study Habits & Consistency', icon:'📅', qids:['q4','q5','q6','q7'] },
  { title:'Subject-wise Readiness',     icon:'📚', qids:['q8','q9','q10'] },
  { title:'Mock Tests & Error Analysis',icon:'📝', qids:['q11','q12','q13','q14'] },
  { title:'Accountability & Support',   icon:'🤝', qids:['q15','q16','q17'] },
  { title:'Mental Readiness',           icon:'🧠', qids:['q18','q19','q20'] },
];

// ─── Scoring (Consistency 40 / Strategy 40 / Support 20 = 100) ─────────────────

function computeScores(answers: Record<string, number>) {
  // CONSISTENCY (max 40)
  let consistency = 0;
  const hoursIdx = answers['q4'];
  if (hoursIdx === 1) consistency += 5;
  else if (hoursIdx === 2) consistency += 12;
  else if (hoursIdx === 3) consistency += 16;

  const daysIdx = answers['q5'];
  if (daysIdx === 1) consistency += 5;
  else if (daysIdx === 2) consistency += 12;
  else if (daysIdx === 3) consistency += 16;

  const planIdx = answers['q7'];
  if (planIdx === 0) consistency += 8;
  else if (planIdx === 1) consistency += 5;
  else if (planIdx === 2) consistency += 2;
  // max: 16+16+8 = 40

  // STRATEGY (max 40)
  let strategy = 0;
  const mocksIdx = answers['q11'];
  if (mocksIdx === 1) strategy += 4;
  else if (mocksIdx === 2) strategy += 8;
  else if (mocksIdx === 3) strategy += 10;

  const percentileIdx = answers['q12'];
  if (percentileIdx === 1) strategy += 1;
  else if (percentileIdx === 2) strategy += 3;
  else if (percentileIdx === 3) strategy += 6;
  else if (percentileIdx === 4) strategy += 8;

  const errorIdx = answers['q13'];
  if (errorIdx === 0) strategy += 8;
  else if (errorIdx === 1) strategy += 5;
  else if (errorIdx === 2) strategy += 2;

  // Q14: knowing your weak area (not "don't know yet" = idx 5) = +4
  const weakAreaIdx = answers['q14'];
  if (weakAreaIdx !== undefined && weakAreaIdx !== 5) strategy += 4;

  // Subject confidence: q8+q9+q10 each 0–4 (maps to 1–5), total 0–12 → scaled 0–10
  const varcRating = answers['q8']  ?? 0;
  const dilrRating = answers['q9']  ?? 0;
  const qaRating   = answers['q10'] ?? 0;
  strategy += Math.round(((varcRating + dilrRating + qaRating) / 12) * 10);
  // max: 10+8+8+4+10 = 40

  // SUPPORT (max 20)
  let support = 0;
  const accIdx = answers['q15'];
  if (accIdx === 0) support += 8;
  else if (accIdx === 1) support += 5;
  else if (accIdx === 2) support += 2;

  const badWeekIdx = answers['q16'];
  if (badWeekIdx === 0) support += 4;
  else if (badWeekIdx === 1) support += 3;
  else if (badWeekIdx === 2) support += 1;

  const mentorIdx = answers['q17'];
  if (mentorIdx === 0) support += 4;
  else if (mentorIdx === 1) support += 2;
  else if (mentorIdx === 2) support += 1;

  // Q19: belief in hitting target
  const beliefIdx = answers['q19'];
  if (beliefIdx === 0) support += 4;
  else if (beliefIdx === 1) support += 2;
  else if (beliefIdx === 2) support += 1;
  // max: 8+4+4+4 = 20

  const overall = Math.min(100, consistency + strategy + support);
  return { overall, consistency, strategy, support };
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
  if (score >= 55) return "Potential clear, system isn't";
  if (score >= 40) return 'Foundation there, structure missing';
  return 'Starting point identified';
}

function getVerdict(answers: Record<string, number>, overall: number): string {
  const daysIdx   = answers['q5'];
  const accIdx    = answers['q15'];
  const targetIdx = answers['q2'];
  const errorIdx  = answers['q13'];
  const mocksIdx  = answers['q11'];
  const beliefIdx = answers['q19'];

  if (daysIdx !== undefined && daysIdx <= 1 && overall >= 30)
    return "Discipline, not effort, is your gap. You know what to do — you're just not doing it every day.";
  if (accIdx === 3 && overall >= 50)
    return "You've come this far alone. That's exactly why you're stuck.";
  if (mocksIdx === 0 || (mocksIdx !== undefined && mocksIdx >= 1 && errorIdx !== undefined && errorIdx >= 2))
    return "You're studying, not preparing. The gap is process, not effort.";
  if (targetIdx !== undefined && targetIdx >= 2 && overall <= 45)
    return `Your target says ${targetIdx === 3 ? '99+' : '95+'}%ile. Your habits say otherwise. Closable — but not on autopilot.`;
  if (beliefIdx !== undefined && beliefIdx >= 2 && overall >= 50)
    return "The score says you're capable. The doubt is the real thing to fix.";
  if (overall >= 80) return "You're on the right track. The marginal gains now are about process, not effort.";
  if (overall >= 65) return "Real strengths here — but 1–2 gaps are quietly costing you percentile points.";
  if (overall >= 50) return "You're preparing. You're not yet preparing to win.";
  if (overall >= 35) return "The foundation is there. The system that makes it consistent — that's what's missing.";
  return "Starting from clarity. That's the only starting point that actually leads somewhere.";
}

// ─── Derive primary weakness for admin targeting ─────────────────────────────

function getPrimaryWeakSection(
  answers: Record<string, number>,
  consistency: number,
  strategy: number,
  support: number,
): string {
  const varc = answers['q8'] ?? 0;
  const dilr = answers['q9'] ?? 0;
  const qa   = answers['q10'] ?? 0;

  // Subject weakness first (very weak = rating idx 0 or 1 out of 4)
  if (varc === 0 || (varc <= 1 && varc <= dilr && varc <= qa)) return 'VARC';
  if (dilr === 0 || (dilr <= 1 && dilr <= varc && dilr <= qa)) return 'DILR';
  if (qa   === 0 || (qa   <= 1 && qa   <= varc && qa   <= dilr)) return 'QA';

  // Lowest section percentage
  const cPct = consistency / 40;
  const sPct = strategy / 40;
  const aPct = support / 20;
  const min  = Math.min(cPct, sPct, aPct);
  if (min === cPct) return 'Consistency';
  if (min === sPct) return 'Strategy';
  return 'Accountability';
}

// ─── Personalised Diagnosis Cards ──────────────────────────────────────────────

function getConsistencyInsight(answers: Record<string, number>): InsightData {
  const hoursIdx = answers['q4'];
  const daysIdx  = answers['q5'];
  const planIdx  = answers['q7'];
  const daysLabel = daysIdx === 0 ? '3 or fewer' : daysIdx === 1 ? '4–7' : daysIdx === 2 ? '8–11' : '12–14';

  if (planIdx === 3) return {
    tag: 'risk', title: 'Prep running on willpower',
    body: "No written study plan means your prep runs on motivation. Motivation runs out at Month 3 — a written plan doesn't. Structure beats willpower every time.",
  };
  if (hoursIdx !== undefined && hoursIdx <= 1 && daysIdx !== undefined && daysIdx <= 1) return {
    tag: 'risk', title: 'The consistency gap',
    body: "Less than 2 hours a day and fewer than 7 study days in the last 2 weeks — this gap compounds daily. You don't need more motivation; you need a system that shows up even when you don't feel like it.",
  };
  if (daysIdx !== undefined && daysIdx <= 1) return {
    tag: 'risk', title: 'The consistency gap',
    body: `${daysLabel} study days in 2 weeks isn't enough to close the gap to your target. You don't need more motivation — you need a system that runs even when motivation doesn't.`,
  };
  if (hoursIdx !== undefined && hoursIdx <= 1) return {
    tag: 'gap', title: 'Study hours are low',
    body: "You're showing up — but under 2 hours a day won't build the stamina CAT demands. It's not about grinding 8 hours; it's about consistent focused blocks, every single day.",
  };
  if (daysIdx === 3 && planIdx === 0) return {
    tag: 'strength', title: 'Your daily consistency is real',
    body: `${daysLabel} study days with a written plan — you're actually showing up, with structure. This is rarer than you think, and it's the foundation everything else sits on.`,
  };
  if (daysIdx !== undefined && daysIdx >= 2) return {
    tag: 'gap', title: 'Almost consistent — not quite locked',
    body: `${daysLabel} study days in 2 weeks — close to the daily habit, not quite there. The last few days of consistency are where most aspirants quietly slip.`,
  };
  return {
    tag: 'gap', title: 'Inconsistent rhythm',
    body: "Your prep has gaps that compound over time. CAT is a marathon — the students who win are the ones who show up on the hard days, not just the motivated ones.",
  };
}

function getStrategyInsight(answers: Record<string, number>): InsightData {
  const mocksIdx      = answers['q11'];
  const percentileIdx = answers['q12'];
  const errorIdx      = answers['q13'];
  const weakAreaIdx   = answers['q14'];
  const weakLabels    = ['VARC', 'DILR', 'QA', 'time management', 'accuracy errors'];

  if (mocksIdx === 0) return {
    tag: 'risk', title: 'No full-length mocks yet',
    body: "No mocks means you're preparing in the dark — no real time pressure, no data on where you lose marks. Mocks aren't optional; they're the whole training.",
  };
  if (mocksIdx !== undefined && mocksIdx >= 1 && errorIdx !== undefined && errorIdx >= 2) {
    const mockCount = mocksIdx === 1 ? '1–5' : mocksIdx === 2 ? '6–15' : '15+';
    return {
      tag: 'risk', title: 'Mocks without review',
      body: `${mockCount} mocks taken but errors ${errorIdx === 3 ? 'never reviewed' : 'rarely reviewed'}. You're collecting wrong answers without fixing the patterns behind them. Same mistakes, 10 mocks in.`,
    };
  }
  if (weakAreaIdx === 5) return {
    tag: 'gap', title: "You don't know where you're losing",
    body: "Not knowing your weakest section is a strategy problem. CAT rewards smart selection — you can't build a strategy around a gap you haven't diagnosed.",
  };
  if (mocksIdx !== undefined && mocksIdx >= 2 && errorIdx === 0) return {
    tag: 'strength', title: 'Your mock process is right',
    body: `Taking mocks seriously and reviewing every error — you're doing what most skip.${weakAreaIdx !== undefined && weakAreaIdx !== 5 ? ` Knowing your weak area is ${weakLabels[weakAreaIdx]} means you can stop guessing and start targeting.` : ''} This discipline compounds.`,
  };
  if (percentileIdx !== undefined && percentileIdx >= 3) return {
    tag: 'strength', title: 'Your mock scores show real progress',
    body: `A best mock percentile of ${percentileIdx === 3 ? '90–95' : '95+'}%ile — you're in the range. The gap now is consistency of that performance, not capability.`,
  };
  return {
    tag: 'gap', title: 'The review habit needs depth',
    body: "Mocks only work if you dig into every wrong answer. The score from the mock doesn't matter — what you learn from reviewing it does. One well-reviewed mock beats three ignored ones.",
  };
}

function getAccountabilityInsight(answers: Record<string, number>, overall: number): InsightData {
  const accIdx     = answers['q15'];
  const badWeekIdx = answers['q16'];
  const targetIdx  = answers['q2'];
  const targets    = ['below 90', '90–95', '95–99', '99+'];

  if (accIdx === 3 && targetIdx !== undefined && targetIdx >= 2) return {
    tag: 'risk', title: `Solo at the ${targets[targetIdx]}%ile level`,
    body: `Targeting ${targets[targetIdx]}%ile completely alone — every topper had someone who caught them when they slipped. When you go off-track, no one catches it. That's where the percentile points quietly disappear.`,
  };
  if (accIdx === 3 && badWeekIdx !== undefined && badWeekIdx >= 2) return {
    tag: 'risk', title: 'Solo and struggling after setbacks',
    body: "You're going at it alone — and bad weeks hit hard. That's a dangerous combination. Accountability doesn't just track your progress; it's what gets you back up when you fall.",
  };
  if (accIdx === 3) return {
    tag: 'risk', title: 'Completely solo',
    body: `You've reached ${overall}/100 alone. The next 20 percentile points are where solo aspirants plateau — the gaps shift from content to consistency and strategy, and those are hard to diagnose yourself.`,
  };
  if (accIdx === 0) return {
    tag: 'strength', title: 'You have real accountability',
    body: "A mentor or buddy actively tracking your preparation is a structural edge most aspirants don't have. Accountability is the difference between consistent prep and inconsistent effort.",
  };
  if (accIdx === 2) return {
    tag: 'gap', title: 'Support — but not the right kind',
    body: "Family support matters — but they can't tell you whether your DILR strategy is off or your mocks need deeper review. CAT-specific accountability from someone who's cracked it is a different thing entirely.",
  };
  return {
    tag: 'gap', title: 'The accountability gap',
    body: "Peer support is real — but CAT-specific accountability from someone who's already cracked this exam is a different level. They know exactly what slipping looks like because they've been there.",
  };
}

function getMentalInsight(answers: Record<string, number>): InsightData | null {
  const anxietyIdx = answers['q18'];
  const beliefIdx  = answers['q19'];
  const fearIdx    = answers['q20'];

  if (anxietyIdx !== undefined && anxietyIdx >= 3) return {
    tag: 'risk', title: 'Anxiety is costing you performance',
    body: "High exam anxiety at this stage hurts performance more than low content coverage. The preparation gap and the mental gap need to be fixed together — not separately.",
  };
  if (beliefIdx !== undefined && beliefIdx >= 2) return {
    tag: 'gap', title: "Doubt is the hidden gap",
    body: "Not fully believing you'll hit your target affects how hard you push, how consistent you are, and how you recover from bad mocks. A clear plan — one that actually addresses your gaps — is what converts doubt into belief.",
  };
  if (fearIdx === 0) return {
    tag: 'gap', title: "Same mistake risk — unaddressed",
    body: "Fear of repeating the same mistake is only a risk if you haven't diagnosed what that mistake actually was. A post-mortem of your last attempt is not optional — it's the foundation of this one.",
  };
  if (fearIdx === 1) return {
    tag: 'gap', title: "Consistency fear is self-aware — now fix it",
    body: "Knowing that consistency is your fear is half the battle. The other half is building a system that doesn't rely on willpower — daily check-ins, a written plan, and someone watching.",
  };
  if (beliefIdx === 0 && (anxietyIdx === undefined || anxietyIdx <= 1)) return {
    tag: 'strength', title: "Mentally solid",
    body: "Low anxiety and full belief in your target — the mental game is right. This is rarer than you think. Protect it by making sure the preparation underneath earns that confidence.",
  };
  return null;
}

// ─── UI Components ──────────────────────────────────────────────────

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

function RadioPills({ q, val, onSelect }: { q: Question; val: number | undefined; onSelect: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {q.options.map((opt, i) => (
        <button key={i} type="button" onClick={() => onSelect(i)}
          className={cn(
            'px-3.5 py-2 rounded-full border-[1.5px] text-sm transition-all',
            val === i
              ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
              : 'border-stone-200 text-stone-700 hover:border-stone-400'
          )}
        >{opt}</button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function CatReadinessClient() {
  const [step, setStep] = useState<'intro' | 'quiz' | 'score'>('intro');
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const [gateName, setGateName]           = useState('');
  const [gatePhone, setGatePhone]         = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError]         = useState<string | null>(null);
  const [gateUnlocked, setGateUnlocked]   = useState(false);

  const answered = QS.filter(q => answers[q.id] !== undefined).length;
  const total    = QS.length;

  const { overall, consistency, strategy, support } = useMemo(() => computeScores(answers), [answers]);
  const tier                  = useMemo(() => getTierForApi(overall), [overall]);
  const verdict               = useMemo(() => getVerdict(answers, overall), [answers, overall]);
  const consistencyInsight    = useMemo(() => getConsistencyInsight(answers), [answers]);
  const strategyInsight       = useMemo(() => getStrategyInsight(answers), [answers]);
  const accountabilityInsight = useMemo(() => getAccountabilityInsight(answers, overall), [answers, overall]);
  const mentalInsight         = useMemo(() => getMentalInsight(answers), [answers]);

  const waNumber    = process.env.NEXT_PUBLIC_DEMO_WHATSAPP ?? '';
  const waMsg       = encodeURIComponent(`Hi! I just took the CareerRai CAT assessment and scored ${overall}/100. I'd like to claim my free IIM buddy session.`);
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
    const phoneDigits = gatePhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10 || !/^[6-9]/.test(phoneDigits)) {
      setGateError('Enter a valid 10-digit mobile number.');
      return;
    }
    setGateSubmitting(true);
    setGateError(null);
    try {
      // VARC/DILR/QA: stored 1-indexed (idx 0 = rating 1)
      const varcRating = (answers['q8']  ?? 0) + 1;
      const dilrRating = (answers['q9']  ?? 0) + 1;
      const qaRating   = (answers['q10'] ?? 0) + 1;
      const weakSection = getPrimaryWeakSection(answers, consistency, strategy, support);

      const res = await fetch('/api/cat-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gateName.trim(),
          phone: phoneDigits,
          score: overall,
          tier,
          consistency_score: consistency,
          strategy_score: strategy,
          support_score: support,
          varc_rating: varcRating,
          dilr_rating: dilrRating,
          qa_rating: qaRating,
          weak_section: weakSection,
          anxiety_idx: answers['q18'] ?? null,
          belief_idx: answers['q19'] ?? null,
        }),
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

  const primaryInsight =
    consistencyInsight.tag === 'risk' ? consistencyInsight :
    strategyInsight.tag    === 'risk' ? strategyInsight    :
    accountabilityInsight.tag === 'risk' ? accountabilityInsight :
    consistencyInsight;

  // ── INTRO SCREEN ───────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex flex-col">
        <div className="px-5 pt-6 flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0">CR</div>
          <p className="text-stone-400 text-sm font-medium">CareerRai</p>
        </div>

        <div className="flex-1 flex flex-col justify-center px-5 py-10 max-w-sm mx-auto w-full">
          <div className="flex justify-center mb-6">
            <span className="bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              100% Free
            </span>
          </div>

          <h1 className="text-[28px] font-black text-white text-center leading-tight mb-3" style={{ fontFamily:'Georgia, serif' }}>
            Claim your free<br />
            <span className="text-orange-500">IIM buddy session</span>
          </h1>

          <p className="text-stone-400 text-sm text-center leading-relaxed mb-8">
            Answer {total} quick questions so we match you with the right IIM buddy. Takes about 4 minutes.
          </p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 space-y-3">
            {[
              { icon:'📊', text:"Your CAT readiness score with an honest breakdown" },
              { icon:'🎯', text:"Personalised diagnosis — what's actually holding you back" },
              { icon:'🤝', text:"Free 15-min session with an IIM buddy who's cracked CAT" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="text-base shrink-0 mt-0.5">{icon}</span>
                <p className="text-sm text-stone-300 leading-snug">{text}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep('quiz')}
            className="w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-orange-600/25"
          >
            Claim my free session <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-center text-xs text-stone-600 mt-3">{total} quick taps · ~4 minutes · no spam</p>
        </div>
      </div>
    );
  }

  // ── SCORE SCREEN ───────────────────────────────────────────────────────────────
  if (step === 'score') {
    return (
      <div className="min-h-screen bg-stone-50">
        <div className="bg-[#1A1A2E] px-5 py-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">CAT Readiness Score</p>
          <div className="text-[88px] font-black text-orange-500 leading-none font-mono">{overall}</div>
          <div className="text-2xl font-bold text-stone-500 mt-1">/ 100</div>
          <div className="inline-block mt-3 px-3 py-1 bg-white/10 text-white/80 text-xs font-bold rounded-full border border-white/15">
            {getBandLabel(overall)}
          </div>
          <p className="mt-5 text-base font-semibold text-white leading-snug max-w-xs mx-auto">{verdict}</p>

          <div className="mt-6 grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {[
              { label:'Consistency', val:consistency, max:40 },
              { label:'Strategy',    val:strategy,    max:40 },
              { label:'Support',     val:support,     max:20 },
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

          {/* Diagnosis — blurred until gate */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3 px-1">Your Diagnosis</p>
            <div className="relative">
              <div className={cn('space-y-3', !gateUnlocked && 'blur-sm pointer-events-none select-none')}>
                <InsightCard {...consistencyInsight} />
                <InsightCard {...strategyInsight} />
                <InsightCard {...accountabilityInsight} />
                {mentalInsight && <InsightCard {...mentalInsight} />}
              </div>
              {!gateUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded-2xl px-6 py-5 shadow text-center">
                    <Lock className="w-5 h-5 mx-auto mb-2 text-stone-400" />
                    <p className="text-sm font-bold text-stone-900">Your full diagnosis is ready</p>
                    <p className="text-xs text-stone-500 mt-0.5">Add your details below to see it</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* After unlock: reframe blocks */}
          {gateUnlocked && (
            <>
              <div className="bg-[#1A1A2E] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3">The real gap</p>
                <p className="text-sm text-stone-300 leading-relaxed">
                  You probably have the brain for CAT. What you&apos;re missing isn&apos;t intelligence — it&apos;s someone who keeps you consistent when motivation runs out. That&apos;s the whole game. And that&apos;s exactly what an IIM buddy does.
                </p>
              </div>
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600 mb-2">What CareerRai is</p>
                <p className="text-sm text-stone-700 leading-relaxed">
                  An IIM buddy tracking you daily — like an elder sibling who&apos;s already cracked CAT. Not coaching. Not content. Consistency, accountability, and honest strategy from someone who&apos;s been exactly where you are.
                </p>
              </div>
            </>
          )}

          {/* Gate OR post-unlock CTA */}
          {!gateUnlocked ? (
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-6">
              <h2 className="text-lg font-black text-stone-900 leading-snug mb-1" style={{ fontFamily:'Georgia, serif' }}>
                Claim your free IIM buddy session
              </h2>
              <p className="text-sm text-stone-600 mb-5 leading-relaxed">
                Enter your details to see your full personalised diagnosis and book a free 15-min session with an IIM buddy who&apos;s cracked CAT.
              </p>
              <form onSubmit={handleGateSubmit} className="space-y-3">
                <input
                  type="text" autoComplete="name" value={gateName}
                  onChange={e => setGateName(e.target.value)}
                  placeholder="Your name" required
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="tel" inputMode="numeric" autoComplete="tel" value={gatePhone}
                  onChange={e => setGatePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number" required maxLength={10}
                  className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
                {gateError && <p className="text-xs text-rose-600">{gateError}</p>}
                <button
                  type="submit" disabled={gateSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 font-bold text-sm rounded-xl transition-all disabled:opacity-60 shadow-lg shadow-orange-600/20 text-white active:scale-[0.98]"
                  style={{ background:'linear-gradient(90deg,#ea580c,#d97706)' }}
                >
                  {gateSubmitting ? 'Saving…' : 'Claim my free IIM buddy session'}
                  {!gateSubmitting && <ArrowRight className="w-4 h-4" />}
                </button>
                <p className="text-center text-xs text-stone-400">Only used to set up your free session. No spam.</p>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 border bg-orange-50 border-orange-200">
                <p className="text-[11px] font-bold text-orange-700 uppercase tracking-wide mb-1">Your session is matched to your gap</p>
                <p className="text-sm text-stone-800 leading-snug">
                  Your biggest gap is <strong>{primaryInsight.title.toLowerCase()}</strong>. Your IIM buddy session is designed to fix exactly that — not generic advice, your specific situation.
                </p>
              </div>

              <div className="rounded-2xl p-5 text-center shadow-lg shadow-orange-600/20 text-white" style={{ background:'linear-gradient(135deg,#ea580c,#d97706)' }}>
                <p className="text-base font-black mb-1">Claim my free IIM buddy session</p>
                <p className="text-xs text-orange-100 mb-4">15 minutes · someone who&apos;s cracked CAT · 100% free</p>
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white text-orange-700 font-bold text-sm px-6 py-3 rounded-xl hover:bg-orange-50 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Book on WhatsApp — free
                  </a>
                ) : (
                  <p className="text-sm text-orange-200">We&apos;ll WhatsApp you within 24 hours to book your session.</p>
                )}
              </div>

              <p className="text-center text-xs text-stone-500">Opens WhatsApp — a buddy confirms within 24 hours.</p>
              <div className="text-center pt-1">
                <a href={appInstallUrl} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                  Already on CareerRai? Open the app →
                </a>
              </div>
            </div>
          )}

          <p className="text-center text-[10px] text-stone-300 pt-2">careerrai.com · CAT Readiness Check</p>
        </div>
      </div>
    );
  }

  // ── QUIZ SCREEN ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-[#1A1A2E] px-5 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center gap-3 pb-4">
          <button
            type="button" onClick={() => setStep('intro')}
            className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0"
          >CR</button>
          <div>
            <h1 className="text-white font-bold text-[15px] leading-tight">CAT Preparedness Check</h1>
            <p className="text-stone-400 text-xs mt-0.5">CareerRai · 20 questions · ~4 minutes</p>
          </div>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width:`${(answered / total) * 100}%` }} />
        </div>
        <p className="text-stone-400 text-[11px] text-right py-2">{answered} of {total} answered</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-lg mx-auto px-4 pb-8">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div className="flex items-center gap-2.5 mt-7 mb-3">
                <span className="text-base">{section.icon}</span>
                <p className="text-xs font-bold uppercase tracking-widest text-stone-500">{section.title}</p>
              </div>
              {section.qids.map(qid => {
                const q   = QS.find(x => x.id === qid)!;
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
                    <RadioPills q={q} val={val} onSelect={v => setAnswer(q.id, v)} />
                  </div>
                );
              })}
            </div>
          ))}

          <button
            type="submit"
            className="mt-6 w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-orange-600/25"
          >
            See my CAT readiness score <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-center text-xs text-stone-400 mt-3">Your answers are private. Never shared publicly.</p>
        </div>
      </form>
    </div>
  );
}
