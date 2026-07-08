'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

// Sharper pass: specific and a little confrontational, not just feature
// descriptions — "you" language, a challenge the reader has to answer
// honestly, contrast that stings a little. Still zero fabricated stats
// ("increases your chances by X%" is a made-up number with no study behind
// it and breaks this app's own no-invented-numbers rule) — every claim
// below is either a real fact (verified 95%ile+, IIM) or a description of
// what actually happens in a session. Specificity is what's supposed to do
// the convincing here, not adjectives.
const LINES = [
  'You’ve given 30 mocks. Can you name the ONE mistake repeating in all of them? Your buddy can.',
  'Self-study means nobody checks your work. A buddy does — every week, before a wrong strategy costs you a percentile.',
  '90%ile and 99%ile don’t study different hours. One of them has someone catching what they can’t see in their own mistakes.',
  'Every CareerRai buddy cleared CAT at 95%ile+ — they’ve stood exactly where you’re standing now.',
  'Most aspirants find out their strategy was wrong after the result. A weekly buddy session catches it months before results day, not after.',
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
