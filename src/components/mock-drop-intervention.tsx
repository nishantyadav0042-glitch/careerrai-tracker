'use client';

import { useState } from 'react';
import { X, TrendingDown, MessageCircle } from 'lucide-react';
import { DropAlert, getDropMessage, getDropEmoji } from '@/lib/mock-drop-utils';
import { cn } from '@/lib/utils';

interface MockDropInterventionProps {
  isOpen: boolean;
  onClose: () => void;
  dropAlert: DropAlert | null;
  testScore: number;
  studentName: string;
  buddyName: string;
}

export function MockDropIntervention({
  isOpen,
  onClose,
  dropAlert,
  testScore,
  studentName,
  buddyName
}: MockDropInterventionProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen || !dropAlert) return null;

  const dropMessage = getDropMessage(dropAlert.drop);
  const dropEmoji = getDropEmoji(dropAlert.drop);
  const severityColor = dropAlert.drop >= 15 ? 'red' : dropAlert.drop >= 10 ? 'orange' : 'amber';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header - Warning Zone */}
        <div className={cn(
          'p-6 text-white',
          severityColor === 'red'
            ? 'bg-gradient-to-r from-red-600 to-red-700'
            : severityColor === 'orange'
            ? 'bg-gradient-to-r from-orange-600 to-orange-700'
            : 'bg-gradient-to-r from-amber-600 to-amber-700'
        )}>
          <div className="flex items-start gap-3">
            <div className="text-4xl">{dropEmoji}</div>
            <div>
              <h2 className="text-2xl font-bold leading-tight">
                Score {dropMessage}
              </h2>
              <p className="text-sm opacity-90 mt-1">
                We noticed a change in your performance
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Score Comparison */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
              Your Progress
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Previous */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-xs text-emerald-600 font-medium mb-1">Previous Best</p>
                <div className="text-3xl font-bold text-emerald-700">
                  {dropAlert.previousPercentile.toFixed(1)}
                </div>
                <p className="text-xs text-emerald-600 mt-2">percentile</p>
              </div>

              {/* Current */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-xs text-red-600 font-medium mb-1">Current</p>
                <div className="text-3xl font-bold text-red-700">
                  {dropAlert.currentPercentile.toFixed(1)}
                </div>
                <p className="text-xs text-red-600 mt-2">percentile</p>
              </div>
            </div>

            {/* Drop Indicator */}
            <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {dropAlert.drop.toFixed(1)} percentile drop
                </p>
                <p className="text-xs text-stone-600">
                  from your recent performance
                </p>
              </div>
            </div>
          </div>

          {/* Test Details */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
              This Test
            </h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-2xl font-bold text-blue-900">
                {testScore}/100
              </p>
              <p className="text-xs text-blue-600 mt-1">Score achieved</p>
            </div>
          </div>

          {/* Why This Matters */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
              Why This Matters
            </h3>
            <div className="bg-stone-50 rounded-lg p-4 space-y-2 text-sm text-stone-700">
              <p>
                • Your buddy watches for performance shifts to provide support
              </p>
              <p>
                • Drops can indicate changed strategies or topic gaps
              </p>
              <p>
                • Early intervention helps you refocus on what matters
              </p>
            </div>
          </div>

          {/* Buddy Message */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Your Buddy Noticed
            </h3>
            <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4">
              <p className="text-sm text-blue-900 italic">
                "{buddyName} has been notified about this change and will reach out with guidance."
              </p>
            </div>
          </div>

          {/* Acknowledgment */}
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1 w-4 h-4 accent-orange-600 rounded"
              />
              <span className="text-sm text-stone-700">
                I understand this feedback and will review my approach
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-stone-200 bg-stone-50 p-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={!acknowledged}
            className={cn(
              'flex-1 py-3 px-4 rounded-xl font-semibold transition-all',
              acknowledged
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            )}
          >
            Got It, Thanks
          </button>
        </div>
      </div>
    </div>
  );
}
