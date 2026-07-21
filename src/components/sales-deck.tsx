'use client';
import { useState } from 'react';
import { MessageCircle, Copy, Star, CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import type { SalesOpportunity, Tier } from '@/lib/sales-queue';

const TIER: Record<Tier, { label: string; cls: string; dot: string }> = {
  hot: { label: 'HOT', cls: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  warm: { label: 'WARM', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
  cool: { label: 'COOL', cls: 'bg-stone-100 text-stone-500', dot: 'bg-stone-400' },
};

async function setStatus(studentId: string, status: string, nextFollowUp?: string) {
  try {
    await fetch('/api/admin/outreach', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, status, next_follow_up: nextFollowUp ?? null }),
    });
  } catch { /* best-effort */ }
}

function plusDaysISO(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function SalesDeck({ opportunities, doneToday, target }: { opportunities: SalesOpportunity[]; doneToday: number; target: number }) {
  const [list, setList] = useState(opportunities);
  const [done, setDone] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const act = (o: SalesOpportunity, status: string, followDays?: number) => {
    void setStatus(o.studentId, status, followDays ? plusDaysISO(followDays) : undefined);
    setDone((d) => d + 1);
    setList((l) => l.filter((x) => x.studentId !== o.studentId));
  };
  const copy = async (o: SalesOpportunity) => {
    try { await navigator.clipboard.writeText(o.script); setCopiedId(o.studentId); setTimeout(() => setCopiedId(null), 1500); } catch { /* ignore */ }
  };

  const total = doneToday + done;
  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-bold text-emerald-800">Queue cleared 🎉</p>
        <p className="mt-1 text-sm text-emerald-700">{total} conversations logged today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-semibold text-stone-500">
        {total}/{target} conversations today · {list.length} opportunities left
      </p>
      {list.map((o) => (
        <div key={o.studentId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between px-4 pt-3">
            <a href={`/admin/student/${o.studentId}`} className="text-[15px] font-bold text-stone-900 hover:underline">{o.name}</a>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-extrabold text-stone-900">{o.convScore}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TIER[o.tier].cls}`}>{TIER[o.tier].label}</span>
            </div>
          </div>
          <div className="px-4 pb-2 pt-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {o.why.map((w, i) => (
                <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-medium text-stone-600">{w}</span>
              ))}
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] text-stone-500">{o.lastActivity}</span>
            </div>
            <div className="rounded-xl bg-stone-50 p-3 text-[13px] leading-relaxed text-stone-800">{o.script}</div>
          </div>
          <div className="flex items-stretch gap-px bg-stone-100">
            {o.waNumber ? (
              <a href={`https://wa.me/${o.waNumber}?text=${encodeURIComponent(o.script)}`} target="_blank" rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 bg-[#25d366] py-3 text-[13px] font-bold text-[#04331c] active:scale-95">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            ) : (
              <span className="flex flex-1 items-center justify-center bg-stone-200 py-3 text-[12px] font-semibold text-stone-500">no phone</span>
            )}
            <button onClick={() => copy(o)} className="flex items-center justify-center bg-white px-3 py-3 text-stone-600 active:bg-stone-50" title="Copy script">
              <Copy className="h-4 w-4" />{copiedId === o.studentId ? <span className="ml-1 text-[11px]">Copied</span> : null}
            </button>
            <button onClick={() => act(o, 'interested')} className="flex items-center justify-center bg-white px-2.5 py-3 text-amber-600 active:bg-amber-50" title="Interested">
              <Star className="h-4 w-4" />
            </button>
            <button onClick={() => act(o, 'follow_up', 2)} className="flex items-center justify-center bg-white px-2.5 py-3 text-sky-600 active:bg-sky-50" title="Follow up in 2 days">
              <CalendarClock className="h-4 w-4" />
            </button>
            <button onClick={() => act(o, 'converted')} className="flex items-center justify-center bg-white px-2.5 py-3 text-emerald-700 active:bg-emerald-50" title="Converted — paid">
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button onClick={() => act(o, 'not_interested')} className="flex items-center justify-center bg-white px-2.5 py-3 text-stone-400 active:bg-stone-50" title="Not interested">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
