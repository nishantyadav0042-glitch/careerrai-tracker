'use client';
import { useState } from 'react';
import { CAT_FACTS } from '@/lib/messages';

// Lazy initialiser: computed once on mount, same tip all calendar day.
export function AnchorLine() {
  const [idx] = useState(() => Math.floor(Date.now() / 86_400_000) % CAT_FACTS.length);

  return (
    <p className="text-center text-sm font-medium text-stone-500 px-2">
      {CAT_FACTS[idx]}
    </p>
  );
}
