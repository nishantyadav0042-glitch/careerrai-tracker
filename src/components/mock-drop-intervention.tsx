'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, AlertCircle } from 'lucide-react';

interface MockDropInterventionProps {
  studentId: string;
  dropAmount: number;
  buddyFirstName?: string;
  onDismiss: () => void;
}

export function MockDropIntervention({ studentId, dropAmount, buddyFirstName, onDismiss }: MockDropInterventionProps) {
  const supabase = createClient();

  const handleDismiss = async () => {
    // Mark student_seen = true so we don't show again
    try {
      await supabase
        .from('mock_drop_alerts')
        .update({ student_seen: true })
        .eq('student_id', studentId)
        .eq('student_seen', false);
    } catch (e) {
      // non-fatal
    }
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 text-white">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold leading-snug">
                Score drop detected.<br />This is expected. Here&apos;s why.
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-stone-700 leading-relaxed">
            As CAT gets closer, more serious competitors take mocks. The pool gets tougher,
            so the same accuracy gives a lower percentile.{' '}
            <strong>Your skill hasn&apos;t declined — the benchmark moved.</strong>
          </p>

          {/* Visual comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200">
              <div className="text-xs font-semibold text-stone-500 mb-1">May pool</div>
              <div className="text-2xl">👥</div>
              <div className="text-xs text-stone-600 mt-1">All aspirants</div>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-200">
              <div className="text-xs font-semibold text-orange-600 mb-1">October pool</div>
              <div className="text-2xl">🎯</div>
              <div className="text-xs text-stone-600 mt-1">Only serious prep</div>
            </div>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
            <p className="text-xs text-teal-800 font-medium">
              🔔 Your buddy has been flagged about this drop.{' '}
              {buddyFirstName
                ? `Expect a message from ${buddyFirstName} within 24 hours.`
                : 'Expect a message from your buddy within 24 hours.'}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={handleDismiss}
            className="w-full py-3.5 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-all active:scale-[0.98]"
          >
            Got it. Show my score.
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook: call after mock score submission.
 * Returns { shouldShow, dropAmount, dismiss } and fires the buddy notification.
 */
export function useMockDropAlert(studentId: string, buddyId: string | null) {
  const supabase = createClient();
  const [alert, setAlert] = useState<{ dropAmount: number } | null>(null);

  const checkDrop = async (newPercentile: number) => {
    try {
      // Get previous mock percentile
      const { data: prevTests } = await supabase
        .from('test_results')
        .select('percentile')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (!prevTests || prevTests.length < 2) return;

      const prev = prevTests[1].percentile;
      const drop = prev - newPercentile;
      if (drop <= 8) return;

      // Check 30-day cooldown
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: recent } = await supabase
        .from('mock_drop_alerts')
        .select('id')
        .eq('student_id', studentId)
        .gte('triggered_at', thirtyDaysAgo.toISOString())
        .limit(1);
      if (recent && recent.length > 0) return;

      // Insert alert
      const { error } = await supabase
        .from('mock_drop_alerts')
        .insert({ student_id: studentId, drop_amount: drop, buddy_notified: !!buddyId });

      if (error) throw error;

      // Notify buddy
      if (buddyId) {
        await fetch('/api/buddy/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _internal_mock_drop_notification: true,
            student_id: studentId,
            buddy_id: buddyId,
            drop_amount: drop,
          }),
        }).catch(() => {});
      }

      setAlert({ dropAmount: drop });
    } catch (e) {
      console.error('useMockDropAlert error:', e);
    }
  };

  return { alert, checkDrop, dismiss: () => setAlert(null) };
}
