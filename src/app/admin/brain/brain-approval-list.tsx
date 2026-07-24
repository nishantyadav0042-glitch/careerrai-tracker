'use client';

import { useState } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PendingDecision {
  id: number;
  studentId: string;
  name: string;
  phone: string | null;
  actionId: string;
  label: string;
  impact: number;
  why: string;
  notification: { title: string; body: string; url: string } | null;
  queuedAt: string;
}

export function BrainApprovalList({ initial }: { initial: PendingDecision[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function decide(id: number, approve: boolean) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/dna/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-stone-300" />
        <p className="text-sm font-semibold text-stone-800">Nothing waiting for approval</p>
        <p className="mt-1 text-xs text-stone-500">The Brain queues a recommendation here the moment it has one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.id} className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-900">{it.name}</p>
              <p className="text-xs text-stone-500">{it.phone ?? 'no phone on file'}</p>
            </div>
            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
              Impact {it.impact}
            </span>
          </div>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{it.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{it.why}</p>

          {it.notification && (
            <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Will send</p>
              <p className="mt-1 text-sm font-semibold text-stone-900">{it.notification.title}</p>
              <p className="text-xs text-stone-600">{it.notification.body}</p>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy === it.id}
              onClick={() => decide(it.id, true)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50'
              )}
            >
              <Check className="h-4 w-4" /> {busy === it.id ? 'Sending…' : 'Approve & send'}
            </button>
            <button
              type="button"
              disabled={busy === it.id}
              onClick={() => decide(it.id, false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-500 transition-all active:scale-[0.98] disabled:opacity-50 hover:bg-stone-50"
            >
              <X className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
