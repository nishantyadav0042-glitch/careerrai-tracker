import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms & Conditions · CareerRai',
  description: 'The terms that govern your use of CareerRai.',
};

// Public Terms & Conditions — required for App Store / Play submission and
// linked from the app. Plain-language terms for an education service.
export default function TermsPage() {
  const updated = '16 July 2026';
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Terms &amp; Conditions</h1>
      <p className="mt-1 text-sm text-stone-500">Last updated: {updated}</p>

      <div className="prose prose-stone mt-6 space-y-6 text-[15px] leading-relaxed">
        <section>
          <p>
            These Terms govern your use of CareerRai (&ldquo;the app&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a CAT
            exam-preparation tracker and 1:1 mentorship service. By creating an account or using the app, you agree to
            these Terms. If you do not agree, please do not use the app.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">1. Who can use CareerRai</h2>
          <p>You must be 18 or older and able to form a binding contract. You are responsible for your account and for keeping your login secure.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">2. What we provide</h2>
          <p>
            CareerRai gives you a personalised daily study plan, progress and syllabus tracking, reminders, and —
            for subscribers — access to a 1:1 IIM mentor (&ldquo;Buddy&rdquo;) for guidance, mock review, and periodic
            sessions. Plans are guidance tools; we do not guarantee any exam score, percentile, or admission.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">3. Mentorship &amp; payments</h2>
          <ul className="list-disc pl-5">
            <li>The Buddy plan is a paid, one-to-one mentorship service. Prices are shown in the app before you pay.</li>
            <li>Payments are processed securely by <strong>Razorpay</strong>. We do not store your card or bank details.</li>
            <li>Plans are prepaid for the chosen duration and do <strong>not</strong> auto-renew — you choose whether to renew.</li>
            <li>Refunds follow our <Link href="/refunds" className="text-orange-600 hover:underline">Refund &amp; Cancellation Policy</Link>: a full refund in your first month if you&apos;ve logged at least 20 study days.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">4. Acceptable use</h2>
          <p>
            Don&rsquo;t misuse the app: no unlawful use, no harassment of mentors or staff, no attempts to breach
            security, scrape, or resell the service. Mentorship is for your own preparation and may not be shared or
            resold. We may suspend accounts that violate these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">5. Your content</h2>
          <p>You keep ownership of what you enter (logs, notes, messages). You grant us a limited licence to store and process it to run the service. See our <Link href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</Link>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">6. Intellectual property</h2>
          <p>The app, its content, and study materials are owned by CareerRai or its licensors and are protected by law. You get a personal, non-transferable licence to use them for your own CAT preparation.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">7. Cancelling &amp; deletion</h2>
          <p>You can stop using the app anytime and permanently delete your account and data from <strong>Profile → Settings → Danger zone</strong>, or at our <Link href="/delete-account" className="text-orange-600 hover:underline">account deletion page</Link>.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">8. Disclaimers &amp; liability</h2>
          <p>
            The app is provided &ldquo;as is.&rdquo; We work hard to keep it accurate and available but do not warrant
            it will be error-free or uninterrupted. To the maximum extent permitted by law, our liability for any claim
            relating to the app is limited to the amount you paid us in the 3 months before the claim.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">9. Changes</h2>
          <p>We may update these Terms. Material changes will be reflected by the &ldquo;Last updated&rdquo; date above; continued use means you accept the updated Terms.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">10. Governing law &amp; contact</h2>
          <p>
            These Terms are governed by the laws of India. Questions? Email{' '}
            <a href="mailto:business@careerrai.com" className="text-orange-600 hover:underline">business@careerrai.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
