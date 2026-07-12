'use client';
import { X, Plus, MessageCircle, MoreVertical, Share, SquarePlus } from 'lucide-react';
import { supportWhatsappUrl } from '@/lib/whatsapp';

// A "live-screen" install coach: instead of a wall of steps, it dims the real
// page and points an animated ring + arrow at the ACTUAL browser control the
// user must tap (the ⋮ menu on Android, the Share button on iOS — both live in
// the browser's own chrome, outside our page, so we point AT the edge where
// they sit rather than pretending to draw on them). Shown ONLY when a true
// one-tap install isn't available.
export function InstallCoach({
  target,
  onClose,
}: {
  target: 'android-menu' | 'ios-share';
  onClose: () => void;
}) {
  const wa = supportWhatsappUrl('Hi, I need help installing the CareerRai app on my phone.');
  const androidMenu = target === 'android-menu';

  return (
    <div
      className="fixed inset-0 z-[90] text-white"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ background: 'rgba(12,10,9,0.72)', backdropFilter: 'blur(1px)' }}
    >
      {/* close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 active:scale-95"
      >
        <X className="h-5 w-5" />
      </button>

      {/* ── the pointer: sits at the screen edge nearest the real control ── */}
      {androidMenu ? (
        <div className="pointer-events-none absolute right-2 top-1 flex flex-col items-center">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/40" />
            <span className="absolute inset-0 rounded-full border-2 border-orange-400" />
            <MoreVertical className="h-6 w-6 text-white" />
          </span>
          <ArrowBob dir="up" />
          <span className="mt-1 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold shadow">
            Your browser menu
          </span>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center">
          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold shadow">
            Safari&apos;s Share button
          </span>
          <ArrowBob dir="down" />
          <span className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/40" />
            <span className="absolute inset-0 rounded-full border-2 border-blue-400" />
            <Share className="h-6 w-6 text-white" />
          </span>
        </div>
      )}

      {/* ── the message: one line + the exact chip they tap next ── */}
      <div
        className="absolute left-1/2 top-1/2 w-[86%] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 text-center text-stone-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-2xl">📲</div>
        {androidMenu ? (
          <>
            <p className="text-base font-bold" style={{ fontFamily: 'Georgia, serif' }}>
              Tap the <span className="text-orange-600">⋮ menu</span> up top
            </p>
            <p className="mt-1 text-[13px] text-stone-500">Then tap this in the menu:</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold text-stone-800">
              <Plus className="h-4 w-4" /> Install app
            </div>
          </>
        ) : (
          <>
            <p className="text-base font-bold" style={{ fontFamily: 'Georgia, serif' }}>
              Tap <span className="text-blue-600">Share</span> at the bottom
            </p>
            <p className="mt-1 text-[13px] text-stone-500">Then scroll and tap this row:</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold text-stone-800">
              <SquarePlus className="h-4 w-4" /> Add to Home Screen
            </div>
            <p className="mt-3 text-[11px] text-stone-400">Works in Safari only.</p>
          </>
        )}

        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-700 active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" /> Facing issues? WhatsApp us
          </a>
        )}
      </div>

      <style>{`
        @keyframes coachBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
        @media (prefers-reduced-motion: reduce){ .coach-bob{animation:none!important} }
      `}</style>
    </div>
  );
}

function ArrowBob({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg
      className="coach-bob my-1 h-7 w-7 text-white"
      style={{ animation: 'coachBob 1s ease-in-out infinite', transform: dir === 'up' ? 'rotate(180deg)' : 'none' }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}
