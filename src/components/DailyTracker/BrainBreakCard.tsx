'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, Brain, Zap, Grid3x3, Hash } from 'lucide-react';

// ── Math Sprint ─────────────────────────────────────────────────────────────
function MathSprint({ onDone }: { onDone: (score: number) => void }) {
  const [q, setQ] = useState(genQuestion());
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const TOTAL = 10;

  function genQuestion() {
    const ops = ['+', '-', '×'] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a: number, b: number, answer: number;
    if (op === '+') { a = rnd(10, 50); b = rnd(5, 40); answer = a + b; }
    else if (op === '-') { a = rnd(20, 60); b = rnd(5, a - 1); answer = a - b; }
    else { a = rnd(2, 12); b = rnd(2, 12); answer = a * b; }
    const wrongs = new Set<number>();
    while (wrongs.size < 3) {
      const d = rnd(-10, 10);
      if (d !== 0) wrongs.add(answer + d);
    }
    const opts = shuffle([answer, ...Array.from(wrongs)]);
    return { text: `${a} ${op} ${b}`, answer, options: opts };
  }
  function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle<T>(arr: T[]) { return [...arr].sort(() => Math.random() - 0.5); }

  const pick = (val: number) => {
    if (feedback) return;
    const correct = val === q.answer;
    setFeedback(correct ? 'right' : 'wrong');
    if (correct) setScore((s) => s + 1);
    setTimeout(() => {
      const next = round + 1;
      if (next >= TOTAL) { onDone(correct ? score + 1 : score); return; }
      setRound(next);
      setQ(genQuestion());
      setFeedback(null);
    }, 500);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{round + 1}/{TOTAL}</span>
        <span className="font-bold text-white">{score} correct</span>
      </div>
      <div className="text-center py-6">
        <p className="text-4xl font-bold text-white tracking-tight">{q.text}</p>
        <p className="text-xs text-zinc-500 mt-1">= ?</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => pick(opt)}
            className={cn(
              'py-4 rounded-xl font-bold text-lg transition-all active:scale-95',
              feedback && opt === q.answer ? 'bg-emerald-500 text-white' :
              feedback && opt !== q.answer ? 'bg-zinc-800 text-zinc-600' :
              'bg-zinc-800 text-white hover:bg-zinc-700'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pattern Lock ─────────────────────────────────────────────────────────────
function PatternLock({ onDone }: { onDone: (score: number) => void }) {
  const [phase, setPhase] = useState<'show' | 'input' | 'result'>('show');
  const [pattern, setPattern] = useState<number[]>([]);
  const [tapped, setTapped] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const TOTAL = 5;

  const startRound = useCallback((r: number) => {
    const len = 3 + r;
    const p = Array.from({ length: len }, () => Math.floor(Math.random() * 9));
    setPattern(p);
    setTapped([]);
    setPhase('show');
    let i = 0;
    const showNext = () => {
      if (i >= p.length) { setPhase('input'); setHighlight(null); return; }
      setHighlight(p[i]);
      i++;
      setTimeout(showNext, 700);
    };
    setTimeout(showNext, 400);
  }, []);

  useEffect(() => { startRound(0); }, [startRound]);

  const tap = (cell: number) => {
    if (phase !== 'input') return;
    const next = [...tapped, cell];
    setTapped(next);
    if (next.length === pattern.length) {
      const correct = next.every((v, i) => v === pattern[i]);
      if (correct) setScore((s) => s + 1);
      setPhase('result');
      setTimeout(() => {
        const nr = round + 1;
        if (nr >= TOTAL) { onDone(correct ? score + 1 : score); return; }
        setRound(nr);
        startRound(nr);
      }, 800);
    }
  };

  const inputCorrect = tapped.every((v, i) => v === pattern[i]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Round {round + 1}/{TOTAL} · length {3 + round}</span>
        <span className="font-bold text-white">{score} correct</span>
      </div>
      <p className="text-xs text-zinc-400 text-center">
        {phase === 'show' ? 'Watch the pattern…' : phase === 'input' ? 'Reproduce it' : inputCorrect ? '✓ Correct!' : '✗ Wrong'}
      </p>
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            onClick={() => tap(i)}
            disabled={phase !== 'input'}
            className={cn(
              'aspect-square rounded-xl transition-all active:scale-90',
              highlight === i ? 'bg-orange-500 scale-110' :
              tapped.includes(i) ? 'bg-teal-500' :
              'bg-zinc-800 hover:bg-zinc-700 disabled:hover:bg-zinc-800'
            )}
          />
        ))}
      </div>
      {phase === 'show' && (
        <p className="text-[11px] text-zinc-600 text-center">Memorise — then tap in the same order</p>
      )}
    </div>
  );
}

// ── Memory Grid ──────────────────────────────────────────────────────────────
const EMOJI_PAIRS = ['🎯', '🔥', '⚡', '🎭', '🧠', '📚', '💡', '🎪'];

function MemoryGrid({ onDone }: { onDone: (score: number) => void }) {
  const [cards] = useState(() => {
    const all = [...EMOJI_PAIRS, ...EMOJI_PAIRS].map((e, i) => ({ id: i, emoji: e, flipped: false, matched: false }));
    return all.sort(() => Math.random() - 0.5);
  });
  const [state, setState] = useState(cards);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  const flip = (id: number) => {
    if (done) return;
    if (state[id].matched || state[id].flipped) return;
    if (open.length === 2) return;
    const next = state.map((c, i) => i === id ? { ...c, flipped: true } : c);
    setOpen((o) => [...o, id]);
    setState(next);

    if (open.length === 1) {
      setMoves((m) => m + 1);
      const [first] = open;
      if (next[first].emoji === next[id].emoji) {
        setTimeout(() => {
          setState((s) => s.map((c, i) => (i === first || i === id) ? { ...c, matched: true } : c));
          setOpen([]);
          if (next.filter((c) => c.matched).length + 2 === next.length) setDone(true);
        }, 400);
      } else {
        setTimeout(() => {
          setState((s) => s.map((c, i) => (i === first || i === id) ? { ...c, flipped: false } : c));
          setOpen([]);
        }, 700);
      }
    }
  };

  useEffect(() => { if (done) onDone(Math.max(0, 16 - moves)); }, [done, moves, onDone]);

  const matched = state.filter((c) => c.matched).length / 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{matched}/{EMOJI_PAIRS.length} pairs</span>
        <span className="font-bold text-white">{moves} moves</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {state.map((card, i) => (
          <button
            key={card.id}
            onClick={() => flip(i)}
            className={cn(
              'aspect-square rounded-lg text-lg transition-all active:scale-90 flex items-center justify-center',
              card.matched ? 'bg-emerald-900/50 text-emerald-400' :
              card.flipped ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-800 hover:bg-zinc-700'
            )}
          >
            {(card.flipped || card.matched) ? card.emoji : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sudoku Blitz ─────────────────────────────────────────────────────────────
const SUDOKU_PUZZLES = [
  { grid: [3,0,0,1, 0,1,3,0, 0,4,1,0, 1,0,0,2], solution: [3,2,4,1, 4,1,3,2, 2,4,1,3, 1,3,2,4] },
  { grid: [0,3,0,2, 1,0,2,0, 0,4,0,1, 2,0,1,0], solution: [4,3,1,2, 1,2,3,4, 3,4,2,1, 2,1,4,3] },
  { grid: [1,0,3,0, 0,3,0,4, 4,0,2,0, 0,2,0,1], solution: [1,4,3,2, 2,3,1,4, 4,1,2,3, 3,2,4,1] },
];

function SudokuBlitz({ onDone }: { onDone: (score: number) => void }) {
  const puzzle = SUDOKU_PUZZLES[Math.floor(Math.random() * SUDOKU_PUZZLES.length)];
  const [vals, setVals] = useState<(number | null)[]>(puzzle.grid.map((v) => v || null));
  const [sel, setSel] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fill = (n: number) => {
    if (sel === null || puzzle.grid[sel] !== 0) return;
    setVals((v) => v.map((x, i) => i === sel ? n : x));
  };

  const check = () => {
    const correct = vals.filter((v, i) => v === puzzle.solution[i]).length;
    const empty = vals.filter((v, i) => puzzle.grid[i] === 0);
    const filled = empty.length - vals.filter((v, i) => puzzle.grid[i] === 0 && v === null).length;
    setSubmitted(true);
    onDone(Math.round((correct / 16) * 10));
  };

  const filledCount = vals.filter((v, i) => puzzle.grid[i] === 0 && v !== null).length;
  const totalEmpty = puzzle.grid.filter((v) => v === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>4×4 Sudoku · 1–4, no repeats in row/col/box</span>
        <span className="font-bold text-white">{filledCount}/{totalEmpty} filled</span>
      </div>
      <div className="grid grid-cols-4 gap-1 max-w-[200px] mx-auto">
        {vals.map((v, i) => {
          const isFixed = puzzle.grid[i] !== 0;
          const isWrong = submitted && !isFixed && v !== puzzle.solution[i];
          const isRight = submitted && !isFixed && v === puzzle.solution[i];
          return (
            <button
              key={i}
              onClick={() => !isFixed && setSel(i === sel ? null : i)}
              className={cn(
                'aspect-square rounded-lg font-bold text-lg transition-all flex items-center justify-center border',
                isFixed ? 'bg-zinc-700 text-white border-transparent' :
                isRight ? 'bg-emerald-800 text-emerald-300 border-emerald-600' :
                isWrong ? 'bg-red-900 text-red-300 border-red-700' :
                sel === i ? 'bg-orange-600 text-white border-orange-400' :
                'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700',
                i % 2 === 0 && Math.floor(i / 4) % 2 === 0 ? 'ring-1 ring-zinc-600' :
                i % 2 === 1 && Math.floor(i / 4) % 2 === 1 ? 'ring-1 ring-zinc-600' : ''
              )}
            >
              {v || ''}
            </button>
          );
        })}
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => fill(n)}
            disabled={sel === null || submitted}
            className="w-10 h-10 rounded-lg bg-zinc-700 text-white font-bold hover:bg-zinc-600 disabled:opacity-40 transition-all active:scale-95"
          >
            {n}
          </button>
        ))}
      </div>
      {!submitted && (
        <button
          onClick={check}
          disabled={filledCount < totalEmpty}
          className={cn(
            'w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]',
            filledCount === totalEmpty
              ? 'bg-orange-500 text-white hover:bg-orange-400'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          )}
        >
          Check answers
        </button>
      )}
    </div>
  );
}

// ── Brain Break Card ─────────────────────────────────────────────────────────
const GAMES = [
  { id: 'math_sprint', label: 'Math Sprint', icon: Hash, color: 'text-amber-400' },
  { id: 'pattern_lock', label: 'Pattern', icon: Grid3x3, color: 'text-sky-400' },
  { id: 'memory_grid', label: 'Memory', icon: Brain, color: 'text-emerald-400' },
  { id: 'sudoku_blitz', label: 'Sudoku', icon: Zap, color: 'text-purple-400' },
] as const;

type GameId = (typeof GAMES)[number]['id'];

interface BrainBreakCardProps {
  studentId: string;
}

export function BrainBreakCard({ studentId }: BrainBreakCardProps) {
  const [selected, setSelected] = useState<GameId | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3-play-per-day limit via localStorage
  const todayKey = `bb_plays_${new Date().toISOString().split('T')[0]}`;
  const playsToday = () => parseInt(localStorage.getItem(todayKey) ?? '0', 10);
  const canPlay = playsToday() < 3;

  const startGame = (id: GameId) => {
    if (!canPlay) return;
    setSelected(id);
    setScore(null);
    // Auto-close after 3 min
    timerRef.current = setTimeout(() => { setSelected(null); }, 3 * 60 * 1000);
  };

  const finishGame = (finalScore: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const plays = playsToday() + 1;
    localStorage.setItem(todayKey, String(plays));
    setScore(finalScore);
    // Log to backend (fire and forget)
    if (studentId) {
      fetch('/api/logging/brain-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: selected, score: finalScore }),
      }).catch(() => {});
    }
  };

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSelected(null);
    setScore(null);
  };

  const plays = playsToday();

  if (selected) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {GAMES.find((g) => g.id === selected)?.label}
          </span>
          <button onClick={close} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {score !== null ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-5xl font-bold text-white">{score}</p>
            <p className="text-sm text-zinc-400">
              {score >= 8 ? 'Sharp. Back to work.' : score >= 5 ? 'Not bad.' : 'Brain needed that.'}
            </p>
            <p className="text-xs text-zinc-600">{3 - plays} plays left today</p>
            <button
              onClick={close}
              className="mt-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 transition-colors active:scale-[0.98]"
            >
              Back to studying
            </button>
          </div>
        ) : (
          <>
            {selected === 'math_sprint' && <MathSprint onDone={finishGame} />}
            {selected === 'pattern_lock' && <PatternLock onDone={finishGame} />}
            {selected === 'memory_grid' && <MemoryGrid onDone={finishGame} />}
            {selected === 'sudoku_blitz' && <SudokuBlitz onDone={finishGame} />}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Brain Break</p>
          <p className="text-[11px] text-zinc-600 mt-0.5">Sharpen focus · {3 - plays} plays left today</p>
        </div>
        <Brain className="w-4 h-4 text-zinc-600" />
      </div>
      {!canPlay ? (
        <p className="text-xs text-zinc-600 text-center py-2">3 plays used — rest is productive too.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {GAMES.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => startGame(id)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Icon className={cn('w-4 h-4', color)} />
              <span className="text-[10px] text-zinc-400 font-medium leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
