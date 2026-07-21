'use client';
import { useState } from 'react';
import { MessageCircle, Check, SkipForward, Clock, Copy } from 'lucide-react';
import type { MissionCard, Likelihood } from '@/lib/mission-queue';

const LIK: Record<Likelihood, { label: string; cls: string }> = {
  high: { label: 'High recovery', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-800' },
  low: { label: 'Low', cls: 'bg-stone-100 text-stone-500' },
};
const OBJ_CLS: Record<string, string> = {
  log: 'bg-teal-600', reconnect: 'bg-rose-600', buddy: 'bg-purple-600', install: 'bg-orange-500', winback: 'bg-stone-600',
};

async function record(card: MissionCard, action: 'sent' | 'skipped' | 'snoozed', snoozeHours?: number) {
  try {
    await fetch('/api/admin/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: card.studentId, objective: card.objective, action, message: card.message, snoozeHours }),
    });
  } catch { /* best-effort — the card is removed either way this session */ }
}

export function MissionDeck({ cards: initial, sentToday }: { cards: MissionCard[]; sentToday: number }) {
  const [cards, setCards] = useState(initial);
  const [done, setDone] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const remove = (id: string) => setCards((c) => c.filter((x) => x.studentId !== id));
  const act = (card: MissionCard, action: 'sent' | 'skipped' | 'snoozed', snoozeHours?: number) => {
    void record(card, action, snoozeHours);
    if (action !== 'skipped') setDone((d) => d + 1);
    remove(card.studentId);
  };
  const copy = async (card: MissionCard) => {
    try { await navigator.clipboard.writeText(card.message); setCopiedId(card.studentId); setTimeout(() => setCopiedId(null), 1500); } catch { /* ignore */ }
  };

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-bold text-emerald-800">Mission complete 🎉</p>
        <p className="mt-1 text-sm text-emerald-700">You handled everyone in tonight&apos;s queue. {sentToday + done} messages sent today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-semibold text-stone-500">{done} handled this session · {cards.length} left · {sentToday + done} sent today</p>
      {cards.map((card) => (
        <div key={card.studentId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between px-4 pt-3">
            <a href={`/admin/student/${card.studentId}`} className="text-[15px] font-bold text-stone-900 hover:underline">{card.name}</a>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${OBJ_CLS[card.objective]}`}>{card.objectiveLabel}</span>
          </div>
          <div className="px-4 pb-2 pt-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${LIK[card.likelihood].cls}`}>{LIK[card.likelihood].label}</span>
              {card.why.map((w, i) => (
                <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-medium text-stone-600">{w}</span>
              ))}
            </div>
            <div className="rounded-xl bg-stone-50 p-3 text-[13px] leading-relaxed text-stone-800">{card.message}</div>
          </div>
          <div className="flex items-stretch gap-px bg-stone-100">
            {card.waNumber ? (
              <a
                href={`https://wa.me/${card.waNumber}?text=${encodeURIComponent(card.message)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 bg-[#25d366] py-3 text-[13px] font-bold text-[#04331c] active:scale-95"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            ) : (
              <span className="flex flex-1 items-center justify-center bg-stone-200 py-3 text-[12px] font-semibold text-stone-500">no phone</span>
            )}
            <button onClick={() => copy(card)} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-semibold text-stone-600 active:bg-stone-50" title="Copy message">
              <Copy className="h-4 w-4" />{copiedId === card.studentId ? 'Copied' : ''}
            </button>
            <button onClick={() => act(card, 'sent')} className="flex items-center justify-center gap-1 bg-white px-3 py-3 text-[12px] font-bold text-emerald-700 active:bg-emerald-50" title="Mark sent">
              <Check className="h-4 w-4" /> Sent
            </button>
            <button onClick={() => act(card, 'snoozed', 24)} className="flex items-center justify-center bg-white px-3 py-3 text-stone-500 active:bg-stone-50" title="Snooze 24h">
              <Clock className="h-4 w-4" />
            </button>
            <button onClick={() => act(card, 'skipped')} className="flex items-center justify-center bg-white px-3 py-3 text-stone-400 active:bg-stone-50" title="Skip">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
