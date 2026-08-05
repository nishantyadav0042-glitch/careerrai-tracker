'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// One line, one tap. A mentor writing notes DURING a call has no attention to
// spare for a form — so this is a single input that clears itself and stays
// focused, so several notes can be typed in a row without touching anything.
export function QuickNote({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const text = body.trim();
    if (!text) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/buddy/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, body: text }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Couldn't save.");
      } else {
        setBody('');
        router.refresh();
      }
    } catch {
      setError('Network hiccup — try again.');
    }
    setSaving(false);
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
          placeholder="Add a note…"
          aria-label="Add a private note"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-teal-600"
        />
        <button
          type="button" onClick={save} disabled={saving || !body.trim()}
          className="shrink-0 rounded-xl bg-stone-900 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] font-medium text-red-700">{error}</p>}
      <p className="mt-2 text-[11px] text-stone-400">🔒 Only you can see these. Never shown to the student.</p>
    </div>
  );
}
