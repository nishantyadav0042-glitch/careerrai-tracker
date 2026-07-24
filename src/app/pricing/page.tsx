import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANS } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Pricing · CareerRai',
  description: 'What CareerRai 1:1 CAT mentorship costs. No auto-debit, ever.',
};

// PUBLIC pricing. The paywall itself lives behind login at /student/buddy, so
// neither a Razorpay reviewer nor a prospective student could see what we
// charge without signing up. Prices are read from lib/plans (the same source
// the checkout charges from) so this page can never quietly disagree with the
// amount actually billed.
const OFFERED = [PLANS.tillcat, PLANS.monthly] as const;

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Pricing</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
        CareerRai is free to use — the tracker, your study plan, mock analysis and reports cost nothing and always will.
        What you pay for is <strong>a real person</strong>: a 1:1 mentor who has cleared CAT, guiding you through yours.
      </p>

      <div className="mt-8 space-y-4">
        {OFFERED.map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-stone-900">{plan.label}</h2>
              <span className="text-2xl font-bold text-stone-900">{plan.display}</span>
            </div>
            <p className="mt-1 text-sm text-stone-600">{plan.tagline}</p>
            <p className="mt-2 text-sm text-stone-500">
              One-time payment for {plan.months === 1 ? '1 month' : `${plan.months} months`} of mentorship. No auto-debit.
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-stone-900">What&apos;s included</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
            <li>A dedicated 1:1 mentor who has cleared CAT, matched to your target and weak areas.</li>
            <li>Live video sessions with your mentor over Google Meet.</li>
            <li>Direct chat with your mentor for day-to-day questions and accountability.</li>
            <li>Mock debriefs — your mentor reads your scorecard and tells you what to fix next.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">Free for everyone</h2>
          <p className="text-stone-700">
            Daily study logging and streaks, your personalised study plan, mock tracking and analysis, progress reports
            and exam countdowns are free. You do not need to pay to use CareerRai as a tracker.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">Payment &amp; billing</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
            <li>Payments are processed securely by Razorpay. We never store your card or bank details.</li>
            <li>All prices are in Indian Rupees (INR) and include applicable taxes.</li>
            <li>Every plan is a <strong>one-time payment</strong> — there is no recurring mandate and no auto-debit.</li>
            <li>Full refund in your first month if you&apos;ve logged at least 20 study days — see our{' '}
              <Link href="/refunds" className="text-orange-600 hover:underline">Refund Policy</Link>.
            </li>
          </ul>
        </section>

        <p className="text-sm text-stone-500">
          Questions? <Link href="/contact" className="text-orange-600 hover:underline">Contact us</Link> · Read the{' '}
          <Link href="/terms" className="text-orange-600 hover:underline">Terms</Link> and{' '}
          <Link href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
