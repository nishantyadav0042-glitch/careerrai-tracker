'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, ChevronRight, Star, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MafiaStatement { suspect: string; says: string }

export interface MafiaContent {
  game_type: 'mafia';
  title: string;
  story: string;
  suspects: string[];
  guilty_index: number;
  statements: MafiaStatement[];
  facts: string[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export function isMafiaGame(content: unknown): content is MafiaContent {
  const c = content as Partial<MafiaContent> | null | undefined;
  return !!c && c.game_type === 'mafia' && Array.isArray(c.suspects) && Array.isArray(c.statements);
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: MafiaContent;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'interrogate' | 'accuse' | 'questions' | 'closed';
type Verdict = 'clear' | 'suspect' | null;

export function MafiaLogicModal({ isOpen, onClose, content, caseDate, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [verdicts, setVerdicts] = useState<Verdict[]>(() => Array(content.suspects.length).fill(null));
  const [accusation, setAccusation] = useState<number | null>(null);
  const [accusationResult, setAccusationResult] = useState<'correct' | 'wrong' | null>(null);
  const [expandedStatement, setExpandedStatement] = useState<number | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing'); setVerdicts(Array(content.suspects.length).fill(null));
      setAccusation(null); setAccusationResult(null); setExpandedStatement(null);
      setQIndex(0); setQSelected(null); setQSubmitted(false); setQResults([]); setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen, content.suspects.length]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);

  const handleAccuse = async () => {
    if (accusation === null) return;
    const correct = accusation === content.guilty_index;
    setAccusationResult(correct ? 'correct' : 'wrong');
    if (correct) setTimeout(() => setPhase('questions'), 1500);
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
      await onComplete({ solved: accusationResult === 'correct' && correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = accusationResult === 'correct' && correctAnswers === questions.length ? 3
    : accusationResult === 'correct' ? 2 : 1;

  const verdictIcon = (v: Verdict) => v === 'clear'
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
    : v === 'suspect'
    ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
    : <HelpCircle className="w-3.5 h-3.5 text-stone-400" />;

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-red-950 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-red-300">
              🎭 Mafia Round #{caseNumber}
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
              <div className="text-4xl">🎭</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-red-700 mb-2">The situation</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-600">Rules of deduction</p>
              <ul className="space-y-1 text-xs text-stone-700">
                <li>• Exactly <strong>one suspect is guilty</strong> and their statement is a <strong>lie</strong>.</li>
                <li>• All innocent suspects are <strong>telling the truth</strong>.</li>
                <li>• Find the contradiction. The liar is the guilty one.</li>
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-stone-600">
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{content.suspects.length}</p><p>suspects</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{content.facts.length}</p><p>known facts</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-200">
                <p className="font-bold text-stone-900">{questions.length}</p><p>CAT questions</p>
              </div>
            </div>
            <button onClick={() => setPhase('interrogate')}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 transition-all active:scale-[0.98]">
              🔍 Enter the interrogation room
            </button>
          </div>
        )}

        {/* INTERROGATE */}
        {phase === 'interrogate' && (
          <div className="p-5 space-y-5">
            {/* Facts panel */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 mb-2">📋 Established facts</p>
              <ul className="space-y-1">
                {content.facts.map((f, i) => (
                  <li key={i} className="text-xs text-stone-700 flex gap-1.5">
                    <span className="text-amber-500 font-bold">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Suspect statements */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">
                🎙 Statements — tap to mark as clear or suspect
              </p>
              <div className="space-y-2">
                {content.statements.map((stmt, i) => (
                  <div key={i} className={cn('rounded-xl border-2 overflow-hidden transition-all',
                    verdicts[i] === 'suspect' ? 'border-red-400 bg-red-50'
                      : verdicts[i] === 'clear' ? 'border-emerald-400 bg-emerald-50'
                      : 'border-stone-200 bg-white')}>
                    <button className="w-full flex items-start gap-3 p-3 text-left"
                      onClick={() => setExpandedStatement(expandedStatement === i ? null : i)}>
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                        verdicts[i] === 'suspect' ? 'bg-red-200 text-red-800'
                          : verdicts[i] === 'clear' ? 'bg-emerald-200 text-emerald-800'
                          : 'bg-stone-200 text-stone-700')}>
                        {stmt.suspect[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-stone-900">{stmt.suspect}</p>
                          {verdictIcon(verdicts[i])}
                        </div>
                        <p className={cn('text-xs mt-0.5 leading-relaxed',
                          expandedStatement === i ? 'text-stone-700' : 'text-stone-500 truncate')}>
                          "{stmt.says}"
                        </p>
                      </div>
                    </button>
                    {expandedStatement === i && (
                      <div className="px-3 pb-3 flex gap-2">
                        <button onClick={() => setVerdicts((prev) => { const n = [...prev]; n[i] = n[i] === 'clear' ? null : 'clear'; return n; })}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all',
                            verdicts[i] === 'clear' ? 'border-emerald-500 bg-emerald-100 text-emerald-800' : 'border-stone-200 text-stone-600 hover:border-emerald-400')}>
                          ✓ Clear
                        </button>
                        <button onClick={() => setVerdicts((prev) => { const n = [...prev]; n[i] = n[i] === 'suspect' ? null : 'suspect'; return n; })}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all',
                            verdicts[i] === 'suspect' ? 'border-red-500 bg-red-100 text-red-800' : 'border-stone-200 text-stone-600 hover:border-red-400')}>
                          ⚠ Suspect
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setPhase('accuse')}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 transition-all active:scale-[0.98]">
              ⚖️ Make your accusation →
            </button>
          </div>
        )}

        {/* ACCUSE */}
        {phase === 'accuse' && (
          <div className="p-5 space-y-5">
            <div className="text-center">
              <p className="text-sm font-bold text-stone-900">Who is guilty?</p>
              <p className="text-xs text-stone-500 mt-1">Choose carefully — only one chance.</p>
            </div>

            <div className="space-y-2">
              {content.suspects.map((name, i) => (
                <button key={i} onClick={() => { setAccusation(i); setAccusationResult(null); }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                    accusation === i ? 'border-red-500 bg-red-50 text-red-900 scale-[1.01]'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400')}>
                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                    accusation === i ? 'bg-red-200 text-red-800' : 'bg-stone-200 text-stone-700')}>
                    {name[0]}
                  </div>
                  {name}
                  <span className="ml-auto text-xs text-stone-400">
                    {verdicts[i] === 'suspect' ? '⚠ Marked suspect' : verdicts[i] === 'clear' ? '✓ Marked clear' : ''}
                  </span>
                </button>
              ))}
            </div>

            {accusationResult === 'wrong' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-rose-800">❌ Wrong accusation! Re-examine the statements.</p>
                <button onClick={() => { setPhase('interrogate'); setAccusation(null); setAccusationResult(null); }}
                  className="mt-2 text-xs text-rose-600 underline">Go back to statements</button>
              </div>
            )}

            {accusationResult === 'correct' && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-emerald-800">🎉 Correct! The liar is exposed. Moving to CAT questions…</p>
              </div>
            )}

            {accusationResult !== 'correct' && (
              <button onClick={handleAccuse} disabled={accusation === null}
                className="w-full py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all active:scale-[0.98]">
                ⚖️ Accuse {accusation !== null ? content.suspects[accusation] : '…'}
              </button>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-bold text-emerald-800">
                ✅ {content.suspects[content.guilty_index]} was guilty — their statement was the lie.
              </p>
              <p className="text-xs text-emerald-700 mt-1">Now answer these CAT-style deduction questions.</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">CAT Questions — {qIndex + 1}/{questions.length}</p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500' : i === qIndex ? 'bg-red-500' : 'bg-stone-200')} />
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
                      !qSubmitted && isPicked && 'border-red-500 bg-red-50 text-stone-900',
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
                className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 disabled:opacity-40 transition-all">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-1 py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 transition-all">
                {qIndex + 1 < questions.length ? 'Next question' : 'Final verdict'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{stars === 3 ? '⚖️' : stars === 2 ? '🎭' : '🔍'}</div>
              <h2 className="text-lg font-bold text-stone-900">Case solved!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className="text-sm font-semibold text-red-800">Rank: {stars === 3 ? 'Master Interrogator' : stars === 2 ? 'Detective' : 'Rookie'}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['CAT Qs', `${correctAnswers}/${questions.length}`], ['Accusation', accusationResult === 'correct' ? '✓' : '✗']].map(([l, v]) => (
                <div key={l} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{v}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-stone-400">Pure CAT logical reasoning — truth-liar deduction. New case tomorrow. 🎭</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-red-950 text-white rounded-xl font-semibold text-sm hover:bg-red-900 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
