import { Star } from 'lucide-react';
import { TESTIMONIALS, WA_CHATS, type WaChat } from '@/lib/testimonials';

// A REAL WhatsApp conversation rendered live (WhatsApp-light styling) instead
// of a raw screenshot — same authenticity, but the student's phone number is
// hidden by construction: only a first name + context ever appear.
export function WhatsAppLiveChat({ chat }: { chat: WaChat }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-stone-200 shadow-sm">
      <div className="flex items-center gap-2.5 bg-[#075E54] px-3 py-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-bold text-white">
          {chat.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">{chat.name}</p>
          <p className="truncate text-[10px] text-white/70">{chat.context}</p>
        </div>
      </div>
      <div className="space-y-2 bg-[#ECE5DD] px-3 py-3">
        {chat.messages.map((m, i) => (
          <div key={i} className={m.from === 'careerrai' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                'max-w-[85%] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-stone-900 shadow-sm ' +
                (m.from === 'careerrai' ? 'bg-[#DCF8C6]' : 'bg-white')
              }
            >
              {m.text}
              <span className="ml-2 whitespace-nowrap align-bottom text-[9px] text-stone-400">
                {m.time}{m.from === 'careerrai' ? ' ✓✓' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

// LOUD, real social proof (founder: "testimonials are our trust speaking —
// make them bold"). Big quote cards + the actual unprompted WhatsApp screenshot
// (student consented). Renders nothing if there are no real quotes — never a
// fake or empty section.
export function Testimonials({ max = 3, screenshot = true }: { max?: number; screenshot?: boolean }) {
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

      {/* The receipts — real, unprompted messages. Nothing sells like proof. */}
      {screenshot && (
        <>
          <figure className="overflow-hidden rounded-2xl border border-stone-200 shadow-sm">
            <figcaption className="bg-stone-900 px-3 py-2 text-center text-xs font-bold text-white">
              He messaged us this himself — we never even asked 👇
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/testimonials/vedprakash-wa.jpg"
              alt="A CareerRai student's unprompted WhatsApp message praising the app"
              className="block w-full"
            />
          </figure>
          {WA_CHATS.map((chat) => (
            <WhatsAppLiveChat key={chat.name} chat={chat} />
          ))}
        </>
      )}
    </div>
  );
}
