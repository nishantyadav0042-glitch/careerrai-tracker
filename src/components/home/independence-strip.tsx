import {
  isIndependenceWindow, isIndependenceDay,
  INDEPENDENCE_HEADLINE, INDEPENDENCE_RUNUP, INDEPENDENCE_LINE,
} from '@/lib/independence';

// The tricolour, used with a light hand. Saffron → white → green as a thin
// rule above the greeting, and the chakra blue on the line beneath it — the
// flag suggested rather than reproduced, which is both more tasteful on a
// study screen and avoids rendering the national flag as decoration.
//
// Server component: the window is a date computation with no interactivity,
// so nothing here needs to reach the client bundle.
export function IndependenceStrip({ now = new Date() }: { now?: Date }) {
  if (!isIndependenceWindow(now)) return null;
  const onTheDay = isIndependenceDay(now);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {/* The tricolour rule. Three equal bands, thin enough to read as an
          accent rather than a flag being flown. */}
      <div className="flex h-1.5" aria-hidden="true">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      <div className="px-4 py-2.5">
        <p className="text-[13px] font-extrabold leading-tight text-stone-900">
          {onTheDay ? INDEPENDENCE_HEADLINE : INDEPENDENCE_RUNUP}
        </p>
        <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-[#000080]">
          {INDEPENDENCE_LINE}
        </p>
      </div>
    </div>
  );
}
