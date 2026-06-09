'use client';

import { useState } from 'react';
import { Calendar, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface GoogleCalendarConnectBtnProps {
  isConnected: boolean;
  onConnectSuccess?: () => void;
  onDisconnectSuccess?: () => void;
}

export function GoogleCalendarConnectBtn({
  isConnected,
  onConnectSuccess,
  onDisconnectSuccess,
}: GoogleCalendarConnectBtnProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get current page URL to redirect back after auth
      const redirectUrl = window.location.pathname + window.location.search;

      // Call auth endpoint to get authorization URL
      const response = await fetch('/api/google/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to initialize Google authentication');
      }

      const { authUrl } = await response.json();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? Scheduled sessions will not have Meet links.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      onDisconnectSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  if (isConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <Calendar className="w-4 h-4 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">Google Calendar Connected</p>
            <p className="text-xs text-green-700">Your calendar is synced for scheduling</p>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {loading ? 'Disconnecting...' : 'Disconnect Calendar'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
      >
        <Calendar className="w-4 h-4" />
        {loading ? 'Connecting...' : 'Connect Google Calendar'}
      </button>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
      )}

      <p className="text-xs text-stone-600">
        ✓ Required for automatic Google Meet scheduling<br/>
        ✓ We only access your calendar events<br/>
        ✓ Disconnect anytime from settings
      </p>
    </div>
  );
}
