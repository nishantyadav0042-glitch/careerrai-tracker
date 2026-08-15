'use client';

import { useState } from 'react';
import { waMessages, waNumber, leadState, type WaMessage } from '@/lib/wa-messages';

// The leads-team WhatsApp picker. Shows each outreach template with a preview;
// the one matching this lead's state (no app → app but notifications off →
// fully set up) is flagged "Suggested" and shown first. Tapping "Send" opens
// WhatsApp with the message already typed in.
export function WhatsAppComposer({
  phone, firstName, dreamCollege, appInstalled, pushOn,
  hasPlan, hasLogged, daysSinceLastLog,
}: {
  phone: string;
  firstName: string;
  dreamCollege: string;
  appInstalled: boolean;
  pushOn: boolean;
  // Read from the database by the page, never guessed here. waMessages
  // FILTERS OUT every "tumhara plan ready hai" message when hasPlan is false —
  // 22% of the not-installed list had no plan on 15 Aug, and that message
  // would have been the first thing CareerRai ever told them.
  hasPlan: boolean;
  hasLogged: boolean;
  daysSinceLastLog: number | null;
}) {
  const state = leadState(appInstalled, pushOn);
  const all = waMessages({ firstName, dreamCollege, hasPlan, hasLogged, daysSinceLastLog });
  // Suggested variants first, then the rest.
  const ordered = [
    ...all.filter((m) => m.suggestedFor === state),
    ...all.filter((m) => m.suggestedFor !== state),
  ];
  const [openKey, setOpenKey] = useState<string>(ordered[0]?.key ?? '');
  const number = waNumber(phone);

  const send = (m: WaMessage) => {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(m.text)}`, '_blank', 'noopener');
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">WhatsApp {firstName}</p>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${state === 'engaged' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {state === 'not_installed' ? '📲 Not installed' : state === 'notifications_off' ? '🔔 Notifications off' : '✅ Set up'}
        </span>
      </div>

      <div className="space-y-2">
        {ordered.map((m) => {
          const suggested = m.suggestedFor === state;
          const open = openKey === m.key;
          return (
            <div key={m.key} className={`rounded-xl border ${suggested ? 'border-emerald-300 bg-emerald-50/40' : 'border-stone-200'}`}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? '' : m.key)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  {m.label}
                  {suggested && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Suggested</span>}
                </span>
                <span className="text-xs text-stone-400">{open ? 'Hide' : 'Preview'}</span>
              </button>
              {open && (
                <div className="px-3 pb-3">
                  <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">{m.text}</p>
                  <button
                    type="button"
                    onClick={() => send(m)}
                    className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.99]"
                  >
                    Send on WhatsApp →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-stone-400">Opens WhatsApp with the message pre-typed — you can edit before sending. {phone}</p>
    </div>
  );
}
