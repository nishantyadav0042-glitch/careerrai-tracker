// CareerRai's 9 original trail mascots (founder decision, 14 July): replace
// the emoji trail characters with our OWN chibi cast. Each one is an original
// design that evokes a nostalgia source every 2000–2008-born Indian student
// knows (battle royale, hostel shooters, Hungama cartoons, endless runners…)
// without copying any copyrighted character — same familiarity, zero IP risk.
// Different industries on purpose: gaming, TV, robots, creatures, space.
// Simple flat shapes so they scale down to 16px and can later become
// stickers, loading animations, and WhatsApp reactions.

interface MascotProps {
  size?: number;
}

// 1 · Battle-royale energy: the green helmet + visor silhouette.
function Helmo({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="22" y="44" width="20" height="14" rx="6" fill="#57534e" />
      <rect x="27" y="47" width="10" height="9" rx="3" fill="#78716c" />
      <circle cx="32" cy="30" r="18" fill="#fcd9b8" />
      <path d="M14 30 a18 18 0 0 1 36 0 z" fill="#4d7c0f" />
      <rect x="14" y="26" width="36" height="6" rx="3" fill="#3f6212" />
      <rect x="18" y="30" width="28" height="9" rx="4.5" fill="#1c1917" />
      <circle cx="26" cy="34.5" r="2" fill="#a3e635" />
      <circle cx="38" cy="34.5" r="2" fill="#a3e635" />
      <path d="M28 43 q4 3 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 2 · Hostel-shooter nostalgia: goggles + jetpack + flames.
function Jetu({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="12" y="34" width="9" height="18" rx="4.5" fill="#94a3b8" />
      <rect x="43" y="34" width="9" height="18" rx="4.5" fill="#94a3b8" />
      <polygon points="13,52 20,52 16.5,60" fill="#fb923c" />
      <polygon points="44,52 51,52 47.5,60" fill="#fb923c" />
      <rect x="24" y="38" width="16" height="18" rx="6" fill="#f97316" />
      <circle cx="32" cy="25" r="15" fill="#fcd9b8" />
      <path d="M20 16 l4 -6 3 5 5 -7 5 7 3 -5 4 6 z" fill="#292524" />
      <rect x="17" y="20" width="30" height="6" rx="3" fill="#334155" />
      <circle cx="25" cy="23" r="6" fill="#7dd3fc" stroke="#334155" strokeWidth="2" />
      <circle cx="39" cy="23" r="6" fill="#7dd3fc" stroke="#334155" strokeWidth="2" />
      <path d="M28 33 q4 3 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 3 · Hungama-cartoon mischief: thick eyebrows, dot eyes, giant smirk.
function Montu({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="22" y="45" width="20" height="14" rx="5" fill="#ef4444" />
      <circle cx="19" cy="50" r="4" fill="#fcd9b8" />
      <circle cx="45" cy="50" r="4" fill="#fcd9b8" />
      <ellipse cx="32" cy="29" rx="19" ry="17" fill="#fcd9b8" />
      <path d="M13 27 A19 17 0 0 1 51 27 Q32 18 13 27 Z" fill="#1c1917" />
      <rect x="19" y="31" width="10" height="4" rx="2" fill="#1c1917" transform="rotate(-8 24 33)" />
      <rect x="35" y="31" width="10" height="4" rx="2" fill="#1c1917" transform="rotate(8 40 33)" />
      <circle cx="25" cy="38" r="2" fill="#1c1917" />
      <circle cx="39" cy="38" r="2" fill="#1c1917" />
      <path d="M25 43 q7 6 14 1" stroke="#92400e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 4 · Helper-robot-with-a-pocket archetype: the buddy who always has a fix.
function Dobu({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="12" x2="32" y2="6" stroke="#0284c7" strokeWidth="2" />
      <circle cx="32" cy="5" r="3" fill="#f59e0b" />
      <circle cx="32" cy="34" r="22" fill="#38bdf8" />
      <ellipse cx="32" cy="41" rx="15" ry="12" fill="#ffffff" />
      <rect x="23" y="23" width="7" height="9" rx="3.5" fill="#ffffff" />
      <rect x="34" y="23" width="7" height="9" rx="3.5" fill="#ffffff" />
      <circle cx="26.5" cy="28" r="1.8" fill="#0c4a6e" />
      <circle cx="37.5" cy="28" r="1.8" fill="#0c4a6e" />
      <path d="M28 37 q4 3 8 0" stroke="#0284c7" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M24 43 a8 8 0 0 0 16 0 z" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.5" />
    </svg>
  );
}

// 5 · Creature-collector spark: electric-yellow critter, bolt on top.
function Volty({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="34,3 25,17 31,17 27,28 39,13 33,13" fill="#f59e0b" />
      <circle cx="32" cy="41" r="18" fill="#facc15" />
      <ellipse cx="15" cy="45" rx="4" ry="3" fill="#facc15" />
      <ellipse cx="49" cy="45" rx="4" ry="3" fill="#facc15" />
      <circle cx="25" cy="38" r="4" fill="#1c1917" />
      <circle cx="39" cy="38" r="4" fill="#1c1917" />
      <circle cx="26.3" cy="36.7" r="1.3" fill="#ffffff" />
      <circle cx="40.3" cy="36.7" r="1.3" fill="#ffffff" />
      <circle cx="20" cy="45" r="3" fill="#fb923c" />
      <circle cx="44" cy="45" r="3" fill="#fb923c" />
      <path d="M29 46 q3 2.5 6 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 6 · Endless-runner kid: sideways cap, hoodie, hoverboard.
function Zoomi({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="18" y="59" width="28" height="2.5" rx="1.25" fill="#c4b5fd" />
      <rect x="14" y="54" width="36" height="5" rx="2.5" fill="#7c3aed" />
      <rect x="23" y="34" width="18" height="20" rx="7" fill="#f43f5e" />
      <circle cx="29" cy="40" r="1.3" fill="#ffffff" />
      <circle cx="35" cy="40" r="1.3" fill="#ffffff" />
      <circle cx="32" cy="24" r="13" fill="#fcd9b8" />
      <path d="M19 24 a13 13 0 0 1 26 0 z" fill="#2563eb" />
      <rect x="42" y="20" width="10" height="4" rx="2" fill="#2563eb" />
      <circle cx="27" cy="28" r="2" fill="#1c1917" />
      <circle cx="37" cy="28" r="2" fill="#1c1917" />
      <path d="M28 33 q4 3 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 7 · Temple-explorer archetype: fedora, satchel, always moving forward.
function Indu({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="23" y="44" width="18" height="14" rx="6" fill="#ca8a04" />
      <line x1="26" y1="44" x2="38" y2="58" stroke="#78350f" strokeWidth="3" />
      <rect x="35" y="51" width="9" height="7" rx="2" fill="#78350f" />
      <circle cx="32" cy="31" r="13" fill="#fcd9b8" />
      <path d="M22 20 a10 9 0 0 1 20 0 z" fill="#b45309" />
      <rect x="22" y="17" width="20" height="3.5" fill="#7c2d12" />
      <ellipse cx="32" cy="20" rx="17" ry="4" fill="#92400e" />
      <circle cx="27" cy="31" r="2" fill="#1c1917" />
      <circle cx="37" cy="31" r="2" fill="#1c1917" />
      <path d="M28 37 q4 3 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 8 · The focused red bird — furious at wasted marks, wears study specs.
function Gussa({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="36" r="20" fill="#ef4444" />
      <ellipse cx="32" cy="47" rx="10" ry="6.5" fill="#fecaca" />
      <path d="M29 17 q-2 -9 3 -11 q-1 7 1 9 z" fill="#b91c1c" />
      <path d="M34 16 q1 -8 6 -9 q-3 6 -2 9 z" fill="#b91c1c" />
      <rect x="18" y="23" width="11" height="4" rx="2" fill="#7f1d1d" transform="rotate(16 23.5 25)" />
      <rect x="35" y="23" width="11" height="4" rx="2" fill="#7f1d1d" transform="rotate(-16 40.5 25)" />
      <circle cx="25" cy="32" r="6" fill="#ffffff" stroke="#1c1917" strokeWidth="2" />
      <circle cx="39" cy="32" r="6" fill="#ffffff" stroke="#1c1917" strokeWidth="2" />
      <line x1="31" y1="32" x2="33" y2="32" stroke="#1c1917" strokeWidth="2" />
      <circle cx="25" cy="33" r="2" fill="#1c1917" />
      <circle cx="39" cy="33" r="2" fill="#1c1917" />
      <polygon points="29,39 35,39 32,44" fill="#f59e0b" />
    </svg>
  );
}

// 9 · The finale: a little astronaut — the plan is built, mission launches.
function Astro({ size = 32 }: MascotProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="46" width="6" height="10" rx="3" fill="#94a3b8" />
      <rect x="42" y="46" width="6" height="10" rx="3" fill="#94a3b8" />
      <rect x="22" y="44" width="20" height="14" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
      <rect x="22" y="48" width="20" height="3.5" fill="#f97316" />
      <circle cx="32" cy="28" r="18" fill="#e0f2fe" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="32" cy="30" r="11" fill="#fcd9b8" />
      <path d="M25 29 q2 -2.5 4 0" stroke="#1c1917" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M35 29 q2 -2.5 4 0" stroke="#1c1917" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M28 34 q4 3.5 8 0" stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M20 18 a16 16 0 0 1 10 -5" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export interface TrailMascot {
  id: string;
  name: string;
  // One-breath identity shown nowhere yet — kept for stickers/marketing.
  tag: string;
  Mascot: (props: MascotProps) => React.JSX.Element;
}

// Order = the 9 coverage steps; the finale mascot lands on the last step on
// purpose. Names (founder correction, 14 July): invented names carried zero
// recognition — these are words the 2000–2008-born cohort already says daily
// (game meme slang + Hindi), which are generic vocabulary (not trademarks)
// yet instantly place the character: "Chicken Dinner" IS the PUBG memory
// without ever saying PUBG.
export const MASCOTS: TrailMascot[] = [
  { id: 'chicken-dinner', name: 'Chicken Dinner', tag: 'winner winner', Mascot: Helmo },
  // "Mini Militia" is Miniclip's mark; "Militia" alone is a dictionary word.
  { id: 'militia', name: 'Militia', tag: 'hostel WiFi legend', Mascot: Jetu },
  { id: 'chintu', name: 'Chintu', tag: 'the naughty topper', Mascot: Montu },
  // THE Doraemon signifier everyone quotes ("…ki pocket") — generic word.
  { id: 'pocket', name: 'Pocket', tag: 'har problem ka gadget', Mascot: Dobu },
  { id: 'bijlee', name: 'Bijlee', tag: 'the spark', Mascot: Volty },
  // "Subway Surfers" is SYBO's mark; "Surfer" alone is a dictionary word,
  // and with the hoverboard design it places itself.
  { id: 'surfer', name: 'Surfer', tag: 'catch me if you can', Mascot: Zoomi },
  { id: 'khoji', name: 'Khoji', tag: 'the explorer', Mascot: Indu },
  { id: 'gussa', name: 'Gussa', tag: 'the focused bird', Mascot: Gussa },
  { id: 'imposter', name: 'Imposter', tag: '100% not sus', Mascot: Astro },
];
