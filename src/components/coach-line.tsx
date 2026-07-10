'use client';

import { useQuery } from '@tanstack/react-query';

// The daily coach line, loaded AFTER the page paints so it never blocks Home.
// If the model is slow/absent the route returns a deterministic fallback, and
// if there's genuinely nothing to say (brand-new account) it returns null and
// this renders nothing.
export function CoachLine() {
  const { data } = useQuery<{ line: string | null }>({
    queryKey: ['coach-line'],
    queryFn: async () => {
      const res = await fetch('/api/coach-line');
      if (!res.ok) return { line: null };
      return res.json();
    },
    staleTime: 1000 * 60 * 60, // an hour — the line is cached per day server-side
    retry: false,
  });

  const line = data?.line;
  if (!line) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <span className="mt-0.5 shrink-0 text-sm" aria-hidden>💬</span>
      <p className="text-sm leading-snug text-stone-700">{line}</p>
    </div>
  );
}
