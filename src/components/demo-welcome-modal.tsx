'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

// One-time welcome popup shown when a lead opens the shareable /demo link.
// The /demo route redirects to /student/tracker?demo=welcome — this reads that
// flag, greets the visitor, then strips the param so a refresh won't re-open it.
function DemoWelcomeModalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Derive from the URL at first render — no effect needed. dismiss() both
  // closes the modal and strips the param, so it won't reopen on refresh.
  const [open, setOpen] = useState(() => searchParams.get('demo') === 'welcome');

  function dismiss() {
    setOpen(false);
    // Drop ?demo=welcome from the URL without a navigation/scroll jump.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('demo');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-2xl">
          👀
        </div>
        <h2 className="text-lg font-semibold text-stone-900">This is a demo profile</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          You&apos;re viewing a real CareerRai student&apos;s live dashboard — their
          daily tracker, mock-test scores and progress over 30 days. It&apos;s
          <span className="font-medium text-stone-800"> view-only</span>, so feel
          free to explore; nothing you tap changes their data.
        </p>
        <Button onClick={dismiss} variant="primary" size="md" className="mt-5 w-full">
          Explore the demo
        </Button>
      </div>
    </div>
  );
}

export function DemoWelcomeModal() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <DemoWelcomeModalInner />
    </Suspense>
  );
}
