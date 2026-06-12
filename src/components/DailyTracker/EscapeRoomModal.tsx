'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Lightbulb, ChevronRight, Star, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EscapeLock {
  room: string;
  prompt: string;
  options: string[];
  answer: number;
  hint: string;
}

export interface EscapeRoomContent {
  game_type: 'escape_room';
  title: string;
  story: string;
  locks: EscapeLock[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export function isEscapeRoom(content: unknown): content is EscapeRoomContent {
  const c = content as Partial<EscapeRoomContent> | null | undefined;
  return !!c && c.game_type === 'escape_room' && Array.isArray(c.locks) && c.locks.length > 0;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: EscapeRoomContent;
  caseDate: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

type Phase = 'briefing' | 'escaping' | 'questions' | 'closed';

export function EscapeRoomModal({ isOpen, onClose, content, caseDate, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [lockIndex, setLockIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [unlockedRooms, setUnlockedRooms] = useState<number[]>([]);
  const [openAnim, setOpenAnim] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [qSelected, setQSelected] = useState<number | null>(null);
  const [qSubmitted, setQSubmitted] = useState(false);
  const [qResults, setQResults] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);
  const timePenalty = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase('briefing'); setLockIndex(0); setSelected(null); setSubmitted(false);
      setWrongCount(0); setShowHint(false); setHintsUsed(0); setUnlockedRooms([]);
      setOpenAnim(false); setQIndex(0); setQSelected(null); setQSubmitted(false);
      setQResults([]); setElapsed(0); timePenalty.current = 0;
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const mins = String(Math.floor(elapsed / 60));
  const secs = String(elapsed % 60).padStart(2, '0');
  const lock = content.locks[lockIndex];
  const questions = content.questions;
  const correctAnswers = qResults.filter(Boolean).length;
  const caseNumber = caseDate.replace(/-/g, '').slice(2);
  const allLocks = content.locks.length;

  const handleSubmit = () => {
    if (selected === null || submitted) return;
    if (selected === lock.answer) {
      setSubmitted(true);
      setOpenAnim(true);
      setTimeout(() => {
        setUnlockedRooms((prev) => [...prev, lockIndex]);
        if (lockIndex + 1 < allLocks) {
          setLockIndex((i) => i + 1);
          setSelected(null); setSubmitted(false); setWrongCount(0); setShowHint(false); setOpenAnim(false);
        } else {
          setPhase('questions');
        }
      }, 1400);
    } else {
      setWrongCount((w) => w + 1);
      setSelected(null);
      if (wrongCount + 1 >= 2) setShowHint(true);
    }
  };

  const handleHint = () => {
    setShowHint(true);
    setHintsUsed((h) => h + 1);
    timePenalty.current += 30;
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
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000) + timePenalty.current);
    setPhase('closed'); setSaving(true);
    try {
      await onComplete({ solved: correct >= Math.ceil(questions.length / 2), timeSeconds, accuracy: correct / questions.length });
    } finally { setSaving(false); }
  };

  const stars = correctAnswers === questions.length && hintsUsed === 0 ? 3
    : correctAnswers >= Math.ceil(questions.length / 2) ? 2 : 1;
  const rankLabel = stars === 3 ? 'Master Escapist' : stars === 2 ? 'Problem Solver' : 'Rookie';

  return (
    <div className="fixed inset-0 bg-stone-900/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-900 text-white px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-400">
              🔐 Escape Room #{caseNumber}
            </span>
            <div className="flex items-center gap-1.5 text-stone-300 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" /><span className="font-mono">{mins}:{secs}</span>
              {timePenalty.current > 0 && <span className="text-red-400 text-[10px]">+{timePenalty.current}s penalty</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* BRIEFING */}
        {phase === 'briefing' && (
          <div className="p-5 space-y-5">
            <div className="text-center space-y-2 py-4">
              <div className="text-4xl">🔐</div>
              <h2 className="text-lg font-bold text-stone-900">{content.title}</h2>
            </div>
            <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2">Your situation</p>
              <p className="text-sm text-stone-800 leading-relaxed">{content.story}</p>
            </div>
            {/* Room progress preview */}
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2">Rooms to escape</p>
              <div className="flex items-center gap-2">
                {content.locks.map((l, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 border-2 border-zinc-300 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="text-[9px] text-stone-500 text-center leading-tight">{l.room}</span>
                  </div>
                ))}
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
                    <span className="text-sm">🚪</span>
                  </div>
                  <span className="text-[9px] text-stone-500">Freedom</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-stone-500 text-center">Each lock = one CAT-level calculation. Wrong twice → hint revealed.</p>
            <button onClick={() => setPhase('escaping')}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 transition-all active:scale-[0.98]">
              🔐 Start escaping
            </button>
          </div>
        )}

        {/* ESCAPING */}
        {phase === 'escaping' && (
          <div className="p-5 space-y-5">
            {/* Progress */}
            <div className="flex items-center gap-1.5">
              {content.locks.map((l, i) => (
                <div key={i} className={cn('flex-1 h-1.5 rounded-full transition-all',
                  unlockedRooms.includes(i) ? 'bg-emerald-500' : i === lockIndex ? 'bg-amber-400' : 'bg-stone-200')} />
              ))}
            </div>

            {/* Room label */}
            <div className="flex items-center gap-2">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-all',
                openAnim ? 'bg-emerald-100 border-2 border-emerald-400' : 'bg-zinc-200 border-2 border-zinc-300')}>
                {openAnim ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-zinc-500" />}
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">{lock.room}</p>
                <p className="text-[10px] text-stone-500">Lock {lockIndex + 1} of {allLocks}</p>
              </div>
            </div>

            {openAnim ? (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-6 text-center space-y-2">
                <div className="text-4xl">🔓</div>
                <p className="text-sm font-bold text-emerald-800">Lock cracked! Door opening…</p>
              </div>
            ) : (
              <>
                {/* Problem */}
                <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2">🔢 Crack the lock</p>
                  <p className="text-sm text-stone-900 leading-relaxed font-medium whitespace-pre-line">{lock.prompt}</p>
                </div>

                {/* Wrong attempts feedback */}
                {wrongCount > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-700 font-medium">
                    ❌ Wrong answer — {wrongCount >= 2 ? 'hint revealed below' : 'try again'}
                  </div>
                )}

                {/* Hint */}
                {showHint && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 mb-1">💡 Hint</p>
                    <p className="text-xs text-stone-700">{lock.hint}</p>
                  </div>
                )}

                {/* Options */}
                <div className="grid grid-cols-2 gap-2">
                  {lock.options.map((opt, i) => (
                    <button key={i} onClick={() => setSelected(i)}
                      className={cn('py-3 px-3 rounded-xl border-2 text-sm font-semibold transition-all text-center',
                        selected === i ? 'border-emerald-500 bg-emerald-50 text-emerald-900 scale-[1.02]'
                          : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400')}>
                      {opt}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {!showHint && (
                    <button onClick={handleHint}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-stone-200 text-xs font-semibold text-stone-600 hover:border-amber-400 transition-all">
                      <Lightbulb className="w-3.5 h-3.5" />Hint (+30s)
                    </button>
                  )}
                  <button onClick={handleSubmit} disabled={selected === null}
                    className="flex-1 py-2.5 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-40 transition-all active:scale-[0.98]">
                    🔓 Try this code
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* QUESTIONS */}
        {phase === 'questions' && (
          <div className="p-5 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-emerald-800">🚪 You escaped! Now close out with CAT questions.</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">CAT Questions — {qIndex + 1}/{questions.length}</p>
              <div className="flex gap-1">
                {questions.map((_, i) => (
                  <div key={i} className={cn('w-2 h-2 rounded-full',
                    i < qResults.length ? qResults[i] ? 'bg-emerald-500' : 'bg-rose-500' : i === qIndex ? 'bg-amber-500' : 'bg-stone-200')} />
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
                      !qSubmitted && isPicked && 'border-emerald-500 bg-emerald-50 text-stone-900',
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
                className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-40 transition-all">
                Lock answer
              </button>
            ) : (
              <button onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all">
                {qIndex + 1 < questions.length ? 'Next question' : 'Finish'}<ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* CLOSED */}
        {phase === 'closed' && (
          <div className="p-5 space-y-5">
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">{stars === 3 ? '🏆' : stars === 2 ? '🔓' : '🔐'}</div>
              <h2 className="text-lg font-bold text-stone-900">Escaped!</h2>
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn('w-7 h-7', s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200')} />
                ))}
              </div>
              <p className="text-sm font-semibold text-emerald-700">Rank: {rankLabel}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Time', `${mins}:${secs}`], ['CAT Qs', `${correctAnswers}/${questions.length}`], ['Hints', `${hintsUsed}`]].map(([l, v]) => (
                <div key={l} className="bg-stone-50 rounded-xl p-3 border border-stone-200">
                  <p className="text-base font-bold text-stone-900">{v}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-stone-400">Every lock was a real CAT Quant concept. New room tomorrow. 🔐</p>
            <button onClick={onClose} disabled={saving}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
