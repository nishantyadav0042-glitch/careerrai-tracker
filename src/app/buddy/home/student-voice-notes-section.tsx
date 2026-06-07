'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mic, Volume2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface StudentNote {
  student_id: string;
  student_name: string;
  has_voice_note: boolean;
  last_note_date: string;
}

interface StudentVoiceNotesSectionProps {
  buddyId: string;
}

export function StudentVoiceNotesSection({ buddyId }: StudentVoiceNotesSectionProps) {
  const supabase = createClient();
  const [students, setStudents] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      // Fetch all students assigned to this buddy
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, buddy_id')
        .eq('buddy_id', buddyId)
        .eq('role', 'student');

      if (error) throw error;

      // Format the data
      const studentNotes = (data || []).map((s) => ({
        student_id: s.id,
        student_name: s.full_name || 'Student',
        has_voice_note: false, // Will be updated once voice_notes table is created
        last_note_date: new Date().toISOString(),
      }));

      setStudents(studentNotes);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Mic className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-bold text-stone-900">
            Student Voice Notes & Doubts
          </h2>
        </div>
        <p className="text-sm text-stone-600">
          Listen to your students' concerns and provide voice feedback
        </p>
      </div>

      {/* Students List */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">Loading students...</div>
      ) : students.length === 0 ? (
        <div className="bg-white border-2 border-stone-200 rounded-xl p-6 text-center">
          <Mic className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-600 text-sm">No students assigned yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {students.map((student) => (
            <Link
              key={student.student_id}
              href={`/buddy/students/${student.student_id}`}
              className="bg-white border-2 border-orange-200 rounded-xl p-4 hover:border-orange-300 hover:bg-orange-50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900 group-hover:text-orange-700">{student.student_name}</p>
                  {student.has_voice_note && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-600 mt-1">
                      <Volume2 className="w-3 h-3" />
                      <span>Has voice note</span>
                    </div>
                  )}
                </div>
                <ArrowRight className="w-5 h-5 text-stone-400 group-hover:text-orange-600 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
