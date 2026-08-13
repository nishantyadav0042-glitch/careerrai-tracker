import type { Metadata } from 'next';
import Link from 'next/link';
import { campaignState, mayShowSeatsLeft } from '@/lib/campaign';
import { campaignSeatsSold } from '@/lib/pricing';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { OfferCta } from './offer-cta';

// ── /offer — the ONE destination for every campaign surface ─────────────────
//
// In-app card, push, WhatsApp, retargeting and ads all land here, so the funnel
// is measured once: offer view → CTA → checkout → payment → buddy assigned.
// Rendered on the server so the price, the seat count and the deadline come
// from the same source the checkout charges from — a landing page that
// advertises a number the money path would not honour is how trust dies.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Independence Day offer — your IIM buddy till CAT 2026 | CareerRai',
  description: 'A real IIM mentor who reads your mocks and keeps your plan honest, till exam day. ₹2,499 instead of ₹2,999 — 50 spots.',
};

export default async function OfferPage() {
  const sold = await campaignSeatsSold();
  const c = campaignState(new Date(), sold);

  const user = await getAuthUser();
  let isPremium = false;
  if (user) {
    const admin = createAdminClient();
    const { data } = await admin.from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
    isPremium = data?.is_premium === true;
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-white px-5 py-8 pb-24">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">🇮🇳 {c.label}</p>
        <h1 className="mt-2 text-[26px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {c.headline}
        </h1>
        <p className="mt-2 text-[14px] leading-snug text-stone-600">
          Freedom from preparing alone. A real IIM mentor — yours till exam day.
        </p>
      </div>

      {/* Price — the same numbers the checkout will charge. */}
      <div className="mt-6 rounded-2xl border-2 border-stone-900 bg-stone-50 p-5 text-center">
        <div className="flex items-baseline justify-center gap-2.5">
          <span className="text-[38px] font-extrabold leading-none text-stone-900">{c.offerDisplay}</span>
          <span className="text-[18px] font-semibold text-stone-400 line-through">{c.listDisplay}</span>
        </div>
        <p className="mt-1.5 text-[13px] font-bold text-emerald-700">
          Save {c.savingDisplay} · one payment, no renewal until CAT
        </p>
        {c.live && mayShowSeatsLeft(c.seatsLeft, c.slots) && (
          <p className="mt-2 text-[12px] font-semibold text-stone-500">
            Only {c.seatsLeft} spots left
          </p>
        )}
      </div>

      {isPremium ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-[14px] font-bold text-emerald-800">You already have your buddy 🎉</p>
          <p className="mt-1 text-[12.5px] text-emerald-700">
            This offer is for students who haven&apos;t joined yet. Yours is already running.
          </p>
          <Link href="/student/buddy" className="mt-3 inline-block text-[13px] font-bold text-stone-900 underline">
            Open my buddy →
          </Link>
        </div>
      ) : c.phase === 'ended' ? (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center">
          <p className="text-[14px] font-bold text-stone-800">This offer has closed.</p>
          <p className="mt-1 text-[12.5px] text-stone-600">
            The buddy is still available at its usual price — and the whole study plan stays free.
          </p>
          <Link href="/student/buddy" className="mt-3 inline-block text-[13px] font-bold text-stone-900 underline">
            See buddy plans →
          </Link>
        </div>
      ) : !c.live ? (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center">
          <p className="text-[14px] font-bold text-stone-800">All 50 spots are taken.</p>
          <p className="mt-1 text-[12.5px] text-stone-600">
            We stop at 50 because every student gets a real mentor with real time for them.
          </p>
        </div>
      ) : (
        <OfferCta loggedIn={!!user} plan={c.plan} />
      )}

      {/* What they actually get. */}
      <div className="mt-7">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">What your buddy does</p>
        <ul className="mt-2.5 space-y-2.5">
          {[
            ['Reads your mocks', 'Not "study harder" — the exact questions you lost marks on, and why.'],
            ['Keeps your plan honest', 'They see your real coverage and hours, and fix the plan when you slip.'],
            ['Weekly 1:1 call', 'A real conversation with someone who cracked this exam.'],
            ['Answers between calls', 'Chat when you are stuck at 11pm on a DILR set.'],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-2.5">
              <span className="mt-0.5 text-emerald-600">✓</span>
              <span>
                <span className="text-[13.5px] font-bold text-stone-900">{t}</span>
                <span className="block text-[12.5px] leading-snug text-stone-600">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Refund — body copy, never the headline (founder, 12 Aug). Wording is
          the LIVE policy: /refunds and request-refund both enforce 20 days. */}
      <p className="mt-6 rounded-xl bg-stone-50 px-3.5 py-3 text-[12px] leading-snug text-stone-600">
        <span className="font-bold text-stone-800">Not helping in your first month?</span>{' '}
        Full refund — log 20 study days and ask. Same standard for everyone.{' '}
        <Link href="/refunds" className="underline">Refund policy</Link>.
      </p>

      <p className="mt-4 text-center text-[11.5px] text-stone-400">
        The study plan, tracker and revision engine stay free, always.
      </p>
    </div>
  );
}
