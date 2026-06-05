'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { detectMockDrop, createDropAlert, DropAlert } from '@/lib/mock-drop-utils';

interface UseMockDropCheckProps {
  studentId: string;
  testScore?: number;
  testType?: string;
  enabled?: boolean;
}

export function useMockDropCheck({
  studentId,
  testScore,
  testType = 'mock',
  enabled = true
}: UseMockDropCheckProps) {
  const supabase = createClient();
  const [dropAlert, setDropAlert] = useState<DropAlert | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [buddyInfo, setBuddyInfo] = useState<{ buddy_id: string; buddy_name: string } | null>(null);

  useEffect(() => {
    if (!enabled || !studentId) return;

    async function checkDrop() {
      setIsChecking(true);
      try {
        // Load buddy info first
        const { data: profile } = await supabase
          .from('profiles')
          .select('buddy_id, profiles(full_name)')
          .eq('id', studentId)
          .single();

        if (!profile?.buddy_id) return;

        // Get buddy name
        const { data: buddy } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', profile.buddy_id)
          .single();

        setBuddyInfo({
          buddy_id: profile.buddy_id,
          buddy_name: buddy?.full_name || 'Your Buddy'
        });

        // Check for drop
        const drop = await detectMockDrop(studentId);

        if (drop) {
          setDropAlert(drop);

          // Create alert for buddy
          if (testScore !== undefined && buddyInfo) {
            await createDropAlert(studentId, buddyInfo.buddy_id, drop, testScore);
          }
        }
      } catch (error) {
        console.error('Error checking mock drop:', error);
      } finally {
        setIsChecking(false);
      }
    }

    checkDrop();
  }, [enabled, studentId, supabase]);

  const clearAlert = () => {
    setDropAlert(null);
  };

  return {
    dropAlert,
    isChecking,
    buddyInfo,
    clearAlert
  };
}
