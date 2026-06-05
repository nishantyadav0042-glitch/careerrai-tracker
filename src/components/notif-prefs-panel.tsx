'use client';
import { useState } from 'react';
import { ToggleInput } from '@/components/ui/toggle-input';
import { Card } from '@/components/ui/card';
import type { NotifPrefs } from '@/types';

export function NotifPrefsPanel({ initial, label1, label2 }: { initial: NotifPrefs; label1: string; label2: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function update(key: keyof NotifPrefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    await fetch('/api/profiles/notif-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
  }

  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Notifications</div>
      <div className="space-y-4">
        <ToggleInput label={label1} value={prefs.daily_reminder ?? true} onChange={(v) => update('daily_reminder', v)} />
        <ToggleInput label={label2} value={prefs.email ?? true} onChange={(v) => update('email', v)} />
      </div>
      {saving && <p className="text-xs text-stone-400 mt-2">Saving…</p>}
    </Card>
  );
}
