// RAI — CareerRai's one and only mascot (founder decision, 14 July v3).
// The 9-character cast is gone: one original chibi buddy ("Rai", straight
// from the brand name) rides the onboarding trail and LEVELS UP on every
// step, gaining one piece of gear each time. The gear does the nostalgia
// winking (squad helmet, goggles, hoverboard…) with zero borrowed names or
// designs — Rai is 100% our IP, built to become stickers, loading
// animations, and WhatsApp reactions later. The finale shows the full
// evolution line, Lv1 → Lv9.
//
// Design brief (locked): big expressive eyes, hoodie + backpack like a
// college student, chibi proportions, confident but approachable, flat
// shapes that survive 16px.

interface RaiProps {
  size?: number;
  level?: number; // 1–9; gear is additive — Lv5 wears everything from Lv2–5
}

export interface RaiLevel {
  level: number;
  gear: string; // celebration copy: "Rai levels up: {gear}"
}

export const RAI_LEVELS: RaiLevel[] = [
  { level: 1, gear: 'bag packed, ready 🎒' },
  { level: 2, gear: 'reading habit 📖' },
  { level: 3, gear: 'squad helmet on' },
  { level: 4, gear: 'pro goggles' },
  { level: 5, gear: 'spark badge ⚡' },
  { level: 6, gear: 'hoverboard unlocked' },
  { level: 7, gear: 'explorer satchel' },
  { level: 8, gear: 'mock stopwatch ⏱️' },
  { level: 9, gear: 'FINAL FORM — cape on 🦸' },
];

export function Rai({ size = 32, level = 1 }: RaiProps) {
  const lv = Math.max(1, Math.min(9, level));
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {/* Lv9 cape — behind everything */}
      {lv >= 9 && (
        <path d="M22 37 Q8 48 12 58 Q22 54 32 57 Q42 54 52 58 Q56 48 42 37 z" fill="#dc2626" />
      )}
      {/* Lv6 hoverboard */}
      {lv >= 6 && (
        <>
          <rect x="16" y="59" width="32" height="4" rx="2" fill="#7c3aed" />
          <rect x="20" y="63" width="24" height="1" rx="0.5" fill="#c4b5fd" />
        </>
      )}
      {/* backpack lobes peeking out behind the body */}
      <rect x="16" y="39" width="7" height="13" rx="3.5" fill="#f59e0b" />
      <rect x="41" y="39" width="7" height="13" rx="3.5" fill="#f59e0b" />
      {/* shoes */}
      <ellipse cx="26" cy="58" rx="4" ry="2.5" fill="#292524" />
      <ellipse cx="38" cy="58" rx="4" ry="2.5" fill="#292524" />
      {/* hoodie body (CareerRai teal) */}
      <rect x="22" y="36" width="20" height="21" rx="8" fill="#0d9488" />
      <path d="M24 38 q8 5 16 0" stroke="#0f766e" strokeWidth="1.5" fill="none" />
      {/* backpack straps */}
      <rect x="25.5" y="37" width="3.5" height="8" rx="1.75" fill="#b45309" />
      <rect x="35" y="37" width="3.5" height="8" rx="1.75" fill="#b45309" />
      {/* Lv2 open book */}
      {lv >= 2 && (
        <g>
          <path d="M24 47 q4 -2 8 0 q4 -2 8 0 l0 6 q-4 -2 -8 0 q-4 2 -8 0 z" fill="#ffffff" stroke="#a8a29e" strokeWidth="0.8" />
          <line x1="32" y1="47" x2="32" y2="53" stroke="#a8a29e" strokeWidth="0.8" />
        </g>
      )}
      {/* Lv5 spark badge on the chest */}
      {lv >= 5 && (
        <polygon points="28,39 25.5,43 27.5,43 26,46.5 30,42 28.2,42" fill="#facc15" />
      )}
      {/* Lv7 satchel */}
      {lv >= 7 && (
        <g>
          <line x1="26" y1="37" x2="44" y2="52" stroke="#78350f" strokeWidth="2.5" />
          <rect x="40" y="48" width="8" height="6" rx="2" fill="#78350f" />
        </g>
      )}
      {/* head */}
      <circle cx="32" cy="22" r="14" fill="#fcd9b8" />
      {/* hair + the signature ahoge (one stubborn hair sprout) */}
      <path d="M18 22 a14 14 0 0 1 28 0 l0 1 q-14 -7 -28 0 z" fill="#292524" />
      <path d="M31 8 q1 -5 4 -6 q-1 4 0 6 z" fill="#292524" />
      {/* Lv3 squad helmet */}
      {lv >= 3 && (
        <g>
          <path d="M17 21 a15 15 0 0 1 30 0 l0 2 h-30 z" fill="#4d7c0f" />
          <rect x="17" y="21" width="30" height="3.5" rx="1.75" fill="#3f6212" />
        </g>
      )}
      {/* Lv4 goggles resting on the helmet dome */}
      {lv >= 4 && (
        <g>
          <line x1="24" y1="17.5" x2="40" y2="17.5" stroke="#334155" strokeWidth="1.5" />
          <circle cx="27" cy="17.5" r="2.6" fill="#7dd3fc" stroke="#334155" strokeWidth="1.5" />
          <circle cx="37" cy="17.5" r="2.6" fill="#7dd3fc" stroke="#334155" strokeWidth="1.5" />
        </g>
      )}
      {/* big expressive eyes + blush + confident smile */}
      <circle cx="26" cy="24" r="3.4" fill="#1c1917" />
      <circle cx="38" cy="24" r="3.4" fill="#1c1917" />
      <circle cx="27.1" cy="22.8" r="1.1" fill="#ffffff" />
      <circle cx="39.1" cy="22.8" r="1.1" fill="#ffffff" />
      <circle cx="21.5" cy="28" r="1.8" fill="#fdba74" />
      <circle cx="42.5" cy="28" r="1.8" fill="#fdba74" />
      <path d="M28 30 q4 3.5 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Lv8 stopwatch floating by the hand */}
      {lv >= 8 && (
        <g>
          <rect x="14.8" y="28" width="2.4" height="2.5" fill="#334155" />
          <circle cx="16" cy="34" r="4.5" fill="#ffffff" stroke="#334155" strokeWidth="2" />
          <line x1="16" y1="34" x2="16" y2="31.5" stroke="#334155" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
