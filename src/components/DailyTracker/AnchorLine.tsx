'use client';
import { useState, useEffect } from 'react';
import { ANCHOR_LINES } from '@/lib/messages';

// Stable index per ~2-hour window so the line doesn't flicker on mount.
export function AnchorLine() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(Math.floor(Date.now() / (2 * 3_600_000)) % ANCHOR_LINES.length);
  }, []);

  return (
    <p className="text-center text-sm font-medium text-stone-500 italic px-2">
      {ANCHOR_LINES[idx]}
    </p>
  );
}
