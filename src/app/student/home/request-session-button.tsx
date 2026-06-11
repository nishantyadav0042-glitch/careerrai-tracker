'use client';

import { useState } from 'react';
import { Video, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface RequestSessionButtonProps {
  buddyId: string;
  buddyName?: string;
  hasUpcomingSessions: boolean;
}

export function RequestSessionButton({
  buddyId,
  buddyName = 'Your Buddy',
  hasUpcomingSessions,
}: RequestSessionButtonProps) {
  const [requesting, setRequesting] = useState(false);

  const handleRequestSession = async () => {
    setRequesting(true);
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buddyId }),
      });

      if (res.ok) {
        alert('Session request sent to ' + buddyName);
      } else {
        alert('Failed to send request');
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setRequesting(false);
    }
  };

  if (hasUpcomingSessions) {
    return null;
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-100">
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-stone-900">No upcoming sessions</h3>
            <p className="text-xs text-stone-600 mt-0.5">Request a meeting with {buddyName}</p>
          </div>
        </div>
        <button
          onClick={handleRequestSession}
          disabled={requesting}
          className="w-full py-2 px-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Video className="w-4 h-4" />
          {requesting ? 'Sending...' : 'Request Session'}
        </button>
      </div>
    </Card>
  );
}
