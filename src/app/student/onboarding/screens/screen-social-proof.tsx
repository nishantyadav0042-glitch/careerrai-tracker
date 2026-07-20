'use client';

import { WhatsAppLiveChat } from '@/components/testimonials';
import { WA_CHATS } from '@/lib/testimonials';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Social proof, Cal AI-style — but real. Vedprakash messaged the founder
// completely unprompted at 1 AM (shown as the actual screenshot, number
// redacted); Gargi messaged on her very first day (rendered as a live chat
// screen so her number stays hidden). Real chats beat styled quote cards.
export default function ScreenSocialProof({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-4 pt-1">
      <div>
        <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Students text us this. Unprompted.
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          We never ask for feedback. They just need us to know. 💬
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/testimonials/vedprakash-wa.jpg"
          alt="A CareerRai student's unprompted WhatsApp message: “First I genuinely loved this product… it’s too good & best for all the students.”"
          className="mx-auto block max-h-[44vh] w-auto object-contain"
        />
        <p className="bg-stone-100 px-3 pb-2 text-center text-[11px] font-medium text-stone-500">Vedprakash — 1 AM, completely unprompted</p>
      </div>

      {WA_CHATS.map((chat) => (
        <WhatsAppLiveChat key={chat.name} chat={chat} />
      ))}

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onNext()}
        className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60"
      >
        Continue &rarr;
      </button>
    </div>
  );
}
