'use client';

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { InstallButton } from '@/components/install/install-button';

// Today's insight, ON the home screen (founder, 21 July: "add this insight in
// app as well, not just notification"). Every app open delivers the insight
// even when push can't reach them — and in a BROWSER tab the same card
// becomes the install hook: "this reaches you daily in the app", feeding the
// chain insight → install → open app → notifications (which the installed
// app's first-run queue already asks first).
interface Props {
  title: string;
  text: string;
  kind: string;
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export function DailyInsightCard({ title, text, kind }: Props) {
  const [inBrowser, setInBrowser] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- display-mode detection must run client-side */
  useEffect(() => {
    setInBrowser(!isStandalone());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const warm = kind === 'recovery' || kind === 'consistency' || kind === 'progress';

  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm ${warm ? 'border-emerald-200 bg-emerald-50/60' : 'border-orange-200 bg-orange-50/60'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${warm ? 'bg-emerald-600' : 'bg-orange-500'}`}>
          <Lightbulb className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Today&apos;s insight</p>
          <p className="mt-0.5 text-[13px] font-bold leading-snug text-stone-900">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-700">{text}</p>
        </div>
      </div>
      {inBrowser && (
        <div className="mt-3 border-t border-stone-200/70 pt-3">
          <p className="mb-2 text-[12px] font-medium text-stone-600">
            One insight like this reaches you <b>every evening — in the installed app</b>. Get it on your Home Screen:
          </p>
          <InstallButton variant="banner" />
        </div>
      )}
    </div>
  );
}
