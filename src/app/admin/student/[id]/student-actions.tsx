'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// The one place the founder ACTS on a student. The 360 was read-only — the
// sacred "premium, no mentor" alert routed back to the same page with no button
// to press. This is that button. Assign a mentor, reassign, or remove, without
// leaving the profile. Every action hits the audited assign-buddy API and then
// refreshes the server component so the whole page (alert, neighbours,
// timeline) reflects the new truth immediately.

export interface MentorOption {
  id: string;
  name: string;
  students: number;
  hasRoom: boolean;
}

export function StudentActions({
  studentId, hasBuddy, currentBuddyName, mentors, isPremium,
}: {
  studentId: string;
  hasBuddy: boolean;
  currentBuddyName: string | null;
  mentors: MentorOption[];
  isPremium: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to the mentor with a room and the lightest load — the safest pick.
  const withRoom = mentors.filter((m) => m.hasRoom);
  const suggested = [...(withRoom.length ? withRoom : mentors)].sort((a, b) => a.students - b.students)[0];
  const [pick, setPick] = useState<string>(suggested?.id ?? '');

  async function call(buddyId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/assign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, buddy_id: buddyId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">
        {hasBuddy ? 'Mentor' : 'Assign a mentor'}
      </p>

      {hasBuddy ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            {currentBuddyName ?? 'Assigned'}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void call(null)}
            className="rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-semibold text-stone-600 hover:border-stone-400 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Remove'}
          </button>
        </div>
      ) : mentors.length === 0 ? (
        <p className="text-[12px] text-stone-500">No mentors exist yet to assign.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] font-semibold text-stone-800"
          >
            {mentors
              .slice()
              .sort((a, b) => Number(b.hasRoom) - Number(a.hasRoom) || a.students - b.students)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.students} student{m.students === 1 ? '' : 's'}{m.hasRoom ? '' : ' · NO ROOM'}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={busy || !pick}
            onClick={() => void call(pick)}
            className={cn(
              'rounded-lg px-3 py-2 text-[13px] font-bold text-white active:scale-95',
              busy ? 'bg-stone-400' : 'bg-stone-900 hover:bg-stone-700',
            )}
          >
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}

      {!hasBuddy && !isPremium && mentors.length > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-stone-500">
          A mentor is a paid feature — assigning here is a manual founder override (e.g. a scholarship).
        </p>
      )}
      {!hasBuddy && suggested && !suggested.hasRoom && (
        <p className="mt-2 text-[11px] font-semibold text-amber-700">
          No mentor with Google connected is free — the assigned mentor must connect Google before a session can be booked.
        </p>
      )}
      {error && <p className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
