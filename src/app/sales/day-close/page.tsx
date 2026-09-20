import { requireSales } from '@/lib/admin-auth';
import { salesPrincipal } from '@/lib/sales-authz';
import { istTodaySoFarWindow, repDaySnapshot } from '@/lib/sales-yesterday';
import { readToday } from '@/lib/sales-opportunity-record';
import { buildDayClose, headline, owed, isConversation, type StudentVoice } from '@/lib/sales-day-close';
import { isTypedRemark } from '@/lib/sales-remarks';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { chunkIds } from '@/lib/truth/batch';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Day close · CareerRai' };

// ── ONE SCREEN THE REP SCREENSHOTS AND SENDS ────────────────────────────────
//
// Founder, 15 Sep 2026: at shift end each counsellor sends a short summary —
// how many calls, how many did not connect, what students said. This is that
// summary, rendered from the same rows the founder's own dashboard reads, so
// the screenshot and the Control Tower can never tell different stories.
//
// It is built for a PHONE SCREENSHOT: no scrolling needed for the numbers, the
// rep's name and the date inside the frame (a cropped screenshot with no date
// is worthless a week later), and nothing interactive that a still image
// would lose.

export default async function DayClosePage() {
  const { user, admin } = await requireSales();
  const principal = await salesPrincipal(admin, user.id);
  const repId = principal?.id ?? user.id;

  const window = istTodaySoFarWindow();
  const [snapshot, cards, profile] = await Promise.all([
    repDaySnapshot(admin, repId, window),
    readToday(admin, repId),
    admin.from('profiles').select('full_name').eq('id', repId).maybeSingle(),
  ]);

  // What students said today, newest first. Only rows where a human actually
  // answered AND the rep typed their own words — an auto-note is the system
  // talking, not a student (lib/sales-remarks owns that rule).
  const { data: saidRows } = await admin
    .from('sales_activity')
    .select('student_id, status, note, created_at')
    .eq('actor_id', repId)
    .eq('provenance', 'self_reported')
    .gte('created_at', window.startIso)
    .lt('created_at', window.endIso)
    .order('created_at', { ascending: false });

  const said = ((saidRows ?? []) as Array<{ student_id: string; status: string; note: string | null }>)
    .filter((r) => isConversation(r.status) && isTypedRemark(r.status, r.note));

  const names = new Map<string, string>();
  if (said.length) {
    // Chunked for consistency, not because it was broken: this list is bounded
    // by ONE rep's typed conversations in ONE day — at most DAY_CEILING, so
    // ~70 ids and well inside the URL limit. The two reads that did break
    // (sales-board 19 Sep, sales-portfolio 20 Sep) were bounded by the BOOK,
    // which grows; a day cannot. Chunking it anyway removes the shape from the
    // counsellor workspace entirely, so the next audit has nothing to weigh up.
    const results = await Promise.all(
      chunkIds([...new Set(said.map((r) => r.student_id))]).map((chunk) =>
        admin.from('profiles').select('id, full_name').in('id', chunk)),
    );
    for (const r of results as Array<{ data: Array<{ id: string; full_name: string | null }> | null }>) {
      for (const p of (r.data ?? [])) names.set(p.id, p.full_name ?? 'Student');
    }
  }
  const voices: StudentVoice[] = said.map((r) => ({
    studentId: r.student_id,
    studentName: names.get(r.student_id) ?? 'Student',
    outcome: r.status,
    words: (r.note ?? '').trim(),
  }));

  // Promises that came due and have not been kept today.
  //
  // PAGED, because of Incident #65: lead_outreach is population-scaled, and an
  // unbounded select returns PostgREST's first thousand rows with no error. A
  // rep whose overdue pile crossed that line would read a card that quietly
  // under-counts what they owe — the one number on here they must not be able
  // to escape.
  const { data: dueRows, error: dueErr } = await fetchAll<{ student_id: string }>(() => admin
    .from('lead_outreach')
    .select('student_id')
    .eq('owner_id', repId)
    .not('callback_at', 'is', null)
    .lt('callback_at', new Date().toISOString()), { orderBy: 'student_id' });
  const workedToday = new Set(cards.filter((c) => c.outcome).map((c) => c.studentId));
  // A failed read must not print "0 promises outstanding" — that is the
  // comfortable lie. Null tells the card to say it could not check.
  const promisesDueUnkept = dueErr ? null
    : (dueRows ?? []).filter((r) => !workedToday.has(r.student_id)).length;

  const d = buildDayClose({
    repName: (profile?.data?.full_name as string | null) ?? 'Counsellor',
    snapshot,
    voices,
    cardsGiven: cards.length,
    cardsWorked: cards.filter((c) => c.outcome).length,
    promisesDueUnkept,
  });

  const stillOwed = owed(d);
  const label = new Date(`${d.label}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Day close</h1>
        <p className="mt-0.5 text-xs text-stone-500">Screenshot this and send it when you finish your shift.</p>
      </div>

      {/* THE CARD. Everything inside this box is what the screenshot must
          capture — name and date included, so it stands alone later. */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <p className="text-[15px] font-bold text-stone-900">{d.repName}</p>
          <p className="text-[12px] font-semibold tabular-nums text-stone-500">{label}</p>
        </div>

        {/* 1 — what the day produced */}
        <div className="border-b border-stone-100 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Today</p>
          <p className="mt-1 text-[17px] font-bold leading-snug text-stone-900">{headline(d)}</p>
        </div>

        {/* 2 — what students said, in their own words */}
        <div className="border-b border-stone-100 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">What students said</p>
          {d.voices.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-stone-500">
              No conversations to report today.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {d.voices.map((v) => (
                <li key={`${v.studentId}-${v.words.slice(0, 12)}`} className="text-[13px] leading-snug text-stone-700">
                  <span className="font-bold text-stone-900">{v.studentName}</span>
                  <span className="text-stone-400"> · {v.outcome.replace(/_/g, ' ')}</span>
                  <br />
                  {v.words}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3 — the unfinished half. Rendered only when there IS one, so its
            presence is the signal and a clean day stays clean. */}
        {stillOwed && (
          <div className="border-b border-stone-100 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Still open</p>
            <p className="mt-1 text-[13.5px] font-semibold leading-snug text-amber-900">{stillOwed}</p>
          </div>
        )}

        {/* 4 — the raw counts, deliberately last and deliberately small.
            SALES-OS §0: these are context for understanding the day, never the
            judgement on it. */}
        <div className="grid grid-cols-4 divide-x divide-stone-100 border-b border-stone-100">
          {[
            { l: 'Attempts', v: d.attempts },
            { l: 'Students', v: d.studentsTouched },
            { l: 'No answer', v: d.noAnswer },
            { l: 'Messaged', v: d.messaged },
          ].map((c) => (
            <div key={c.l} className="px-2 py-2.5 text-center">
              <p className="text-[17px] font-bold tabular-nums text-stone-800">{c.v}</p>
              <p className="text-[10px] font-semibold text-stone-400">{c.l}</p>
            </div>
          ))}
        </div>

        {/* 5 — the evidence class, on the card itself. A screenshot travels
            without its context, and this one must never be read as observed
            fact: the system has no telephony record. */}
        <p className="px-4 py-2.5 text-[10.5px] leading-snug text-stone-400">
          Self-reported by {d.repName} · CareerRai has no call recording, so these are the
          counsellor&apos;s own entries.
        </p>
      </div>
    </div>
  );
}
