import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// One line on Home, and only a line (founder, 25 Jul: "don't put this on the
// homescreen at all — just tell them today's question and tip, then
// redirect"). The community lives in its own tab; Home only points at it.
export function DailyPickTeaser() {
  return (
    <Link
      href="/student/community"
      className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 active:scale-[0.99]"
    >
      <span className="text-[16px]">💡</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-stone-900">
          Today&apos;s student tip &amp; question are live
        </span>
        <span className="block text-[11px] text-stone-500">
          Students helping students — cast your vote
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
    </Link>
  );
}
