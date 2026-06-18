'use client';
import { useState, useEffect } from 'react';
import { CAT_FACTS } from '@/lib/messages';

// Stable index per calendar day — same tip all day, changes at midnight.
export function AnchorLine() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(Math.floor(Date.now() / 86_400_000) % CAT_FACTS.length);
  }, []);

  return (
    <p className="text-center text-sm font-medium text-stone-500 px-2">
      {CAT_FACTS[idx]}
    </p>
  );
}
