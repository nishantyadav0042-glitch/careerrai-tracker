'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GoogleCalendarConnectBtn } from '@/components/google-calendar-connect-btn';

export default function StudentSettingsPage() {
  const supabase = createClient();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkGoogleCalendarStatus();
  }, []);

  const checkGoogleCalendarStatus = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_connected')
        .eq('id', user.id)
        .single();

      setIsConnected(profile?.google_calendar_connected ?? false);
    } catch (error) {
      console.error('Error checking calendar connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-8">Settings</h1>

        <div className="bg-white rounded-lg border border-stone-200 p-6 space-y-6">
          {/* Calendar Integration Section */}
          <div className="border-b border-stone-100 pb-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-2">Calendar Integration</h2>
            <p className="text-sm text-stone-600 mb-4">
              Connect your Google Calendar to receive automated reminders and sync your schedule with your buddy.
            </p>

            {!loading && (
              <GoogleCalendarConnectBtn
                isConnected={isConnected}
                onConnectSuccess={handleSuccess}
                onDisconnectSuccess={handleDisconnect}
              />
            )}
          </div>

          {/* Account Section */}
          <div>
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Account</h2>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
