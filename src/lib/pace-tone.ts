import type { PaceResult } from '@/lib/study-pace';

// ── The pace status → colour/label map, in a boundary-free module ───────────
//
// 13 Aug, production incident: this map used to live inside pace-card.tsx,
// which carries the client-component directive. PositionStrip — a plain
// server component, no such directive — imported the map as a named const
// from that client-boundary module. It builds fine, but at runtime on the
// server the import resolved to `undefined`, so `TONE[pace.status]` threw
// `Cannot read properties of undefined (reading 'chipBg')` on every real
// request to Home. Crashed the whole page behind the shared /student error
// boundary for every student who hit it.
//
// The fix is structural, not a patch: this map is DATA, not a component, and
// has no business living in a client-boundary file. It now lives in a plain
// .ts module that carries no client-boundary directive anywhere in its
// import chain, so a server component and a client component can both import
// it identically and neither crosses a boundary to do it.
export const TONE: Record<PaceResult['status'], { ring: string; chipBg: string; chipText: string; label: string }> = {
  // The chip describes the DATE, not the day's workload — the date is the thing
  // that moves when a student falls behind. "Catching up" used to sit above a
  // headline that had silently added catch-up hours to their commitment.
  ahead:       { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Date is safe' },
  on_pace:     { ring: '#6366f1', chipBg: 'bg-indigo-50',  chipText: 'text-indigo-700',  label: 'Date is on track' },
  behind:      { ring: '#f59e0b', chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   label: 'Date is slipping' },
  unrealistic: { ring: '#f43f5e', chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    label: 'Date won’t hold' },
  done:        { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Syllabus done' },
};
