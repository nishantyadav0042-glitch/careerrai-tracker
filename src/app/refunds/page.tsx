import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy · CareerRai',
  description: 'How refunds and cancellations work for CareerRai mentorship plans.',
};

// Public refund policy. Required by Razorpay's website verification and by
// Play/App Store review, and previously only existed as a vague line inside
// Terms ("refunds, where offered"). The numbers here MUST stay in sync with
// src/app/api/student/request-refund/route.ts (REQUIRED_DAYS = 20, first month).
export default function RefundsPage() {
  const updated = '25 July 2026';
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Refund &amp; Cancellation Policy</h1>
      <p className="mt-1 text-sm text-stone-500">Last updated: {updated}</p>

      <div className="prose prose-stone mt-6 space-y-6 text-[15px] leading-relaxed">
        <section>
          <p>
            CareerRai sells 1:1 CAT mentorship — live sessions and ongoing guidance from a real mentor. This page
            explains exactly when you can get your money back and how to ask for it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">1. Our refund promise</h2>
          <p>
            If CareerRai hasn&apos;t helped you in your <strong>first month</strong>, you can request a{' '}
            <strong>full refund</strong>.
          </p>
          <p>
            The one condition: you must have <strong>logged at least 20 study days</strong> within that first month. We
            ask for this because mentorship only works if you actually show up — 20 days is how we know you gave it a
            genuine try, and it is the same standard for everyone.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">2. How to request a refund</h2>
          <p>
            Open the app and go to <strong>Profile → Refund guarantee</strong>, where you can see your logged-day count
            and request a refund in one tap. You can also email{' '}
            <a href="mailto:business@careerrai.com" className="text-orange-600 hover:underline">business@careerrai.com</a>{' '}
            from your registered email address.
          </p>
          <p>
            We review every request within <strong>2–3 working days</strong>. Approved refunds are sent back through
            Razorpay to the original payment method and typically reach your account within{' '}
            <strong>5–7 working days</strong>, depending on your bank.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">3. Cancelling your plan</h2>
          <p>
            There is <strong>no auto-debit</strong> on CareerRai. Every plan is a one-time payment, so there is no
            recurring mandate to cancel and you will never be charged again automatically.
          </p>
          <p>
            When your term ends, your mentorship simply stops. Your study data — streak, mock history, debriefs, plan —
            stays in your account and remains free to use. You can buy another term whenever you want your mentor back.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">4. When a refund does not apply</h2>
          <ul className="list-disc pl-5">
            <li>After your first month has ended.</li>
            <li>If fewer than 20 study days were logged in that first month.</li>
            <li>Where an account has been terminated for abuse of the service or of a mentor.</li>
          </ul>
          <p>
            If your mentor was unavailable or something went wrong on our side, tell us anyway. Those cases are handled
            individually and this policy is not used to refuse a genuine failure by us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">5. Failed or duplicate payments</h2>
          <p>
            If money left your account but your plan did not activate, it is returned in full. Contact us with the date
            and amount and we will trace the transaction with Razorpay. Duplicate charges are refunded fully, always.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">6. Contact</h2>
          <p>
            Questions about a refund? Email{' '}
            <a href="mailto:business@careerrai.com" className="text-orange-600 hover:underline">business@careerrai.com</a>{' '}
            or see our <Link href="/contact" className="text-orange-600 hover:underline">Contact page</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
