import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Delete your account · CareerRai',
  description: 'How to permanently delete your CareerRai account and data.',
};

// Public, unauthenticated deletion instructions. Google Play requires a URL
// (reachable WITHOUT installing the app) where users can request account +
// data deletion. Also satisfies Apple's account-deletion disclosure.
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← Back to CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900">Delete your CareerRai account</h1>
      <p className="mt-2 text-[15px] text-stone-600">
        You can permanently delete your CareerRai account and all associated personal data. There are two ways to do it.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-stone-900">Option 1 — In the app (instant)</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px]">
          <li>Open CareerRai and sign in.</li>
          <li>Go to <strong>Profile</strong> (bottom navigation).</li>
          <li>Open the <strong>Settings</strong> tab.</li>
          <li>Under <strong>Danger zone</strong>, tap <strong>Delete my account</strong>.</li>
          <li>Type <strong>DELETE</strong> to confirm, then tap <strong>Delete forever</strong>.</li>
        </ol>
        <p className="mt-3 text-sm text-stone-500">Your account and data are erased immediately and you are signed out.</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-stone-900">Option 2 — By email</h2>
        <p className="mt-3 text-[15px]">
          If you can&rsquo;t access the app, email{' '}
          <a href="mailto:business@careerrai.com?subject=Delete%20my%20CareerRai%20account" className="font-semibold text-orange-600 hover:underline">
            business@careerrai.com
          </a>{' '}
          from the address or phone number linked to your account, with the subject &ldquo;Delete my account&rdquo;. We
          verify it&rsquo;s you and delete your account within 7 days.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-5">
        <h2 className="text-lg font-semibold text-stone-900">What gets deleted</h2>
        <p className="mt-2 text-[15px]">
          Everything tied to your account is permanently removed, including your:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
          <li>Profile and login details (name, phone, email)</li>
          <li>Daily study logs, hours, topics, notes, and streaks</li>
          <li>Study plan and topic coverage</li>
          <li>Mock scores and debriefs</li>
          <li>Buddy chats and session history</li>
          <li>Notifications and usage/analytics events</li>
        </ul>
        <p className="mt-3 text-sm text-stone-500">
          This action is permanent and cannot be undone. Payment/transaction records may be retained by our payment
          processor (Razorpay) or as required by law and accounting rules; these contain no study data.
        </p>
      </section>

      <p className="mt-8 text-sm text-stone-500">
        See our{' '}
        <Link href="/privacy" className="text-orange-600 hover:underline">Privacy Policy</Link>{' '}
        for how we handle data.
      </p>
    </main>
  );
}
