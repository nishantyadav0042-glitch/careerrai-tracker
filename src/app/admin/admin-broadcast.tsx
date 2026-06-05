'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Send } from 'lucide-react';

export function AdminBroadcast({ recipientIds }: { recipientIds: string[] }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError('');
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), recipientIds }),
    });
    setSending(false);
    if (!res.ok) { setError('Failed to send. Try again.'); return; }
    setSent(true);
    setTitle('');
    setBody('');
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <Card className="p-5">
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Important: Mock test schedule"
          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message to all students and buddies..."
          rows={3}
          className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {sent && <p className="text-xs text-emerald-700">✓ Sent to {recipientIds.length} users</p>}
        <button
          type="button"
          onClick={send}
          disabled={!title.trim() || !body.trim() || sending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all"
        >
          <Send className="w-4 h-4" /> {sending ? 'Sending…' : `Send to all ${recipientIds.length} users`}
        </button>
      </div>
    </Card>
  );
}
