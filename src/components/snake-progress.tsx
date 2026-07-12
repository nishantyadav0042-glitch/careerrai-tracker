'use client';

import { useEffect, useRef, useState } from 'react';

// A little Snake-Xenia creature that lives along the top of the topic-coverage
// step and grows as the student "feeds" it topics. Each section gives it a
// different look and a different live action — colour, tongue colour, and how
// fast it flicks — so mapping VARC feels different from mapping QA. Purely
// decorative + motivating; carries no state of its own beyond the fed count.
const SECTION_LOOK: Record<string, { color: string; tail: string; name: string; tongue: string; speed: string }> = {
  VARC:    { color: '#0f766e', tail: '#0b4f49', name: 'VARC',    tongue: '#fb7185', speed: '1.1s' },
  DILR:    { color: '#2563eb', tail: '#1e3a8a', name: 'DILR',    tongue: '#fb7185', speed: '0.8s' },
  QA:      { color: '#ea580c', tail: '#9a3412', name: 'QA',      tongue: '#fde047', speed: '0.55s' },
  MOCKS:   { color: '#7c3aed', tail: '#4c1d95', name: 'Mocks',   tongue: '#22d3ee', speed: '0.95s' },
  READING: { color: '#059669', tail: '#065f46', name: 'Reading', tongue: '#f472b6', speed: '1.35s' },
};

export function SnakeProgress({
  frac,
  section,
  answered,
  total,
}: {
  frac: number;
  section: string;
  answered: number;
  total: number;
}) {
  const look = SECTION_LOOK[section] ?? SECTION_LOOK.VARC;
  const clamped = Math.min(100, Math.max(0, frac * 100));

  // Re-trigger a quick "lunge" whenever a new topic is fed.
  const [lunge, setLunge] = useState(0);
  const prev = useRef(answered);
  useEffect(() => {
    if (answered !== prev.current) {
      prev.current = answered;
      setLunge((l) => l + 1);
    }
  }, [answered]);

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-bold uppercase tracking-widest transition-colors" style={{ color: look.color }}>
          {look.name} trail
        </span>
        <span className="font-semibold tabular-nums text-stone-400">{answered}/{total} topics fed</span>
      </div>

      <div className="relative h-7">
        {/* the trail still to be eaten — pending topics as dots */}
        <div className="absolute inset-x-3 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full border border-stone-200/70 bg-stone-100">
          <div
            className="absolute inset-0 opacity-70"
            style={{ backgroundImage: 'radial-gradient(circle, #d6d3d1 1px, transparent 1.6px)', backgroundSize: '11px 11px', backgroundPosition: 'center' }}
          />
        </div>

        {/* body — grows with progress */}
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
          style={{
            left: '12px',
            width: `calc((100% - 24px) * ${clamped / 100})`,
            background: `linear-gradient(90deg, ${look.tail}, ${look.color})`,
            boxShadow: '0 1px 5px rgba(0,0,0,.14)',
            transition: 'width .5s cubic-bezier(.34,1.2,.64,1), background .5s ease',
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-25"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.7) 0 2px, transparent 2px 7px)' }}
          />
        </div>

        {/* head — leads the body, bobs, flicks its tongue */}
        <div
          className="absolute top-1/2"
          style={{
            left: `calc(12px + (100% - 24px) * ${clamped / 100})`,
            transform: 'translate(-50%, -50%)',
            transition: 'left .5s cubic-bezier(.34,1.2,.64,1)',
          }}
        >
          <div key={lunge} className="snk-lunge">
            <div
              className="snk-bob relative h-5 w-5 rounded-full"
              style={{ background: look.color, boxShadow: '0 2px 7px rgba(0,0,0,.25)', transition: 'background .5s ease' }}
            >
              {/* eyes */}
              <span className="absolute h-[5px] w-[5px] rounded-full bg-white" style={{ top: '4px', right: '3px' }}>
                <span className="absolute h-[2.5px] w-[2.5px] rounded-full bg-stone-900" style={{ top: '1px', right: 0 }} />
              </span>
              <span className="absolute h-[5px] w-[5px] rounded-full bg-white" style={{ top: '4px', left: '3px' }}>
                <span className="absolute h-[2.5px] w-[2.5px] rounded-full bg-stone-900" style={{ top: '1px', left: 0 }} />
              </span>
              {/* forked tongue — flick speed varies per section */}
              <span
                className="snk-tongue absolute left-full top-1/2"
                style={{ color: look.tongue, animationDuration: look.speed, transformOrigin: 'left center' }}
              >
                <svg width="13" height="9" viewBox="0 0 13 9" style={{ display: 'block' }}>
                  <path d="M0 4.5 H7 M7 4.5 L12 1.5 M7 4.5 L12 7.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes snkBob { 0%,100%{transform:translateY(-1.5px)} 50%{transform:translateY(1.5px)} }
        @keyframes snkLunge { 0%{transform:scale(1)} 35%{transform:scale(1.3)} 100%{transform:scale(1)} }
        @keyframes snkTongue { 0%,55%,100%{transform:translateY(-50%) scaleX(.25);opacity:.5} 72%,88%{transform:translateY(-50%) scaleX(1);opacity:1} }
        .snk-bob{animation:snkBob 1.6s ease-in-out infinite}
        .snk-lunge{animation:snkLunge .5s ease-out}
        .snk-tongue{animation:snkTongue 1s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){ .snk-bob,.snk-lunge,.snk-tongue{animation:none!important} }
      `}</style>
    </div>
  );
}
