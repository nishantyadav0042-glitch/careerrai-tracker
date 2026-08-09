'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { PALETTE_COMMANDS, type SearchHit, type PaletteCommand } from '@/lib/os/universal-search';

// ⌘K / Ctrl-K — the command palette.
//
// Founder, 9 Aug: "search anything, navigate anywhere, run admin actions,
// exactly like Linear."
//
// Two layers, one list. The static commands (navigate, act) come from
// PALETTE_COMMANDS and filter instantly with no network. Live entity hits
// (a student by name or phone, a payment by order id, a coupon by code) come
// from /api/admin/search, debounced. Every result — static or live — carries a
// route from the entity graph, so selecting one just navigates. Search and
// open are a single step.

type Item =
  | { type: 'command'; cmd: PaletteCommand }
  | { type: 'hit'; hit: SearchHit };

const KIND_LABEL: Record<string, string> = {
  student: 'Student', buddy: 'Mentor', payment: 'Payment', coupon: 'Coupon',
  session: 'Session', notification: 'Notification', lead: 'Lead', plan: 'Plan', timetable: 'Timetable',
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open on ⌘K / Ctrl-K anywhere in admin. Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setHits([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  // Debounced live search. Static commands never wait on this.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setHits(Array.isArray(data.hits) ? data.hits : []);
        }
      } catch { /* a failed search just shows the static commands */ }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const commands = PALETTE_COMMANDS.filter((c) =>
    q.trim().length < 2 || `${c.title} ${c.hint}`.toLowerCase().includes(q.toLowerCase()),
  );
  const items: Item[] = [
    ...hits.map((hit) => ({ type: 'hit' as const, hit })),
    ...commands.map((cmd) => ({ type: 'command' as const, cmd })),
  ];

  const choose = useCallback((item: Item) => {
    setOpen(false);
    router.push(item.type === 'hit' ? item.hit.route : item.cmd.route);
  }, [router]);

  useEffect(() => { setActive(0); }, [q, hits.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-stone-900/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-stone-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-stone-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]); }
            }}
            placeholder="Search a student, phone, payment, coupon — or jump anywhere"
            className="min-w-0 flex-1 text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
          />
          <kbd className="hidden shrink-0 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400 sm:block">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">
              {q.trim().length < 2 ? 'Type to search, or pick a destination.' : 'Nothing found.'}
            </p>
          ) : (
            items.map((item, i) => {
              const on = i === active;
              const title = item.type === 'hit' ? item.hit.title : item.cmd.title;
              const sub = item.type === 'hit' ? item.hit.subtitle : item.cmd.hint;
              const tag = item.type === 'hit'
                ? (KIND_LABEL[item.hit.kind] ?? item.hit.kind)
                : item.cmd.group === 'act' ? 'Action' : 'Go';
              return (
                <button
                  key={item.type === 'hit' ? `h-${item.hit.kind}-${item.hit.id}` : `c-${item.cmd.id}`}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${on ? 'bg-stone-100' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-stone-900">{title}</span>
                    {sub && <span className="block truncate text-[11.5px] text-stone-500">{sub}</span>}
                  </span>
                  <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    {tag}
                  </span>
                  {on && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-stone-400" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
