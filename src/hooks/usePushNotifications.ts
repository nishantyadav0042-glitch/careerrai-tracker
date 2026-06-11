import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PushNotificationOptions {
  title: string;
  body: string;
  badge?: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Hook for managing push notifications
 * Handles subscription, permission, and notification display
 */
export function usePushNotifications() {
  const supabase = createClient();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check browser support
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      checkSubscriptionStatus();
    } else {
      setIsLoading(false);
    }
  }, []);

  const checkSubscriptionStatus = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Failed to check subscription status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const subscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      // Request permission
      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked. Please enable in browser settings.');
      }

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('User denied notification permission');
        }
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Get VAPID public key (stored in env)
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Save subscription to database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          subscription: subscription.toJSON(),
        }),
      });

      setIsSubscribed(true);
      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const unsubscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Notify backend
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
        }
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const showLocalNotification = useCallback(
    async (options: PushNotificationOptions) => {
      if (!isSupported) {
        console.warn('Push notifications not supported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(options.title, {
          body: options.body,
          badge: options.badge || '/careerrai-monogram.png',
          icon: options.icon || '/careerrai-monogram.png',
          tag: options.tag,
          data: options.data,
          requireInteraction: false,
          actions: [
            { action: 'open', title: 'Open' },
            { action: 'close', title: 'Close' },
          ],
        });
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    },
    [isSupported]
  );

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    showLocalNotification,
  };
}

/**
 * Hook for scheduling 11 PM daily reminders
 */
export function useDailyReminder(enabled: boolean = true) {
  const { showLocalNotification } = usePushNotifications();

  useEffect(() => {
    if (!enabled) return;

    const checkAndNotify = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Check if it's 11 PM (23:00)
      if (hour === 23 && minute === 0) {
        showLocalNotification({
          title: '🌙 Time to log your prep!',
          body: 'Your streak is waiting. Log in 30 seconds.',
          tag: 'daily-reminder',
          data: { action: 'log' },
        });
      }
    };

    // Check every minute
    const interval = setInterval(checkAndNotify, 60000);

    return () => clearInterval(interval);
  }, [enabled, showLocalNotification]);
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
