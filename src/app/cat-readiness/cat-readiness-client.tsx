'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Lock, ArrowRight, MessageCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Area = 'study_habits' | 'subject_readiness' | 'mock_mastery' | 'mindset';

interface RadioQ { kind: 'radio'; id: string; text: string; area: Area | null; options: string[]; scores: number[]; }
interface StarsQ  { kind: 'stars';  id: string; text: string; area: Area; }
interface SliderQ { kind: 'slider'; id: string; text: string; area: Area; min: number; max: number; step: number; maxScore: number; scoreOf: (v: number) => number; fmt: (v: number) => string; }
type Question = RadioQ | StarsQ | SliderQ;

// ─── Question Data ────────────────────────────────────────────────────────────

const QS: Question[] = [
  { kind:'radio', id:'q1',  area:null,               text:'Which attempt is this for you?',                                                              options:['1st attempt','2nd attempt','3rd attempt','4th+ attempt'],                                                                         scores:[0,0,0,0] },
  { kind:'radio', id:'q2',  area:null,               text:"What's your target CAT percentile?",                                                          options:['Below 90','90–95','95–99','99+'],                                                                                               scores:[0,0,0,0] },
  { kind:'radio', id:'q3',  area:'study_habits',     text:'How long have you been actively preparing?',                                                   options:['Just started','1–3 months','3–6 months','6+ months'],                                                                           scores:[0,1,2,3] },
  { kind:'slider',id:'q4',  area:'study_habits',     text:'How many hours do you study per day on average?',                                              min:0, max:10, step:0.5, maxScore:5, scoreOf:(v)=>Math.min(5,Math.round(v)), fmt:(v)=>`${v} hrs` },
  { kind:'radio', id:'q5',  area:'study_habits',     text:'In the past 2 weeks, how many days did you actually study?',                                   options:['0–3 days','4–7 days','8–11 days','12–14 days'],                                                                                 scores:[0,1,2,3] },
  { kind:'radio', id:'q6',  area:'study_habits',     text:"What's your biggest reason for skipping study days?",                                          options:['Fatigue / burnout','Distractions','No clear plan','Low motivation','Job / college load','I rarely skip'],                     scores:[1,1,1,2,2,3] },
  { kind:'radio', id:'q7',  area:'study_habits',     text:'Do you follow a written weekly study plan?',                                                   options:['Yes, and I stick to it','Yes, loosely','Only in my head','No plan at all'],                                                   scores:[3,2,1,0] },
  { kind:'stars', id:'q8',  area:'subject_readiness',text:'Rate your current readiness in VARC (Verbal Ability & Reading Comprehension)' },
  { kind:'stars', id:'q9',  area:'subject_readiness',text:'Rate your current readiness in DILR (Data Interpretation & Logical Reasoning)' },
  { kind:'stars', id:'q10', area:'subject_readiness',text:'Rate your current readiness in QA (Quantitative Aptitude)' },
  { kind:'radio', id:'q11', area:'mock_mastery',     text:'How many full-length mock tests have you taken so far?',                                       options:['None yet','1–5','6–15','15+'],                                                                                                   scores:[0,1,2,3] },
  { kind:'radio', id:'q12', area:'mock_mastery',     text:'Your best recent mock percentile?',                                                            options:['No mock yet','Below 80%ile','80–90%ile','90–95%ile','95%ile+'],                                                              scores:[0,1,2,3,4] },
  { kind:'radio', id:'q13', area:'mock_mastery',     text:'After each mock, do you do a detailed error analysis?',                                        options:['Always — every question','Sometimes','Rarely','Never done this'],                                                             scores:[3,2,1,0] },
  { kind:'radio', id:'q14', area:null,               text:'Which area causes the most score drop in your mocks?',                                         options:['VARC','DILR','QA','Time management','Accuracy / silly errors',"Don't know yet"],                                             scores:[0,0,0,0,0,0] },
  { kind:'radio', id:'q15', area:'mindset',          text:'Do you have anyone actively tracking your preparation?',                                       options:['Yes — a mentor/buddy','A friend / peer group','Family only','Completely solo'],                                               scores:[3,2,1,0] },
  { kind:'radio', id:'q16', area:'mindset',          text:'When you have a bad week, what do you usually do?',                                            options:['Analyse it and reset the plan immediately','Feel off for a few days, then push back','Lose momentum for a week or more','It derails my prep significantly'], scores:[3,2,1,0] },
  { kind:'radio', id:'q17', area:'mindset',          text:'How would you describe your daily study environment?',                                         options:['Dedicated, distraction-free space','Mostly quiet, minor interruptions','Inconsistent — varies a lot','Frequently interrupted or noisy'],          scores:[3,2,1,0] },
  { kind:'radio', id:'q18', area:'mindset',          text:'In a typical study session, how often are you genuinely focused (phone away, no mid-topic breaks)?', options:['Almost always — deep work blocks','More often than not','About half the time','Rarely — lots of distractions'],   scores:[3,2,1,0] },
  { kind:'radio', id:'q19', area:'mindset',          text:'When you score below your target in a mock, how quickly do you reset mentally?',               options:['Same day — I analyse and move on','A day or two','About a week',"I haven't fully recovered from my last bad mock"],         scores:[3,2,1,0] },
  { kind:'radio', id:'q20', area:'mindset',          text:"Do you revise the previous day's material before starting each new session?",                  options:['Yes, always — 10–15 min spaced revision','Usually','Rarely','No'],                                                           scores:[3,2,1,0] },
];

const SECTIONS = [
  { title:'Background & Goal',           icon:'🎯', bg:'bg-orange-50', qids:['q1','q2'] },
  { title:'Study Habits & Consistency',  icon:'📅', bg:'bg-teal-50',   qids:['q3','q4','q5','q6','q7'] },
  { title:'Subject-wise Readiness',      icon:'📚', bg:'bg-stone-100', qids:['q8','q9','q10'] },
  { title:'Mock Tests & Error Analysis', icon:'📝', bg:'bg-purple-50', qids:['q11','q12','q13','q14'] },
  { title:'Accountability & Support',    icon:'🤝', bg:'bg-green-50',  qids:['q15','q16','q17','q18','q19','q20'] },
];

// ─── Area Config ──────────────────────────────────────────────────────────────

const AREAS: Area[] = ['study_habits','subject_readiness','mock_mastery','mindset'];

const AREA_META: Record<Area, { label:string; verdicts:[string,string,string] }> = {
  study_habits: { label:'Study Habits', verdicts:[
    'Inconsistent prep is the silent score-killer. The system matters more than the hours.',
    'Your habits are forming — locking in a fixed daily slot will change the trajectory.',
    'Your prep structure is solid. This is the foundation everything else sits on.',
  ]},
  subject_readiness: { label:'Subject Readiness', verdicts:[
    'Significant gaps in one or more core sections. Build the base before attacking speed.',
    'Decent foundation — the jump now is daily targeted practice in your weakest section.',
    'Strong across all three sections. Protect that edge going into mocks.',
  ]},
  mock_mastery: { label:'Mock Mastery', verdicts:[
    "Not mining your mocks. A bad mock with deep review beats a good mock with no review.",
    'Decent review habit — the gap is in depth, not intention.',
    "You're extracting real value from every mock. This discipline compounds.",
  ]},
  mindset: { label:'Support & Mindset', verdicts:[
    'Accountability and mental resilience need work — these decide the last 10 percentile points.',
    "You're managing pressure mostly well — the gaps show under actual exam conditions.",
    'Strong accountability and mental framework. This is what separates 95+ from 99+.',
  ]},
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

function qMax(q: Question): number {
  if (q.kind === 'radio')  return Math.max(...q.scores);
  if (q.kind === 'stars')  return 5;
  return q.maxScore;
}

function qScore(q: Question, v: number): number {
  if (q.kind === 'radio')  return q.scores[v] ?? 0;
  if (q.kind === 'stars')  return v;
  return q.scoreOf(v);
}

const AREA_MAX = AREAS.reduce((acc, area) => {
  acc[area] = QS.filter(q => q.area === area).reduce((s, q) => s + qMax(q), 0);
  return acc;
}, {} as Record<Area, number>);

const TOTAL_MAX = AREAS.reduce((s, a) => s + AREA_MAX[a], 0);

function computeScores(answers: Record<string, number>) {
  let totalRaw = 0;
  const areaRaw = { study_habits:0, subject_readiness:0, mock_mastery:0, mindset:0 } as Record<Area, number>;
  for (const q of QS) {
    if (q.area === null) continue;
    const v = answers[q.id];
    if (v === undefined) continue;
    const s = qScore(q, v);
    totalRaw += s;
    areaRaw[q.area] += s;
  }
  const overall = Math.round(totalRaw / TOTAL_MAX * 100);
  const areas = AREAS.reduce((acc, area) => {
    acc[area] = Math.round(areaRaw[area] / AREA_MAX[area] * 100);
    return acc;
  }, {} as Record<Area, number>);
  return { overall, areas };
}

function getTier(s: number) {
  if (s >= 85) return 'Top 10%';
  if (s >= 70) return 'Top 25%';
  if (s >= 55) return 'Top 45%';
  if (s >= 40) return 'Top 65%';
  return 'Top 80%';
}

function getVerdict(s: number) {
  if (s >= 80) return "You're in a genuinely strong position. The gap to close now is execution, not knowledge.";
  if (s >= 65) return "Real strengths here — but 2–3 areas will cost you marks in the actual exam.";
  if (s >= 50) return "You know the basics. What's missing is the system that makes them reliable under pressure.";
  if (s >= 35) return "A lot of ground to cover — but students who face it honestly close the gap fastest.";
  return "Starting from clarity. That's the only starting point that actually leads somewhere.";
}

function barColor(p: number) {
  if (p >= 70) return 'bg-emerald-500';
  if (p >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  const { overall, areas } = useMemo(() => computeScores(answers), [answers]);
  const tier = useMemo(() => getTier(overall), [overall]);

  const waNumber = process.env.NEXT_PUBLIC_DEMO_WHATSAPP ?? '';
  const waMsg = encodeURIComponent(`Hi, I just took the CAT Readiness Test on CareerRai and scored ${overall}/100 (${tier}). I'd like my free 15-min buddy session.`);
  const whatsappUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMsg}` : null;
  const appInstallUrl = process.env.NEXT_PUBLIC_APP_INSTALL_URL ?? '#';

  function setAnswer(id: string, v: number) {
    setAnswers(prev => ({ ...prev, [id]: v }));
  }

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
    const sorted = AREAS.slice().sort((a, b) => areas[b] - areas[a]);
    const strongest = sorted[0];
    const weakest   = sorted[sorted.length - 1];

    return (
      <div className="min-h-screen bg-stone-50">
        {/* Hero */}
        <div className="bg-[#1A1A2E] px-5 py-10 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Your CAT Readiness Score</p>
          <div className="text-8xl font-black text-orange-500 leading-none font-mono">{overall}</div>
          <div className="text-2xl font-bold text-stone-400 mt-1">/ 100</div>
          <div className="inline-block mt-4 px-4 py-1.5 bg-white/10 text-white text-sm font-bold rounded-full border border-white/20">
            {tier} of test-takers
          </div>
          <p className="mt-4 text-sm text-stone-300 italic leading-relaxed max-w-xs mx-auto">
            {getVerdict(overall)}
          </p>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 pb-20 space-y-5">
          {/* Breakdown — blurred until gate */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4">Your Detailed Breakdown</p>
            <div className="relative">
              <div className={cn('grid grid-cols-2 gap-3', !gateUnlocked && 'blur-sm pointer-events-none select-none')}>
                {AREAS.map(area => {
                  const pct = areas[area];
                  return (
                    <div key={area} className="bg-stone-50 rounded-xl p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1">{AREA_META[area].label}</p>
                      <p className="text-xl font-black text-stone-900 font-mono">{pct}%</p>
                      <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', barColor(pct))} style={{ width:`${pct}%` }} />
                      </div>
                      {gateUnlocked && (
                        <p className="text-xs text-stone-500 mt-2 leading-snug">
                          {AREA_META[area].verdicts[pct >= 70 ? 2 : pct >= 40 ? 1 : 0]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {!gateUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded-2xl px-6 py-4 shadow-sm text-center">
                    <Lock className="w-5 h-5 mx-auto mb-1.5 text-stone-400" />
                    <p className="text-sm font-semibold text-stone-800">Breakdown is locked</p>
                    <p className="text-xs text-stone-500 mt-0.5">Fill in the form below to unlock</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Insight cards — shown after unlock */}
          {gateUnlocked && (
            <div className="space-y-3">
              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <span className="inline-block text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 mb-2">Strength</span>
                <p className="text-sm text-stone-700 leading-snug">
                  <strong>{AREA_META[strongest].label}</strong> — {AREA_META[strongest].verdicts[2]}
                </p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <span className="inline-block text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 mb-2">Biggest Risk</span>
                <p className="text-sm text-stone-700 leading-snug">
                  <strong>{AREA_META[weakest].label}</strong> — {AREA_META[weakest].verdicts[0]}
                </p>
              </div>
            </div>
          )}

          {/* Gate OR CTA */}
          {!gateUnlocked ? (
            <div className="bg-gradient-to-br from-teal-50 to-stone-50 border border-teal-200 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-stone-900 leading-snug mb-2" style={{ fontFamily:'Georgia, serif' }}>
                A real IIM buddy will break down your result — free.
              </h2>
              <p className="text-sm text-stone-600 mb-5 leading-relaxed">
                Your score is just the surface. Tell us where to reach you and a CAT buddy who&apos;s cracked this exam will walk you through your weak areas in a free 15-minute session. No payment. No catch.
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
                  {gateSubmitting ? 'Saving…' : 'Unlock my analysis + free session'}
                  {!gateSubmitting && <ArrowRight className="w-4 h-4" />}
                </button>
                <p className="text-center text-xs text-stone-400">We&apos;ll only use this to set up your free session.</p>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] hover:bg-[#22c55e] active:scale-[0.98] text-white font-bold text-base rounded-2xl transition-all shadow-lg shadow-green-600/20"
                >
                  <MessageCircle className="w-5 h-5" />
                  Book your free 15-min session
                </a>
              ) : (
                <div className="flex items-center justify-center w-full py-4 bg-stone-100 text-stone-400 text-sm rounded-2xl">
                  WhatsApp booking coming soon
                </div>
              )}
              <p className="text-center text-xs text-stone-500">Opens WhatsApp — a buddy will reach out to confirm.</p>
              <div className="text-center pt-1">
                <a href={appInstallUrl} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                  Install the CareerRai app
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Quiz Screen ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
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
