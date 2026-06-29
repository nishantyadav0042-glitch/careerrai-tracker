'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// The "Unlock your buddy" CTA. Clicking it is the HOTTEST buying signal — it
// fires a buddy_cta_click engagement event (→ sales-ready) and opens a sheet
// that explains the premium. It deliberately does NOT take payment here; the
// founder closes on the evening call (the click is what surfaces them).
function logCtaClick() {
  // Fire-and-forget; never block the UI on it.
  fetch('/api/engagement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'buddy_cta_click' }),
  }).catch(() => {});
}

export function UnlockBuddyButton({
  children = 'Unlock your buddy',
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'accent' | 'teal' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  function openSheet() {
    logCtaClick();
    setOpen(true);
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openSheet}>
        {children}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!requested ? (
              <>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-2xl">
                  🔓
                </div>
                <h2 className="text-center text-lg font-bold text-stone-900">Apna IIM buddy unlock karo</h2>
                <p className="mt-1 text-center text-sm text-stone-600">
                  App toh free hai. Ek <span className="font-semibold text-stone-800">real IIM senior</span> jo
                  sirf aapko track kare — woh premium hai.
                </p>

                <ul className="mt-4 space-y-2.5 text-sm text-stone-700">
                  <li className="flex gap-2"><span>🎯</span> Roz aapke logs dekhke <strong>kal ka plan</strong></li>
                  <li className="flex gap-2"><span>📊</span> Har mock <strong>aapke saath decode</strong> — har error named</li>
                  <li className="flex gap-2"><span>🎥</span> Weekly 1-on-1 video session</li>
                  <li className="flex gap-2"><span>💬</span> Chat &amp; voice — jab atko tab</li>
                </ul>

                <div className="mt-5 rounded-xl bg-stone-50 px-4 py-3 text-center">
                  <span className="text-2xl font-bold text-stone-900">₹999</span>
                  <span className="text-sm text-stone-500">/month</span>
                  <p className="mt-0.5 text-[11px] text-stone-400">21-din try karo, value na mile toh full refund.</p>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="mt-5 w-full"
                  onClick={() => setRequested(true)}
                >
                  Haan, mujhe buddy chahiye →
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full text-center text-xs text-stone-400 hover:text-stone-600"
                >
                  Abhi nahi
                </button>
              </>
            ) : (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
                  ✅
                </div>
                <h2 className="text-lg font-bold text-stone-900">Ho gaya! 🙌</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Hamari team aapko jaldi call karke aapka IIM buddy set up karegi. Tab tak — aaj ka log
                  bhar do, taaki aapke buddy ke paas data ready ho. 💪
                </p>
                <Button variant="primary" size="md" className="mt-5 w-full" onClick={() => setOpen(false)}>
                  Theek hai
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
