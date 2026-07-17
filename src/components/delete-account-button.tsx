'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

// In-app "Delete my account" — the store-required deletion entry point.
// Two-step: a danger button opens a modal that forces the student to type
// DELETE before the irreversible call fires. On success we bounce to the
// public landing (their session is already void).
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "We couldn't delete your account, so nothing was changed. Please check your connection and try again, or email business@careerrai.com.");
      }
      window.location.href = '/welcome?deleted=1';
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't delete your account, so nothing was changed. Please check your connection and try again, or email business@careerrai.com.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setConfirmText(''); setError(null); }}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
      >
        <Trash2 className="h-4 w-4" />
        Delete my account
      </button>
      <p className="mt-2 text-xs text-stone-500">
        Permanently erases your logs, streak, plan and profile. This can&apos;t be undone.
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">Delete your account?</h3>
                <p className="mt-1 text-sm text-stone-600">
                  This permanently deletes everything — your daily logs, streak, study plan, mock history,
                  buddy chats and profile. It cannot be recovered.
                </p>
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-semibold text-stone-500">
              Type <span className="font-mono text-red-600">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              autoComplete="off"
              className="mb-4 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder="DELETE"
            />

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setConfirmText(''); }}
                disabled={busy}
                className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50"
              >
                Keep my account
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || busy}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
