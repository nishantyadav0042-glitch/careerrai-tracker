'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Mic, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { VoiceNoteRecorder } from '@/components/voice-note-recorder';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string;
  full_name: string;
}

interface BuddyQuickVoiceMessageProps {
  buddyId: string;
  buddyName: string;
}

export function BuddyQuickVoiceMessage({
  buddyId,
  buddyName,
}: BuddyQuickVoiceMessageProps) {
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('buddy_id', buddyId)
        .order('full_name');

      if (!error && data) {
        setStudents(data);
        if (data.length > 0) {
          setSelectedStudent(data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, buddyId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  if (loading) return null;

  if (students.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-3 sm:px-4 py-3 bg-stone-50 border border-dashed border-stone-300 rounded-lg sm:rounded-xl text-stone-500">
        <Mic className="w-4 h-4 flex-shrink-0" />
        <p className="text-xs sm:text-sm">No students assigned yet — voice messages unlock once a student is paired with you.</p>
      </div>
    );
  }

  if (isRecording && selectedStudent) {
    return (
      <VoiceNoteRecorder
        studentId={selectedStudent.id}
        buddyId={buddyId}
        studentName={selectedStudent.full_name}
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        onSendComplete={() => {
          setIsRecording(false);
          // Optional: Show success message
        }}
        feedbackType="buddy_feedback"
      />
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg sm:rounded-xl font-medium text-sm sm:text-base hover:shadow-lg transition-all"
        >
          <Mic className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
          Send Voice Message
        </button>
      ) : (
        <Card className="p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm sm:text-base text-stone-900">📢 Voice Message</h3>
            <button
              onClick={() => {
                setIsOpen(false);
                setSelectedStudent(students[0] || null);
              }}
              className="p-1 hover:bg-orange-100 rounded transition-colors"
            >
              <X className="w-4 h-4 text-stone-600" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1.5 sm:mb-2">
              Select Student
            </label>
            <select
              value={selectedStudent?.id || ''}
              onChange={(e) => {
                const student = students.find((s) => s.id === e.target.value);
                setSelectedStudent(student || null);
              }}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border border-orange-300 rounded-lg focus:outline-none focus:border-orange-600 bg-white"
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsRecording(true)}
            disabled={!selectedStudent}
            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-600 text-white rounded-lg font-medium text-xs sm:text-sm hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Mic className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            Record & Send
          </button>
        </Card>
      )}
    </div>
  );
}
