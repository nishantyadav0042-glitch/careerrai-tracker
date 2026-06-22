'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface Props {
  onNext: (data: {
    full_name: string;
    phone: string;
    college: string;
    course_year: number | null;
    is_working_professional: boolean;
    work_ex_months: number | null;
    coaching_enrolled: boolean;
  }) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const YEAR_OPTIONS = [
  { label: '1st', value: 1 },
  { label: '2nd', value: 2 },
  { label: '3rd', value: 3 },
  { label: '4th', value: 4 },
];

export default function ScreenAboutYou({ onNext, onBack, canGoBack, isLoading }: Props) {
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [college, setCollege] = useState('');
  const [isWorkingProfessional, setIsWorkingProfessional] = useState<boolean>(false);
  const [workExMonths, setWorkExMonths] = useState<string>('');
  const [courseYear, setCourseYear] = useState<number | null>(null);
  const [coachingEnrolled, setCoachingEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, college')
        .eq('id', user.id)
        .single();
      if (data) {
        if (data.full_name && data.full_name !== 'Student' && data.full_name !== 'Buddy' && data.full_name !== 'New User') {
          setFullName(data.full_name);
        }
        if (data.phone) {
          // Strip +91 country code so the field shows just the 10-digit number
          setPhone(data.phone.replace(/^\+91/, ''));
        }
        if (data.college) setCollege(data.college);
      }
    })();
  }, []);

  const isValid = fullName.trim() !== '' && college.trim() !== '';

  const handleNext = () => {
    if (!isValid) return;
    onNext({
      full_name: fullName.trim(),
      phone: phone.trim(),
      college: college.trim(),
      course_year: !isWorkingProfessional ? courseYear : null,
      is_working_professional: isWorkingProfessional,
      work_ex_months: isWorkingProfessional && workExMonths.trim() !== '' ? parseInt(workExMonths, 10) : null,
      coaching_enrolled: coachingEnrolled ?? false,
    });
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400';
  const labelClass = 'block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2';

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        A little about you so we can personalise your experience.
      </p>

      <div className="space-y-4">
        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Personal</p>

        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            placeholder="e.g. Rohan Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Mobile</label>
          <input
            type="tel"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>College / University <span className="text-orange-500">*</span></label>
          <input
            type="text"
            placeholder="e.g. Delhi College of Engineering"
            value={college}
            onChange={(e) => setCollege(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Work & study context</p>

        <div>
          <label className={labelClass}>Current situation</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Working Professional', value: true },
              { label: 'Student', value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setIsWorkingProfessional(value)}
                className={cn(
                  'py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all active:scale-95',
                  isWorkingProfessional === value
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isWorkingProfessional ? (
          <div>
            <label className={labelClass}>Work experience (months)</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 24"
              value={workExMonths}
              onChange={(e) => setWorkExMonths(e.target.value)}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label className={labelClass}>Year of study</label>
            <div className="flex gap-2">
              {YEAR_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setCourseYear(value)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
                    courseYear === value
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Coaching enrolled?</label>
          <div className="flex gap-2">
            {[
              { label: 'Yes, enrolled', value: true },
              { label: 'No coaching', value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setCoachingEnrolled(value)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
                  coachingEnrolled === value
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!isValid || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            isValid ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          )}
        >
          {isLoading ? 'Saving…' : 'Almost there →'}
        </button>
      </div>
    </div>
  );
}
