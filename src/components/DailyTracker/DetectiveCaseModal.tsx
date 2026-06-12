'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Lightbulb, RotateCcw, Lock, Search, Star, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CaseQuestion {
  q: string;
  options: string[];
  answer: number;
}

export interface ArrangementContent {
  game_type?: 'detective' | 'airport';
  mode: 'linear' | 'circular';
  title: string;
  story: string;
  entities: string[];
  slotLabels: string[];
  solution: string[];
  clues: string[];
  questions: CaseQuestion[];
}

// legacy alias
export type DetectiveCaseContent = ArrangementContent;

export function isDetectiveCase(content: unknown): content is ArrangementContent {
  const c = content as Partial<ArrangementContent> | null | undefined;
  return (
    !!c &&
    Array.isArray(c.entities) &&
    Array.isArray(c.solution) &&
    Array.isArray(c.clues) &&
    Array.isArray(c.questions) &&
    c.questions.length > 0 &&
    (c.game_type === undefined || c.game_type === 'detective' || c.game_type === 'airport')
  );
}

interface Theme {
  headerBg: string;
  accentText: string;
  accentBg: string;
  accentHover: string;
  accentTextDark: string;
  accentBgLight: string;
  accentBorder: string;
  casePrefix: string;
  headerEmoji: string;
  openLabel: string;
  briefingLabel: string;
  entityLabel: string;
  boardInstruction: string;
  clueLabel: string;
  unlockLabel: string;
  verifyLabel: string;
  debriefLabel: string;
  rankLabels: [string, string, string];
  closedEmoji: [string, string, string];
  tagline: string;
}

const DETECTIVE: Theme = {
  headerBg: 'bg-stone-900',
  accentText: 'text-amber-400',
  accentBg: 'bg-amber-500',
  accentHover: 'hover:bg-amber-400',
  accentTextDark: 'text-amber-700',
  accentBgLight: 'bg-amber-50',
  accentBorder: 'border-amber-200',
  casePrefix: '🕵️ Case File',
  headerEmoji: '🕵️',
  openLabel: '🔍 Open the case',
  briefingLabel: 'Case briefing',
  entityLabel: 'Suspects',
  boardInstruction: 'tap a suspect, then a position',
  clueLabel: 'Evidence',
  unlockLabel: 'Unlock next evidence',
  verifyLabel: 'Verify theory',
  debriefLabel: "🧠 Detective's method",
  rankLabels: ['Ace Detective', 'Inspector', 'Rookie'],
  closedEmoji: ['🏆', '🕵️', '📁'],
  tagline: 'Real CAT LRDI set in disguise. New case tomorrow. 🔍',
};

const AIRPORT: Theme = {
  headerBg: 'bg-sky-950',
  accentText: 'text-sky-300',
  accentBg: 'bg-sky-500',
  accentHover: 'hover:bg-sky-400',
  accentTextDark: 'text-sky-700',
  accentBgLight: 'bg-sky-50',
  accentBorder: 'border-sky-200',
  casePrefix: '✈️ Flight Log',
  headerEmoji: '✈️',
  openLabel: '📡 Open flight log',
  briefingLabel: 'Situation report',
  entityLabel: 'Flights',
  boardInstruction: 'tap a flight, then a slot',
  clueLabel: 'ATC Conditions',
  unlockLabel: 'Receive next condition',
  verifyLabel: 'Confirm sequence',
  debriefLabel: '🛫 ATC debrief',
  rankLabels: ['Senior Controller', 'Controller', 'Trainee'],
  closedEmoji: ['🏅', '✈️', '📋'],
  tagline: 'Real CAT LRDI arrangement set. New log tomorrow. ✈️',
};

interface DetectiveCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: ArrangementContent;
  explanation?: string;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'investigate' | 'questions' | 'closed';
const MAX_HINTS = 2;

export function DetectiveCaseModal({
  isOpen,
  onClose,
  content,
  explanation,
  caseDate,
  onComplete,
}: DetectiveCaseModalProps) {
  const theme = content.game_type === 'airport' ? AIRPORT : DETECTIVE;
  const slots = content.solution.length;

  const [phase, setPhase] = useState<Phase>('briefing');
  const [placements, setPlacements] = useState<(string | null)[]>(Array(slots).fill(null));
  const [selected, setSelected] = useState<string | null>(null);
  const [unlockedClues, setUnlockedClues] = useState(2);
  const [struckClues, setStruckClues] = useState<number[]>([]);
  const [checksUsed, setChecksUsed] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [lastCheck, setLastCheck] = useState<{ correct: number; total: number } | null>(null);
  const [boardCracked, setBoardCracked] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing');
      setPlacements(Array(slots).fill(null));
      setSelected(null);
      setUnlockedClues(2);
      setStruckClues([]);
      setChecksUsed(0);
      setHintsUsed(0);
      setLastCheck(null);
      setBoardCracked(false);
      setQIndex(0);
      setQSelected(null);
      setQSubmitted(false);
      setQResults([]);
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen, slots]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const trayEntities = content.entities.filter((e) => !placements.includes(e));
  const allPlaced = placements.every((p) => p !== null);
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);

  const handleSlotTap = (i: number) => {
    if (phase !== 'investigate' || boardCracked) return;
    setLastCheck(null);
    if (selected) {
      setPlacements((prev) => {
        const next = [...prev];
        const from = next.indexOf(selected);
        if (from >= 0) next[from] = null;
        next[i] = selected;
        return next;
      });
      setSelected(null);
    } else if (placements[i]) {
      setPlacements((prev) => { const next = [...prev]; next[i] = null; return next; });
    }
  };

  const handleCheck = () => {
    const correct = placements.filter((p, i) => p === content.solution[i]).length;
    setChecksUsed((c) => c + 1);
    setLastCheck({ correct, total: slots });
    if (correct === slots) { setBoardCracked(true); setTimeout(() => setPhase('questions'), 1500); }
  };

  const handleHint = () => {
    if (hintsUsed >= MAX_HINTS) return;
    const i = placements.findIndex((p, idx) => p !== content.solution[idx]);
    if (i < 0) return;
    setPlacements((prev) => {
      const next = [...prev];
      const ent = content.solution[i];
      const from = next.indexOf(ent);
      if (from >= 0) next[from] = null;
      next[i] = ent;
      return next;
    });
    setHintsUsed((h) => h + 1);
    setLastCheck(null);
  };

  const handleAnswerSubmit = () => {
    if (qSelected === null || qSubmitted) return;
    setQSubmitted(true);
    setQResults((prev) => [...prev, qSelected === questions[qIndex].answer]);
  };

  const handleNextQuestion = async () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1); setQSelected(null); setQSubmitted(false); return;
    }
    const correct = [...qResults, qSelected === questions[qIndex].answer].filter(Boolean).length;
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
    setPhase('closed'); setSaving(true);
    try {
      await onComplete({ solved: correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = correctAnswers === questions.length && hintsUsed === 0 && checksUsed <= 3 ? 3
    : correctAnswers >= Math.ceil(questions.length / 2) ? 2 : 1;

  const circlePos = (i: number) => {
    const ang = ((-90 + (360 / slots) * i) * Math.PI) / 180;
    return { left: `${50 + 40 * Math.cos(ang)}%`, top: `${50 + 40 * Math.sin(ang)}%` };
  };

  const renderSlot = (i: number) => (
    <button onClick={() => handleSlotTap(i)}
      className={cn('w-full min-h-[34px] rounded-lg border-2 text-[11px] font-semibold px-1 py-1.5 transition-all leading-tight',
        placements[i] ? boardCracked ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
          : `${theme.accentBorder} ${theme.accentBgLight} ${theme.accentTextDark}`
          : selected ? `border-dashed ${theme.accentBorder} bg-white/50 text-stone-400 animate-pulse`
          : 'border-dashed border-stone-300 bg-white text-stone-300')}>
      {placements[i] || '?'}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className={cn('sticky top-0 z-10 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl', theme.headerBg)}>
          <div>
            <span className={cn('text-[10px] uppercase tracking-widest font-semibold', theme.accentText)}>
              {theme.casePrefix} #{caseNumber}
            </span>
            <div className="flex items-center gap-1.5 text-stone-300 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" /><span className="font-mono">{mins}:{secs}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* BRIEFING */}
        {phase === 'briefing' && (
          <div className="p-5 space-y-5">
            <div className="text-center space-y-2 py-4">
              <div className="text-4xl">{theme.headerEmoji}</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className={cn('border-2 rounded-xl p-4', theme.accentBgLight, theme.accentBorder)}>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-2', theme.accentTextDark)}>{theme.briefingLabel}</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-stone-600">
              {[
                [content.entities.length, theme.entityLabel],
                [content.clues.length, 'conditions'],
                [questions.length, 'CAT questions'],
              ].map(([count, label]) => (
                <div key={String(label)} className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                  <p className="font-bold text-stone-900">{count}</p>
                  <p>{label}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setPhase('investigate')}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 transition-all active:scale-[0.98]">
              {theme.openLabel}
            </button>
          </div>
        )}

        {/* INVESTIGATE */}
        {phase === 'investigate' && (
          <div className="p-5 space-y-5">
            <p className="text-xs text-stone-600 leading-relaxed">{content.story}</p>

            {/* Board */}
            <div>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-2', 'text-stone-500')}>
                📌 {content.mode === 'circular' ? 'Circular table' : 'Board'} — {theme.boardInstruction}
              </p>
              {content.mode === 'circular' ? (
                <div className="relative w-full max-w-[300px] aspect-square mx-auto">
                  <div className="absolute inset-[24%] rounded-full bg-stone-100 border-2 border-stone-200 flex items-center justify-center text-[10px] text-stone-400 font-semibold">
                    {content.game_type === 'airport' ? 'RUNWAY' : 'TABLE'}
                  </div>
                  {content.slotLabels.map((label, i) => (
                    <div key={i} className="absolute w-[72px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5" style={circlePos(i)}>
                      <span className="text-[9px] text-stone-500 font-medium">{label}</span>
                      {renderSlot(i)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={cn('grid gap-2', slots <= 6 ? 'grid-cols-3' : 'grid-cols-4')}>
                  {content.slotLabels.map((label, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-stone-500 font-medium">{label}</span>
                      {renderSlot(i)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tray */}
            {trayEntities.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">{theme.entityLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {trayEntities.map((e) => (
                    <button key={e} onClick={() => setSelected(selected === e ? null : e)}
                      className={cn('px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all',
                        selected === e ? `${theme.accentBorder} ${theme.accentBgLight} ${theme.accentTextDark} scale-105 shadow`
                          : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clues */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">
                🗂 {theme.clueLabel} — tap to strike off once used
              </p>
              <div className="space-y-1.5">
                {content.clues.slice(0, unlockedClues).map((clue, i) => (
                  <button key={i} onClick={() => setStruckClues((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])}
                    className={cn('w-full text-left px-3 py-2 rounded-lg border text-xs leading-relaxed transition-all',
                      struckClues.includes(i) ? 'border-stone-200 bg-stone-50 text-stone-400 line-through'
                        : `${theme.accentBorder} ${theme.accentBgLight} text-stone-800`)}>
                    <span className={cn('font-bold mr-1.5', theme.accentTextDark)}>#{i + 1}</span>{clue}
                  </button>
                ))}
                {unlockedClues < content.clues.length && (
                  <button onClick={() => setUnlockedClues((n) => n + 1)}
                    className={cn('w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-stone-300 text-xs font-semibold text-stone-600 transition-all', `hover:${theme.accentBorder} hover:${theme.accentTextDark}`)}>
                    <Lock className="w-3.5 h-3.5" />{theme.unlockLabel} ({content.clues.length - unlockedClues} left)
                  </button>
                )}
              </div>
            </div>

            {lastCheck && !boardCracked && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800 font-medium">
                🎯 {lastCheck.correct}/{lastCheck.total} correct — keep deducing!
              </div>
            )}
            {boardCracked && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 text-center">
                <p className="text-sm font-bold text-emerald-800">🎉 Arrangement confirmed! Moving to case questions…</p>
              </div>
            )}

            {!boardCracked && (
              <div className="flex gap-2">
                <button onClick={handleHint} disabled={hintsUsed >= MAX_HINTS}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-stone-400 disabled:opacity-40 transition-all">
                  <Lightbulb className="w-3.5 h-3.5" />Hint ({MAX_HINTS - hintsUsed})
                </button>
                <button onClick={() => { setPlacements(Array(slots).fill(null)); setSelected(null); setLastCheck(null); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-stone-400 transition-all">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleCheck} disabled={!allPlaced}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                  <Search className="w-4 h-4" />{theme.verifyLabel}
                </button>
              </div>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className={cn('rounded-xl p-3', theme.accentBgLight, `border ${theme.accentBorder}`)}>
              <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-1.5', theme.accentTextDark)}>Confirmed arrangement</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {content.slotLabels.map((label, i) => (
                  <span key={i} className="text-[11px] text-stone-700">
                    <span className="text-stone-400">{label}:</span> <span className="font-semibold">{content.solution[i]}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">
                ⚖️ CAT Questions — {qIndex + 1}/{questions.length}
              </p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500'
                      : i === qIndex ? `bg-amber-500` : 'bg-stone-200')} />
                ))}
              </div>
            </div>

            <p className="text-sm text-stone-900 font-medium leading-relaxed">{questions[qIndex].q}</p>

            <div className="space-y-2">
              {questions[qIndex].options.map((opt, i) => {
                const isPicked = qSelected === i, isAnswer = i === questions[qIndex].answer;
                return (
                  <button key={i} disabled={qSubmitted} onClick={() => setQSelected(i)}
                    className={cn('w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                      !qSubmitted && isPicked && `${theme.accentBorder} ${theme.accentBgLight} text-stone-900`,
                      !qSubmitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                      qSubmitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                      qSubmitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                      qSubmitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400')}>
                    <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>

            {!qSubmitted ? (
              <button onClick={handleAnswerSubmit} disabled={qSelected === null}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className={cn('w-full flex items-center justify-center gap-1 py-3 text-white rounded-xl font-semibold text-sm transition-all active:scale-[0.98]', theme.accentBg, theme.accentHover)}>
                {qIndex + 1 < questions.length ? 'Next question' : 'Close the case'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{theme.closedEmoji[stars === 3 ? 0 : stars === 2 ? 1 : 2]}</div>
              <h2 className="text-lg font-bold text-stone-900">Case closed!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className={cn('text-sm font-semibold', theme.accentTextDark)}>Rank: {theme.rankLabels[stars === 3 ? 0 : stars === 2 ? 1 : 2]}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['Questions', `${correctAnswers}/${questions.length}`], ['Checks', `${checksUsed}`]].map(([label, val]) => (
                <div key={label} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{val}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {explanation && (
              <div className={cn('rounded-xl p-4', theme.accentBgLight, `border ${theme.accentBorder}`)}>
                <p className={cn('text-[10px] uppercase tracking-widest font-bold mb-1.5', theme.accentTextDark)}>{theme.debriefLabel}</p>
                <p className="text-xs text-stone-700 leading-relaxed">{explanation}</p>
              </div>
            )}

            <p className="text-center text-xs text-stone-400">{theme.tagline}</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
