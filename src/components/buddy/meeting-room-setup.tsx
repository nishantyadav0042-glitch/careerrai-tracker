'use client';

import { useState } from 'react';
import { Video, Check, ChevronRight } from 'lucide-react';

// Setting the room you run every session in.
//
// Two ways, and pasting comes FIRST on purpose. Connecting Google is nicer
// when it works, but it depends on Google's app-verification queue — and while
// that queue says "this app is being tested", every mentor is blocked with
// nothing we can ship to help them. Pasting a link you already have takes ten
// seconds and can never be blocked by anyone but us.

export function MeetingRoomSetup({
  currentRoom, from = '/buddy/home',
}: {
  currentRoom: string | null;
  from?: string;
}) {
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(currentRoom);

  async function save() {
    if (!link.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/buddy/meeting-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Couldn't save that link."); return; }
      setSaved(json.meetUrl);
      setLink('');
      // Server components decide whether booking is allowed, so the page must
      // re-render from the server rather than trusting this local state.
      window.location.reload();
    } catch {
      setError('Network problem — try again.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
        <Check className="h-4 w-4 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-teal-900">Your meeting room is set</p>
          <p className="truncate text-[11.5px] text-teal-800">{saved}</p>
        </div>
        <button
          type="button"
          onClick={() => setSaved(null)}
          className="shrink-0 text-[11px] font-semibold text-teal-700 underline underline-offset-2"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
          <Video className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">Set your meeting room to start booking</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
            One link, used for every session you ever run. Students always join the
            same place, so a link you sent weeks ago still works.
          </p>

          <label className="mt-3 block text-[12px] font-semibold text-stone-700">
            Paste your Meet, Zoom or Teams link
          </label>
          <input
            value={link}
            onChange={(e) => { setLink(e.target.value); if (error) setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
            placeholder="meet.google.com/abc-defg-hij"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-orange-500"
          />
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-stone-500">
            No room yet? Open{' '}
            <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
               className="font-semibold text-stone-700 underline underline-offset-2">
              meet.google.com/new
            </a>
            , then copy the link from the address bar and paste it here.
          </p>

          {error && <p className="mt-2 text-[12px] font-medium text-red-700">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving || !link.trim()}
            className="mt-3 w-full rounded-xl bg-stone-900 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-40"
            style={{ minHeight: 48 }}
          >
            {saving ? 'Saving…' : 'Save my meeting room'}
          </button>

          <a
            href={`/api/google/connect?from=${encodeURIComponent(from)}`}
            className="mt-2.5 flex items-center justify-center gap-1 text-[12px] font-semibold text-stone-500"
          >
            Or connect Google to make one for me <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
