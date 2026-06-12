'use client';
import { useState } from 'react';
import { AlertTriangle, Calendar, Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface UrgentRequest {
  id: string;
  studentId: string;
  studentName: string;
  message: string | null;
  createdAt: string;
}

interface Props {
  requests: UrgentRequest[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function UrgentRequestsPanel({ requests: initial }: Props) {
  const [requests, setRequests] = useState(initial);
  const [resolving, setResolving] = useState<string | null>(null);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await fetch('/api/sessions/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setResolving(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        <p className="text-[10px] uppercase tracking-widest font-bold text-rose-700">
          Urgent help requested ({requests.length})
        </p>
      </div>
      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-rose-900">{req.studentName}</span>
                  <span className="text-[10px] text-rose-500 font-medium">{timeAgo(req.createdAt)}</span>
                </div>
                {req.message && (
                  <p className="text-sm text-rose-800 mt-0.5 italic">&quot;{req.message}&quot;</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/buddy/students/${req.studentId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                View student
              </Link>
              <Link
                href="/buddy/schedule"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors"
              >
                <Calendar className="w-3 h-3" />
                Schedule session
              </Link>
              <button
                onClick={() => resolve(req.id)}
                disabled={resolving === req.id}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 bg-white border border-stone-200 text-stone-500 rounded-lg text-xs font-medium hover:bg-stone-50 transition-colors ml-auto',
                  resolving === req.id && 'opacity-50'
                )}
              >
                <Check className="w-3 h-3" />
                Done
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
