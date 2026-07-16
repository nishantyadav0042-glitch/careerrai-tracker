'use client';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Social proof, Cal AI-style — but real. A student (Vedprakash) messaged this
// to the founder completely unprompted; we never asked for feedback. Shown as
// the actual WhatsApp screenshot (his number redacted) because a real chat is
// far more believable than a styled quote card.
export default function ScreenSocialProof({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-4 pt-1">
      <div>
        <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          A student texted us this at 1 AM.
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          We never asked for feedback. He just needed us to know. 💬
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/testimonials/vedprakash-wa.jpg"
          alt="A CareerRai student's unprompted WhatsApp message: “First I genuinely loved this product… it’s too good & best for all the students.”"
          className="mx-auto block max-h-[52vh] w-auto object-contain"
        />
      </div>

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
