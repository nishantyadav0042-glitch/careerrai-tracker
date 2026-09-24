// ── THE FIRST THING THE COUNSELLOR READS (founder, 24 Sep 2026) ─────────────
//
// "Guide Anshul when he opens the app. Tell him connecting streak breakers is
// non-negotiable … push them and bring them back on our app; if not, record
// their errors or get feedback on why they stopped. This is really really
// important."
//
// Standing guidance, shown on every open above the day's numbers. The counts
// come from the queue the page already built — the same cards the deck
// renders below, so the brief and the list cannot disagree.

export function LogBreakerBrief({ logBreakers, dailyLoggers }: { logBreakers: number; dailyLoggers: number }) {
  return (
    <div className="mb-3 rounded-2xl border-2 border-red-600 bg-red-50 p-4 text-stone-900">
      <p className="text-[11px] font-bold uppercase tracking-widest text-red-700">Rule #1 — non-negotiable</p>
      <p className="mt-1 text-base font-bold">
        {logBreakers > 0
          ? `Connect all ${logBreakers} log breaker${logBreakers === 1 ? '' : 's'} today, before anything else.`
          : 'No log breakers right now. The list refreshes every morning.'}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug">
        <li>A log breaker was logging and then missed a day. The day after the missed day is a must-connect day.</li>
        <li>No answer? Try again in the evening, and again tomorrow. Keep going until you connect.</li>
        <li>On the call: bring them back and help them log today.</li>
        <li>If they won&apos;t come back, find out why they stopped: an error in the app, something missing, or no time. Write their exact words in the remark.</li>
      </ul>
      {dailyLoggers > 0 && (
        <p className="mt-3 border-t border-red-200 pt-2 text-[13px]">
          <span className="font-bold">Then the {dailyLoggers} daily logger{dailyLoggers === 1 ? '' : 's'}:</span>{' '}
          ask why they log every day, what they like, what is unique, and what is missing or broken. No pitch. Write it in the remark.
        </p>
      )}
    </div>
  );
}
