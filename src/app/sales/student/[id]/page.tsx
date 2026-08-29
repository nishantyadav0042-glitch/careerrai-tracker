import Link from 'next/link';
import { requireSales } from '@/lib/admin-auth';
import { ArrowLeft, Phone, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSalesConversionView } from '@/lib/sales-conversion';
import { canAccessLead, loadStaffDirectory, resolveLeadOwner, salesPrincipal } from '@/lib/sales-authz';
import { QuickLog } from '@/components/sales-log';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Convert · CareerRai' };

const TIER: Record<string, string> = {
  hot: 'bg-rose-50 text-rose-700 border-rose-200', warm: 'bg-amber-50 text-amber-800 border-amber-200', cool: 'bg-stone-100 text-stone-500 border-stone-200',
};

// WHICH rung of the shared evidence chain named the weak section. A rep must
// know whether they are quoting the student's mock or the chain's fallback —
// "your weakest is DILR" is a fact in the first case and a guess in the last,
// and saying the guess as a fact is the defect class this repo keeps paying
// for (ENGINEERING-MEMORY L1: a trustworthy UNKNOWN beats a precise lie).
const WEAKEST_SOURCE_LABEL: Record<string, string> = {
  mock: 'from their mock',
  self_report: 'they told us',
  baseline: 'from signup scores',
  coverage: 'from syllabus gaps',
  default: 'no evidence yet — do not assert',
};

export default async function ConvertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, admin } = await requireSales();

  // AUTHORIZATION (R2, 23 Aug). This page used to read `me` — the viewer's own
  // role and email — on this exact line and then never use it again: the input
  // needed to authorize was in scope and discarded, so any rep could open any
  // real student by editing the URL, including another rep's lead and that
  // rep's private call notes.
  //
  // Ownership now resolves through profiles.id (lib/sales-authz). A viewer we
  // cannot identify, an owner token we cannot attribute, and a read we could
  // not complete all DENY — absence is never promoted to access.
  const [principal, dir] = await Promise.all([
    salesPrincipal(admin, user.id),
    loadStaffDirectory(admin),
  ]);
  const owner = await resolveLeadOwner(admin, id, dir);
  const allowed = canAccessLead(owner, principal);

  const v = allowed ? await getSalesConversionView(admin, id) : null;
  // One surface for every denial — not-a-student, test account, nonexistent id,
  // malformed id, and "belongs to another rep" are indistinguishable. That
  // property already existed by accident (`if (!p || !momentum) return null`);
  // it is now deliberate, so guessing a uuid never confirms a student exists.
  if (!v) return <div className="p-8 text-center text-sm text-stone-500">Student not found. <Link href="/sales" className="underline">Back</Link></div>;

  return (
    <div className="pb-10">
      <Link href="/sales" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Calling list
      </Link>

      {/* Who + score + call actions */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-stone-900">{v.name}</h1>
            <p className="text-xs text-stone-500">{v.phone ?? 'no phone'} · {v.lastActivity}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <span className="font-mono text-base font-extrabold text-stone-900">{v.convScore}</span>
              <span className={cn('rounded-full border px-2 py-0.5', TIER[v.tier])}>{v.tier.toUpperCase()}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">momentum {v.momentumScore} · {v.momentumLabel}</span>
              {v.status && v.status !== 'not_contacted' && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{v.status}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            {v.waNumber && <a href={`https://wa.me/${v.waNumber}?text=${encodeURIComponent(v.pitch)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#25d366] px-3 py-2 text-[12px] font-bold text-[#04331c]">WhatsApp</a>}
            {v.phone && <a href={`tel:${v.phone}`} className="inline-flex items-center justify-center gap-1 rounded-xl bg-stone-900 px-3 py-2 text-[12px] font-bold text-white"><Phone className="h-3.5 w-3.5" /> Call</a>}
          </div>
        </div>
        {(v.isPremium || v.hasBuddy) && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800">Already {v.isPremium ? 'premium' : 'has a buddy'} — no sales ask needed.</p>}
      </div>

      {/* WHY THIS STUDENT IS HERE — the same verdict the queue card shows, so
          the reason survives opening the student directly (C4, 24 Aug). */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">Why call {v.firstName} today</p>
        {/* A NULL lane is an honest answer, not a blank (§5). A rep can open
            any student in their book directly, including one the queue did not
            surface — and telling them "nothing is happening with this student
            today" is more useful than inventing a reason to justify the visit. */}
        {v.lane === null ? (
          <>
            <p className="text-[13px] font-extrabold text-stone-900">No signal today</p>
            <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-stone-700">
              Nothing has changed for {v.firstName} that puts them in today&rsquo;s queue. They stay in your book.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-extrabold text-stone-900">{v.lane.dueLabel}</p>
            {v.lane.why.map((w, i) => (
              <p key={i} className="mt-0.5 text-[12.5px] font-semibold leading-snug text-stone-700">{w}</p>
            ))}
            <p className="mt-1.5 text-[12.5px] font-bold text-teal-700">&rarr; {v.lane.action}</p>
          </>
        )}
        {/* The student's own words at signup — the most quotable thing a rep
            has, and it previously died inside the queue brief. */}
        {v.painPoints.length > 0 && (
          <p className="mt-2 border-t border-stone-100 pt-2 text-[12px] text-stone-600">
            They told us: <span className="font-semibold text-stone-800">{v.painPoints.join(' · ')}</span>
          </p>
        )}
      </div>

      {/* WHY they'll convert */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Why this student will convert</p>
        {v.symptoms.length === 0 ? (
          <p className="text-sm text-stone-500">Few buying signals yet — warm them up first (get them logging), then pitch.</p>
        ) : (
          <ul className="space-y-1.5">
            {v.symptoms.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', s.strong ? 'text-emerald-600' : 'text-stone-400')} />
                <span className={cn(s.strong ? 'font-semibold text-stone-800' : 'text-stone-600')}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Their prep — reference on the call */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Their prep — reference this on the call</p>

        {/* 14-day study strip (24 Aug foundation) — the retention call's
            opening line lives here: "you studied 6 days straight and stopped
            Tuesday — what happened Tuesday?" */}
        <div className="mb-3">
          <p className="mb-1 text-[10px] font-semibold text-stone-400">Last 14 days — did they study?</p>
          <div className="flex gap-1">
            {v.studyStrip.map((d) => (
              <div key={d.date} title={`${d.date}${d.logged ? ' — studied' : ' — no log'}`}
                className={cn('h-5 flex-1 rounded', d.logged ? 'bg-teal-500' : 'bg-stone-100')} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-stone-400"><span>2 weeks ago</span><span>today</span></div>
        </div>

        {/* Latest mock — evidence with its date, never an inference.
            Percentiles arrive as plain numbers from lib/sales-score; the DB
            columns are JSONB and rendering them raw crashed this page (C0). */}
        {v.latestMock && (
          <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-1.5 text-[12px] font-semibold text-indigo-800">
            Last mock{v.latestMock.takenOn ? ` (${new Date(v.latestMock.takenOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}:
            {v.latestMock.overall != null ? <> {v.latestMock.overall}%ile overall</> : <> percentile not recorded</>}
            {v.latestMock.varc != null && <> · VARC {v.latestMock.varc}</>}
            {v.latestMock.dilr != null && <> · DILR {v.latestMock.dilr}</>}
            {v.latestMock.qa != null && <> · QA {v.latestMock.qa}</>}
          </p>
        )}

        {v.prep.sections.length > 0 ? (
          <div className="space-y-1.5">
            {v.prep.sections.map((s) => (
              <div key={s.section} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 text-[12px] font-bold text-stone-700">{s.section}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${s.pct}%` }} /></div>
                <span className="w-20 shrink-0 text-right font-mono text-[11px] text-stone-500">{s.pct}% ({s.finished}/{s.total})</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-stone-400">No study data yet.</p>}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">{v.prep.finished} finished · {v.prep.started} started · {v.prep.untouched} untouched</span>
          <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">{v.prep.activeDays14}/14 days studied</span>
          {v.prep.strongSection && <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">strong: {v.prep.strongSection}</span>}
          {v.prep.weakSection && (
            <span className="rounded bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
              weak: {v.prep.weakSection} <span className="font-normal opacity-70">({WEAKEST_SOURCE_LABEL[v.prep.weakestSource]})</span>
            </span>
          )}
        </div>
        {v.prep.topUntouched.length > 0 && (
          <p className="mt-2 text-[12px] text-stone-500">High-value topics still untouched: <span className="font-semibold text-stone-700">{v.prep.topUntouched.join(', ')}</span> — a buddy prioritizes exactly these.</p>
        )}
      </div>

      {/* Objection playbook */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">If they hesitate — say this</p>
        <div className="space-y-2.5">
          {v.objections.map((o, i) => (
            <div key={i}>
              <p className="text-[13px] font-bold text-stone-800">{o.objection}</p>
              <p className="text-[13px] text-stone-600">{o.response}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended buddy — a specific, relevant mentor beats "a buddy" */}
      {v.recommendedBuddy && (
        <div className="mt-3 rounded-2xl border border-purple-200 bg-purple-50 p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-purple-600">Recommend this buddy</p>
          <p className="text-[15px] font-bold text-stone-900">
            {v.recommendedBuddy.name}
            {v.recommendedBuddy.percentile != null && <span className="ml-1 text-[12px] font-semibold text-stone-500">{v.recommendedBuddy.percentile}%ile</span>}
            {v.recommendedBuddy.college && <span className="ml-1 text-[12px] font-semibold text-stone-500">· {v.recommendedBuddy.college}</span>}
          </p>
          {v.recommendedBuddy.reason && <p className="mt-0.5 text-[13px] text-stone-700">Why: {v.recommendedBuddy.reason}</p>}
          <p className="mt-1.5 text-[11px] text-stone-500">Name a real, relevant mentor on the call — it converts far better than pitching “a buddy.”</p>
        </div>
      )}

      {/* The pitch */}
      <div className="mt-3 rounded-2xl border-2 border-teal-600 bg-teal-50 p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-teal-700">Your opening pitch</p>
        <p className="text-[14px] leading-relaxed text-stone-800">{v.pitch}</p>
      </div>

      {/* Log the call */}
      <div className="mt-3">
        <QuickLog studentId={v.studentId} />
      </div>

      {/* Open promises — what this student is owed */}
      {v.followups.some((f) => f.status === 'open') && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-700">Open follow-ups — promises made</p>
          <div className="space-y-1.5">
            {v.followups.filter((f) => f.status === 'open').map((f) => (
              <p key={f.id} className="text-[12.5px] font-semibold text-stone-800">
                Due {new Date(f.dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                {f.reason && <span className="font-normal text-stone-600"> — {f.reason}</span>}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Interaction timeline — calls, WhatsApp, promises and their outcomes,
          one chronological stream (founder, 24 Aug: "complete interaction
          timeline"). Every entry carries its provenance. */}
      {v.timeline.length > 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Interaction timeline</p>
          <div className="space-y-2">
            {v.timeline.map((t, i) => (
              <div key={i} className="border-l-2 border-stone-200 pl-3">
                <p className="text-[12px] font-semibold text-stone-700">
                  {t.label} · <span className="font-normal text-stone-400">{new Date(t.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</span>
                  {t.provenance === 'self_reported' && <span className="ml-1 rounded bg-stone-100 px-1 py-0.5 text-[9px] font-bold text-stone-400">SELF-REPORTED</span>}
                </p>
                {t.note && <p className="text-[12px] text-stone-600">{t.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
