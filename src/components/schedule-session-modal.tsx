'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ScheduleSessionForm } from './schedule-session-form';

interface ScheduleSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  buddyName: string;
}

export function ScheduleSessionModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  buddyName,
}: ScheduleSessionModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto pointer-events-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-stone-200 p-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">Schedule Session</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-stone-600" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <ScheduleSessionForm
              studentId={studentId}
              studentName={studentName}
              buddyName={buddyName}
              onSuccess={() => {
                // Close modal after successful scheduling
                setTimeout(onClose, 1500);
              }}
              onError={() => {
                // Keep modal open on error
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
