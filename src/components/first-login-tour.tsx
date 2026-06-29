'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Mandatory one-time first-login tour. Self-explanatory AND a sales asset: it
// shows a brand-new student what the app does, builds belief, and plants the
// IIM-buddy upsell — all before they reach the tracker. Gated by
// student_engagement.tour_completed; on finish it records that and reloads so
// the student lands on their normal account. Shown only to free, non-demo users.
interface Slide {
  emoji: string;
  badge?: string;
  title: string;
  body: string;
  bullets?: string[];
}

const SLIDES: Slide[] = [
  {
    emoji: '👋',
    badge: 'Welcome',
    title: 'Yeh hai aapka prep command centre',
    body: 'CAT akele crack nahi hoti. CareerRai aapko roz track karta hai aur sahi raaste pe rakhta hai — bilkul free.',
  },
  {
    emoji: '🔥',
    badge: '30 seconds a day',
    title: 'Roz ek chhota log = ek streak',
    body: 'Har din likho: kitne ghante padha, kaunsa section, ek line aaj ki. Yehi chhoti consistency November me sabse bada farq daalti hai.',
    bullets: ['Streak banao, momentum dekho', 'Miss ho gaya? Wapas aana hi jeet hai'],
  },
  {
    emoji: '📈',
    badge: 'Your dream, on screen',
    title: 'Apne sapne ke college tak ka raasta',
    body: 'Aapka percentile, aapka target, aapka trajectory — sab ek jagah. Har log aapko dream college ke kareeb le jaata hai.',
  },
  {
    emoji: '📊',
    badge: 'The real work',
    title: 'Har mock ko decode karo',
    body: 'Sirf score nahi — har galti ka naam: silly, time, ya concept. Yahi cheez 30 mocks dene se zyada kaam aati hai.',
  },
  {
    emoji: '🎓',
    badge: 'The edge',
    title: 'Aur ek real IIM senior — sirf aapke liye',
    body: 'App aapko consistent rakhta hai. Ek IIM buddy us consistency ko call letter me badalta hai — 1-on-1, aapki personalised strategy ke saath. Jab ready ho, unlock kar lena.',
    bullets: ['1-on-1, kabhi group nahi', 'Har hafte aapke saath baithega', '200+ IIM mentors ready'],
  },
];

export function FirstLoginTour() {
  const [i, setI] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const slide = SLIDES[i];
  const isLast = i === SLIDES.length - 1;

  function next() {
    if (!isLast) { setI(i + 1); return; }
    finish();
  }

  function finish() {
    setFinishing(true);
    // Record completion, then reload into the normal tracker. Even if the POST
    // is slow/fails we still proceed — the tour must never trap the student.
    fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'tour_completed' }),
    })
      .catch(() => {})
      .finally(() => window.location.reload());
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-stone-50 to-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">
        {/* Progress dots */}
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-all ${idx <= i ? 'bg-orange-600' : 'bg-stone-200'}`}
            />
          ))}
        </div>

        {/* Slide body */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-4xl shadow-sm">
            {slide.emoji}
          </div>
          {slide.badge && (
            <span className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
              {slide.badge}
            </span>
          )}
          <h1 className="text-2xl font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {slide.title}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-600">{slide.body}</p>

          {slide.bullets && (
            <ul className="mt-5 space-y-2 text-left">
              {slide.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] text-orange-700">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer nav */}
        <div className="space-y-3">
          <Button onClick={next} variant="primary" size="lg" className="w-full" disabled={finishing}>
            {finishing ? 'Chalte hain…' : isLast ? 'Apni prep shuru karo →' : 'Aage badho →'}
          </Button>
          {i > 0 && !finishing && (
            <div className="flex justify-center text-xs">
              <button type="button" onClick={() => setI(i - 1)} className="text-stone-400 hover:text-stone-600">
                ← Peeche
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
