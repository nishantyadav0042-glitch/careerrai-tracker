'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

// Every line here is either a fact this product can already back up
// (verified IIM alumni, 95%ile+, 1-on-1 not a batch) or a description of
// what a buddy actually does (mock breakdowns, daily log nudges) — never a
// fabricated efficacy number. "Increases your chances by 40%" would be a
// made-up statistic with no study behind it; this app's own brand rule,
// set earlier in this build, is no invented numbers, no unverified
// superlatives. Real claims convert better long-term anyway — a student
// who catches one fake stat stops trusting all the honest ones too.
const LINES = [
  'Most aspirants take 30+ mocks and never learn to analyse one. Your buddy breaks down every mock with you — where you lost marks, why, what to fix next.',
  '1-on-1, never a group. A senior who knows your name, your weak section, and your last mock — not one of 200 in a batch.',
  'Every CareerRai buddy cleared CAT at 95%ile+, verified. No exceptions.',
  'Your buddy sees your daily logs and nudges you the moment you go quiet — accountability that doesn’t wait for you to ask.',
  'A personalised strategy, re-tuned every week from your own data — not the same plan handed to every student.',
];

const ROTATE_MS = 4500;
const FADE_MS = 300;

export function RotatingBuddyBanner({ className = '' }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeOut = setTimeout(() => setVisible(false), ROTATE_MS - FADE_MS);
    const swap = setTimeout(() => {
      setIndex((i) => (i + 1) % LINES.length);
      setVisible(true);
    }, ROTATE_MS);
    return () => { clearTimeout(fadeOut); clearTimeout(swap); };
  }, [index]);

  return (
    <Link
      href="/student/buddy"
      className={`group block rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-teal-50 p-4 transition-all hover:shadow-md hover:border-teal-300 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 mb-1">Why an IIM buddy</p>
          <p
            className={`text-sm text-stone-800 leading-relaxed transition-opacity motion-reduce:transition-none duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
          >
            {LINES[index]}
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-teal-700">
            See how it works
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </p>
        </div>
      </div>
    </Link>
  );
}
