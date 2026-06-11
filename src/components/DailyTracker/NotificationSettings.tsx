'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Bell, Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationSettings {
  reminders_enabled: boolean;
  reminder_time: string;
  reminder_days: string[];
}

export function NotificationSettings() {
  const supabase = createClient();
  const { isSupported, isSubscribed, subscribe, unsubscribe, isLoading } = usePushNotifications();

  const [settings, setSettings] = useState<NotificationSettings>({
    reminders_enabled: false,
    reminder_time: '23:00',
    reminder_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', user.id)
        .single();

      if (data?.notif_prefs) {
        setSettings({
          reminders_enabled: data.notif_prefs.daily_reminder || false,
          reminder_time: data.notif_prefs.reminder_time || '23:00',
          reminder_days: data.notif_prefs.reminder_days || [
            'Mon',
            'Tue',
            'Wed',
            'Thu',
            'Fri',
            'Sat',
            'Sun',
          ],
        });
      }
    };

    loadSettings();
  }, [supabase]);

  const handleToggleReminders = async (enabled: boolean) => {
    if (enabled && !isSubscribed) {
      try {
        await subscribe();
      } catch (error) {
        console.error('Failed to subscribe:', error);
        return;
      }
    } else if (!enabled && isSubscribed) {
      try {
        await unsubscribe();
      } catch (error) {
        console.error('Failed to unsubscribe:', error);
      }
    }

    const newSettings = { ...settings, reminders_enabled: enabled };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleTimeChange = (time: string) => {
    const newSettings = { ...settings, reminder_time: time };
    setSettings(newSettings);
  };

  const toggleDay = (day: string) => {
    const newDays = settings.reminder_days.includes(day)
      ? settings.reminder_days.filter((d) => d !== day)
      : [...settings.reminder_days, day];

    const newSettings = { ...settings, reminder_days: newDays };
    setSettings(newSettings);
  };

  const saveSettings = async (newSettings: NotificationSettings) => {
    setIsSaving(true);
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({
          notif_prefs: {
            daily_reminder: newSettings.reminders_enabled,
            reminder_time: newSettings.reminder_time,
            reminder_days: newSettings.reminder_days,
            push: newSettings.reminders_enabled,
            email: false,
          },
        })
        .eq('id', user.id);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    saveSettings(settings);
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-600">
        <p>Push notifications are not supported in your browser.</p>
      </div>
    );
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const times = [
    { value: '21:00', label: '9:00 PM' },
    { value: '22:00', label: '10:00 PM' },
    { value: '23:00', label: '11:00 PM' },
    { value: '23:30', label: '11:30 PM' },
  ];

  return (
    <div className="space-y-5">
      {/* Main Toggle */}
      <div className="flex items-center justify-between p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-orange-600" />
          <div>
            <p className="font-semibold text-stone-900">Daily Reminder</p>
            <p className="text-xs text-stone-600 mt-0.5">Get a nudge to log your prep</p>
          </div>
        </div>

        <button
          onClick={() => handleToggleReminders(!settings.reminders_enabled)}
          disabled={isLoading}
          className={cn(
            'relative w-14 h-8 rounded-full transition-colors',
            settings.reminders_enabled ? 'bg-orange-600' : 'bg-stone-300'
          )}
        >
          <div
            className={cn(
              'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform',
              settings.reminders_enabled && 'translate-x-6'
            )}
          />
        </button>
      </div>

      {settings.reminders_enabled && (
        <>
          {/* Time Selector */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-900 mb-2">
              <Clock className="w-4 h-4" />
              Reminder Time
            </label>
            <div className="grid grid-cols-2 gap-2">
              {times.map((time) => (
                <button
                  key={time.value}
                  onClick={() => handleTimeChange(time.value)}
                  className={cn(
                    'py-2 px-3 rounded-lg text-sm font-medium transition-all',
                    settings.reminder_time === time.value
                      ? 'bg-orange-600 text-white'
                      : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                  )}
                >
                  {time.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day Selector */}
          <div>
            <p className="text-sm font-semibold text-stone-900 mb-2">Reminder Days</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'py-2 rounded-lg font-semibold text-xs transition-all',
                    settings.reminder_days.includes(day)
                      ? 'bg-teal-600 text-white'
                      : 'bg-stone-100 text-stone-600'
                  )}
                >
                  {day[0]}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-600 mt-2">
              {settings.reminder_days.length} days/week
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white active:scale-[0.98]'
            )}
          >
            {saved && <Check className="w-5 h-5" />}
            {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </>
      )}
    </div>
  );
}
