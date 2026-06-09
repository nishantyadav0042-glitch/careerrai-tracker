'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ScheduleSessionModal } from '@/components/schedule-session-modal';

interface StudentInfo {
  id: string;
  full_name: string;
}

export default function BuddySchedulePage() {
  const supabase = createClient();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buddyName, setBuddyName] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Not authenticated');
        return;
      }

      // Get buddy info
      const { data: buddyProfile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single();

      if (buddyProfile?.role !== 'buddy') {
        setError('Only buddies can schedule sessions');
        return;
      }

      setBuddyName(buddyProfile?.full_name || 'Buddy');

      // Get students assigned to this buddy
      const { data: studentList, error: listError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('buddy_id', user.id)
        .order('full_name');

      if (listError) {
        setError('Failed to load students');
      } else {
        setStudents(studentList || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleClick = (student: StudentInfo) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/buddy/home"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-stone-900">Schedule Sessions</h1>
            <p className="text-sm text-stone-600">Create video sessions with your students</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading && (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-stone-600">Loading students...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && students.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-stone-300 mx-auto mb-3" />
            <p className="text-lg font-semibold text-stone-900 mb-1">No students assigned</p>
            <p className="text-sm text-stone-600">
              You don't have any students assigned to you yet.
            </p>
          </div>
        )}

        {!loading && !error && students.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-stone-600 px-1">
              Select a student to schedule a video session
            </p>

            <div className="grid gap-3">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="bg-white rounded-lg border border-stone-200 p-4 flex items-center justify-between hover:border-stone-300 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-stone-900">{student.full_name}</p>
                    <p className="text-xs text-stone-600 mt-0.5">Student</p>
                  </div>
                  <button
                    onClick={() => handleScheduleClick(student)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Schedule
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      {selectedStudent && (
        <ScheduleSessionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          studentId={selectedStudent.id}
          studentName={selectedStudent.full_name}
          buddyName={buddyName}
        />
      )}
    </div>
  );
}
