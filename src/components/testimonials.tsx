import { TESTIMONIALS } from '@/lib/testimonials';

// Tiny, real testimonials — one sentence, one name. Renders nothing until at
// least one real quote exists, so it can never show an empty or fake section.
export function Testimonials({ max = 3 }: { max?: number }) {
  const items = TESTIMONIALS.slice(0, max);
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        What students say
      </p>
      {items.map((t) => (
        <figure key={t.name + t.quote} className="rounded-2xl border border-stone-200 bg-white p-3.5">
          <blockquote className="text-sm leading-relaxed text-stone-800">“{t.quote}”</blockquote>
          <figcaption className="mt-1.5 text-xs font-medium text-stone-500">
            — {t.name} · {t.context}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
