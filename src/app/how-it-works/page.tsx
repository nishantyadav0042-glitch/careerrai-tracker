import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How CareerRai works · CareerRai',
  description: 'Four steps from download to your first counted study day on CareerRai.',
};

// ── THE FIRST STEPS, IN ONE PLACE A REP CAN SEND (sales-reported, 23 Sep) ──
//
// Students kept telling the sales team the same thing: "downloaded it, didn't
// understand what to do next", and one asked for a video. Neelam re-sent the
// app link on WhatsApp to several students who had simply forgotten how to get
// started. There was nothing to send them except the link itself.
//
// This page is public on purpose (no login): a rep pastes it into WhatsApp,
// and a student who has not signed in yet can read it. It describes the app
// exactly as it behaves today; if a step here changes in the product, change
// it here in the same commit.
const STEPS: { title: string; body: string }[] = [
  {
    title: 'Open CareerRai from your home screen',
    body: 'Sign in with your mobile number and the OTP. If you installed the app, always open it from the CareerRai icon; that is where reminders reach you.',
  },
  {
    title: 'Your plan for today is already there',
    body: 'Home shows today’s tasks, built around your hours and your weakest section. The first task is the one to start with.',
  },
  {
    title: 'Finished a task? Tap it',
    body: 'Tap anywhere on the task, then choose Finished it or Got halfway. That is your log for the day. Your streak and hours update on their own.',
  },
  {
    title: 'Want to learn a topic first? Tap Learn it',
    body: 'Most tasks carry a free video link. It opens outside the app; come back and tap the task when you are done.',
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-10 text-stone-800">
      <Link href="/" className="text-sm font-medium text-orange-600 hover:underline">← CareerRai</Link>
      <h1 className="mt-4 text-3xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>How CareerRai works</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
        Four steps from download to your first counted study day. It takes about two minutes.
      </p>

      <ol className="mt-6 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">{i + 1}</span>
            <div>
              <p className="font-semibold text-stone-900">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-3 rounded-2xl bg-stone-50 p-4 text-sm leading-relaxed text-stone-700">
        <p>
          <strong>In coaching?</strong> On Home, tap <strong>Edit plan</strong> and add a photo of your class
          timetable. Your daily plan will follow the same topics as your classes.
        </p>
        <p>
          <strong>Writing CAT next year, or want more focus on one section?</strong> Tap <strong>Edit plan</strong> on
          Home and change it. Your plan follows it from the next day.
        </p>
        <p>
          <strong>Phone short on space?</strong> The app is light. If you delete it, install it again and sign in with the
          same number; your plan and history are kept.
        </p>
      </div>

      <Link href="/student/tracker"
        className="mt-6 block w-full rounded-2xl bg-stone-900 py-3.5 text-center text-sm font-semibold text-white">
        Open my plan
      </Link>
    </main>
  );
}
