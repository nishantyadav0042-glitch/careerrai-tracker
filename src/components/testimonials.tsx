import { Star } from 'lucide-react';
import { TESTIMONIALS } from '@/lib/testimonials';

// LOUD, real social proof (founder: "testimonials are our trust speaking —
// make them bold"). Quote cards built from our own UI only.
//
// APP STORE CONSTRAINT (App Review, 28 Jul 2026 — guideline 2.3.10): this
// component previously embedded a raw WhatsApp screenshot and a WhatsApp-styled
// chat replica. Apple rejected the build for shipping non-iOS status bar images
// and third-party platform UI. Never render a messaging-app screenshot or an
// imitation of another app's interface here — quote the student in our own
// styling instead. See docs/APP-STORE-SUBMISSION.md.
//
// Renders nothing if there are no real quotes — never a fake or empty section.
export function Testimonials({ max = 3 }: { max?: number }) {
  const items = TESTIMONIALS.slice(0, max);
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-center text-base font-extrabold text-stone-900">
        🔥 Students aren&apos;t quiet about it
      </p>

      {items.map((t) => (
        <figure key={t.name + t.quote} className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-4">
          <div className="mb-1.5 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <blockquote className="text-[17px] font-bold leading-snug text-stone-900">
            &ldquo;{t.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-2 flex items-center gap-2 text-xs font-semibold text-stone-500">
            <span>— {t.name} · {t.context}</span>
            {t.when && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {t.when}
              </span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
