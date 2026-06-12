/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from 'react';

interface PendingLog {
  id: string;
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  timestamp: number;
  status: 'pending' | 'synced' | 'failed';
}

/**
 * Hook for offline-first logging with IndexedDB fallback
 * Logs are stored locally first, then synced when online
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingLogs, setPendingLogs] = useState<PendingLog[]>([]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load pending logs from IndexedDB on mount
  useEffect(() => {
    const loadPendingLogs = async () => {
      try {
        const db = await openIndexedDB();
        const tx = db.transaction('pending_logs', 'readonly');
        const store = tx.objectStore('pending_logs');
        const request = store.getAll();

        request.onsuccess = () => {
          setPendingLogs(request.result as PendingLog[]);
        };
      } catch (error) {
        console.error('Failed to load pending logs:', error);
      }
    };

    loadPendingLogs();
  }, []);

  // Save log locally (optimistic)
  const saveLogOffline = useCallback(
    async (logData: Omit<PendingLog, 'id' | 'timestamp' | 'status'>) => {
      const log: PendingLog = {
        ...logData,
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        status: 'pending',
      };

      try {
        // Save to IndexedDB
        const db = await openIndexedDB();
        const tx = db.transaction('pending_logs', 'readwrite');
        const store = tx.objectStore('pending_logs');
        store.add(log);

        // Update local state
        setPendingLogs((prev) => [log, ...prev]);

        return log;
      } catch (error) {
        console.error('Failed to save log offline:', error);
        throw error;
      }
    },
    []
  );

  // Sync pending logs when online
  const syncPendingLogs = useCallback(async () => {
    if (!isOnline) return;

    const pending = pendingLogs.filter((l) => l.status === 'pending');
    if (pending.length === 0) return;

    const results = [];

    for (const log of pending) {
      try {
        const response = await fetch('/api/logging/log-daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hours: log.hours,
            sections: log.sections,
            energy: log.energy,
            notes: log.notes,
          }),
        });

        if (response.ok) {
          // Mark as synced in IndexedDB
          await updateLogStatus(log.id, 'synced');
          setPendingLogs((prev) =>
            prev.map((l) => (l.id === log.id ? { ...l, status: 'synced' } : l))
          );
          results.push({ id: log.id, status: 'synced' });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to sync log ${log.id}:`, error);
        await updateLogStatus(log.id, 'failed');
        setPendingLogs((prev) =>
          prev.map((l) => (l.id === log.id ? { ...l, status: 'failed' } : l))
        );
        results.push({ id: log.id, status: 'failed' });
      }
    }

    return results;
  }, [isOnline, pendingLogs]);

  // Auto-sync when coming online
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (isOnline) {
      syncPendingLogs();
    }
  }, [isOnline, syncPendingLogs]);

  return {
    isOnline,
    pendingLogs,
    saveLogOffline,
    syncPendingLogs,
  };
}

/**
 * IndexedDB setup for offline storage
 */
async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('careerrai-offline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('pending_logs')) {
        db.createObjectStore('pending_logs', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('cached_streak')) {
        db.createObjectStore('cached_streak', { keyPath: 'student_id' });
      }
    };
  });
}

async function updateLogStatus(logId: string, status: 'synced' | 'failed') {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending_logs', 'readwrite');
    const store = tx.objectStore('pending_logs');
    const request = store.get(logId);

    request.onsuccess = () => {
      const log = request.result;
      if (log) {
        log.status = status;
        store.put(log);
      }
    };
  } catch (error) {
    console.error('Failed to update log status:', error);
  }
}
