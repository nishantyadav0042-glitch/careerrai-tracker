import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · CareerRai',
  description: 'How CareerRai collects, uses, and protects your personal data.',
};

// Public, unauthenticated policy page. Its URL is submitted to Google Play and
// the Apple App Store as the app's privacy policy. Keep it in sync with the
// Play Data Safety form and Apple privacy "nutrition label".
export default function PrivacyPolicyPage() {
  const updated = '15 July 2026';
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Privacy Policy</h1>
      <p className="mt-1 text-sm text-stone-500">Last updated: {updated}</p>

      <div className="prose prose-stone mt-6 space-y-6 text-[15px] leading-relaxed">
        <section>
          <p>
            CareerRai (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a CAT exam-preparation tracker and 1:1 mentorship
            service through our web and mobile apps. This policy explains what personal data we collect, why, how we
            use it, who we share it with, and the choices you have. By using CareerRai you agree to this policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">1. Information we collect</h2>
          <ul className="list-disc pl-5">
            <li><strong>Account details</strong> — your name, phone number, email, and exam target you provide at sign-up.</li>
            <li><strong>Study data</strong> — daily study logs, hours, topics covered, mock scores, streaks, plans, and notes you create in the app.</li>
            <li><strong>Mentorship data</strong> — messages and session details exchanged with your assigned buddy.</li>
            <li><strong>Payment data</strong> — when you buy a plan, payment is processed by Razorpay. We receive a transaction reference and status; we do <strong>not</strong> store your full card or bank details.</li>
            <li><strong>Usage &amp; device data</strong> — app opens, screens viewed, feature interactions, device type, IP address, and whether you use the installed app or a browser, collected to improve the product and support you.</li>
            <li><strong>Voice recordings</strong> — if you choose to send your mentor a voice note, we record it with your microphone and store the audio file. Recording only ever starts when you tap record; we never listen in the background.</li>
            <li><strong>Photos you upload</strong> — if you upload a mock scorecard screenshot, we store that image and read the scores from it.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">2. How we use your data</h2>
          <ul className="list-disc pl-5">
            <li>To build and update your personalised study plan and track your progress and streak.</li>
            <li>To connect you with a mentor (buddy) and enable 1:1 sessions and chat.</li>
            <li>To send you study reminders and notifications you have opted into.</li>
            <li>To process payments and manage your subscription.</li>
            <li>To understand engagement and fix problems so the app works better.</li>
            <li>To read scores from mock scorecards you upload, and to help your mentor draft replies faster — both use Google Gemini.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">3. Who we share it with</h2>
          <p>We do not sell your personal data. We share it only with service providers that help us run CareerRai:</p>
          <ul className="list-disc pl-5">
            <li><strong>Supabase</strong> — secure database and authentication hosting.</li>
            <li><strong>Razorpay</strong> — payment processing.</li>
            <li>
              <strong>Google</strong> — app distribution, and where you opt in, notification delivery and Meet-based
              sessions. We also use <strong>Google Gemini</strong> to read the scorecard images you upload and to help
              draft mentor replies, which means those images and message contents are sent to Google for processing.
            </li>
            <li>
              <strong>Meta</strong> — advertising and analytics measurement. When you buy a plan we send Meta a record of
              that purchase, including your IP address and a scrambled (hashed) form of your phone and email so they can
              match the sale to an ad. Meta cannot read the original phone or email from the scrambled version.
            </li>
            <li>Your assigned <strong>mentor (buddy)</strong>, who sees the study data needed to guide you.</li>
          </ul>
        </section>

        {/* ── GOOGLE API SERVICES USER DATA ──────────────────────────────────
            Required by Google for OAuth verification of a sensitive scope.
            CareerRai requests calendar.events, which Google classifies as
            sensitive, so a verification submission is rejected unless the
            privacy policy — hosted on the authorized domain, which this is —
            states plainly what Google user data is accessed, why, where it
            goes, and that it is not sold or used for ads or model training.
            The final paragraph is Google's Limited Use requirement, which must
            appear in substance and be publicly readable.

            Keep this section accurate to the code. Today the ONLY Google user
            data we touch is a mentor's calendar and their account email; a
            student signing in with Google grants identity scopes only. If a
            scope is ever added or removed, this section changes in the same
            commit — a policy that overstates what we take is as much a
            verification failure as one that understates it. */}
        <section>
          <h2 className="text-xl font-semibold text-stone-900">4. Google user data</h2>
          <p>
            Mentors on CareerRai may connect their Google account so that sessions can be scheduled
            for them. This section describes exactly what that connection gives us. It applies only
            to mentors who choose to connect; students are never asked for it.
          </p>
          <p className="mt-3"><strong>What we access.</strong> With a mentor&apos;s permission we request:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Google Calendar events</strong> (<code>calendar.events</code>) — to create the
              Google Meet room a mentor&apos;s sessions run in, to place each booked session on their
              calendar so the hour shows as busy, to move that event when a session is rescheduled,
              and to remove it when a session is cancelled. Creating and updating calendar events is
              the entire product function, and it cannot be done with a read-only or narrower
              permission.
            </li>
            <li>
              <strong>Your Google account email address</strong> (<code>userinfo.email</code>) — so we
              can show a mentor which Google account is connected, and detect if they later reconnect
              with a different one.
            </li>
          </ul>
          <p className="mt-3">
            <strong>What we store.</strong> An access token and a refresh token, so we can act on the
            mentor&apos;s calendar without asking them to sign in before every booking; the connected
            account&apos;s email address; and the identifiers of the calendar and the single meeting
            room we created. We do not copy, index or retain the contents of a mentor&apos;s calendar.
            We never read events we did not create.
          </p>
          <p className="mt-3">
            <strong>Students who sign in with Google</strong> grant identity information only — name,
            email address and profile picture. Signing in with Google gives CareerRai no access to a
            student&apos;s calendar, email or files, and is never required in order to pay for or use
            anything on CareerRai.
          </p>
          <p className="mt-3">
            <strong>Disconnecting.</strong> A mentor can disconnect Google at any time from their
            CareerRai profile, or revoke our access directly at{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
               className="underline">myaccount.google.com/permissions</a>. Disconnecting deletes the
            stored tokens and removes the meeting room we created from their calendar.
          </p>
          <p className="mt-3">
            CareerRai&apos;s use and transfer of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy"
               target="_blank" rel="noopener noreferrer" className="underline">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements. We do not sell Google user data, do not use
            it for advertising, and do not use it to train generalised artificial-intelligence or
            machine-learning models. It is used solely to provide the scheduling features described
            above, and humans do not read it except with a mentor&apos;s explicit permission, where
            required for security, or where the law requires it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">5. Data retention</h2>
          <p>
            We keep your data for as long as your account is active. When you delete your account, your personal data is
            permanently erased from our systems (see section 7). Payment/transaction records may be retained by Razorpay
            or as required by law and accounting rules.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">6. Your rights</h2>
          <p>
            You can access, correct, or export your data, and object to certain processing, by emailing us. You can
            withdraw notification consent at any time from your device settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">7. Deleting your account</h2>
          <p>
            You can permanently delete your account and all associated personal data at any time from within the app:
            <strong> Profile → Settings → Danger zone → Delete my account</strong>. You can also request deletion without
            the app at our{' '}
            <Link href="/delete-account" className="text-orange-600 hover:underline">account deletion page</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">8. Children</h2>
          <p>
            CareerRai is intended for CAT aspirants aged 18 and above and is not directed at children. We do not
            knowingly collect data from children.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">9. Security</h2>
          <p>
            Data is encrypted in transit and stored on access-controlled infrastructure. No system is perfectly secure,
            but we take reasonable measures to protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">10. Changes</h2>
          <p>
            We may update this policy. Material changes will be reflected by the &ldquo;Last updated&rdquo; date above.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900">11. Contact</h2>
          <p>
            Questions or requests? Email{' '}
            <a href="mailto:business@careerrai.com" className="text-orange-600 hover:underline">business@careerrai.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
