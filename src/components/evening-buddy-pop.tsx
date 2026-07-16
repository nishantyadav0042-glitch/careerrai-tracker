'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight } from 'lucide-react';

// Evening nudge on the Profile screen (free students only): once per evening,
// surface the best-matched IIM buddy and send them straight to the full
// profile on tap. Founder ask — keep the buddy top-of-mind every evening
// without being a permanent banner. Shown at most once per IST day, evenings
// only (5pm+), remembered in localStorage.
interface Props {
  name: string;
  avatarUrl: string | null;
  college: string | null;
  percentile: number | null;
}

export function EveningBuddyPop({ name, avatarUrl, college, percentile }: Props) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- time/storage checks must run client-side */
    try {
      const istHour = Number(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })
      );
      if (istHour < 17) return; // evenings only
      const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const key = 'cr_evening_buddy_pop';
      if (localStorage.getItem(key) === istDate) return; // once per evening
      localStorage.setItem(key, istDate);
      setShow(true);
    } catch { /* noop */ }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!show) return null;

  const firstName = name.split(' ')[0] || name;
  const initials = name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const goToProfile = () => { setShow(false); router.push('/student/buddy'); };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => setShow(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setShow(false)}
          className="absolute right-4 top-4 text-stone-400 hover:text-stone-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Your best-matched buddy</p>

        <div className="mx-auto mt-3 h-20 w-20">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="h-20 w-20 rounded-full object-cover shadow-md" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 text-2xl font-bold text-purple-700 shadow-md">
              {initials}
            </div>
          )}
        </div>

        <h2 className="mt-3 text-lg font-bold text-stone-900">{name}</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          {[college, percentile ? `CAT ${percentile}%ile` : null].filter(Boolean).join(' · ')}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Check out {firstName}&apos;s profile — see exactly how a 1:1 IIM mentor would guide you to CAT.
        </p>

        <button
          type="button"
          onClick={goToProfile}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          See {firstName}&apos;s profile <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="mt-2 w-full py-2 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
