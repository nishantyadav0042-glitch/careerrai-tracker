import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Us · CareerRai',
  description: 'How to reach the CareerRai team.',
};

// Public Contact page. Razorpay's website verification and the app stores both
// expect a reachable contact route that is not buried inside Terms.
export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Contact us</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
        A real person reads every message. We usually reply within one working day.
      </p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Email</h2>
          <p className="mt-1 text-stone-600">For anything at all — support, payments, refunds, partnerships.</p>
          <a href="mailto:business@careerrai.com" className="mt-2 inline-block font-semibold text-orange-600 hover:underline">
            business@careerrai.com
          </a>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Already a student?</h2>
          <p className="mt-1 text-stone-600">
            The fastest route is inside the app — your mentor and our team both see messages there.
          </p>
          <Link href="/student/chat" className="mt-2 inline-block font-semibold text-orange-600 hover:underline">
            Open chat in the app →
          </Link>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Payments &amp; refunds</h2>
          <p className="mt-1 text-stone-600">
            Charged but your plan didn&apos;t activate, or want to request a refund? Email us with the date and amount
            and we&apos;ll trace it.
          </p>
          <Link href="/refunds" className="mt-2 inline-block font-semibold text-orange-600 hover:underline">
            Read the refund policy →
          </Link>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">Business details</h2>
          <dl className="mt-2 space-y-1 text-stone-600">
            <div><dt className="inline font-medium text-stone-900">Service: </dt><dd className="inline">CareerRai — CAT preparation tracking and 1:1 mentorship</dd></div>
            <div><dt className="inline font-medium text-stone-900">Operating country: </dt><dd className="inline">India</dd></div>
            <div><dt className="inline font-medium text-stone-900">Support hours: </dt><dd className="inline">Monday–Saturday, 10:00–19:00 IST</dd></div>
          </dl>
        </section>

        <p className="text-sm text-stone-500">
          See also our <Link href="/terms" className="text-orange-600 hover:underline">Terms</Link>,{' '}
          <Link href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</Link> and{' '}
          <Link href="/pricing" className="text-orange-600 hover:underline">Pricing</Link>.
        </p>
      </div>
    </main>
  );
}
