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
    <div className="space-y-2.5 sm:space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 sm:mb-2">
          <Mic className="w-4 sm:w-5 h-4 sm:h-5 text-orange-600 flex-shrink-0" />
          <h2 className="text-sm sm:text-lg font-bold text-stone-900 truncate">
            Student Voice Notes
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-stone-600">
          Check your students' concerns and respond
        </p>
      </div>

      {/* Students List - Mobile Optimized */}
      {loading ? null : students.length === 0 ? null : (
        <div className="grid gap-1.5 sm:gap-2.5">
          {students.map((student) => (
            <Link
              key={student.student_id}
              href={`/buddy/students/${student.student_id}`}
              className="bg-white border border-orange-200 sm:border-2 rounded-lg sm:rounded-xl p-2.5 sm:p-3 hover:border-orange-300 hover:bg-orange-50 transition-all group"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium sm:font-semibold text-xs sm:text-base text-stone-900 group-hover:text-orange-700 truncate">
                    {student.student_name}
                  </p>
                  {student.has_voice_note && (
                    <div className="flex items-center gap-1 text-xs text-orange-600 mt-0.5">
                      <Volume2 className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">Voice note</span>
                    </div>
                  )}
                </div>
                <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5 text-stone-400 group-hover:text-orange-600 transition-colors flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
