'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface Props {
  buddyId: string;
  initialProfile: {
    full_name: string | null;
    cat_percentile: number | null;
    college: string | null;
  };
}

interface Fields {
  full_name: string;
  first_attempt_percentile: string;
  cat_percentile: string;
  is_first_timer: boolean;
  cat_year: string;
  iim_converted: string;
  current_company: string;
  linkedin_url: string;
  biggest_mistake: string;
  younger_self_advice: string;
  strongest_section: string;
  student_types_helped: string[];
  how_i_work: string;
}

const STUDENT_TYPE_OPTIONS = [
  'Freshers',
  'Repeaters',
  'Working Professionals',
  'Engineers',
  'Non-Engineers',
  '90%ile+ stuck students',
];

const CAT_YEAR_OPTIONS = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];

const STEP_TITLES = [
  'Your CAT Journey',
  'Credibility',
  'Your Real Story',
  'Who You Help Best',
  'Your Working Style',
];

export function SetupFormClient({ buddyId, initialProfile }: Props) {
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Placeholder names from signup must never survive setup — students see this name.
  const isPlaceholderName = !initialProfile.full_name ||
    ['New User', 'Buddy', 'Student'].includes(initialProfile.full_name);

  const [fields, setFields] = useState<Fields>({
    full_name: isPlaceholderName ? '' : (initialProfile.full_name ?? ''),
    first_attempt_percentile: '',
    cat_percentile: initialProfile.cat_percentile != null ? String(initialProfile.cat_percentile) : '',
    is_first_timer: true,
    cat_year: '',
    iim_converted: initialProfile.college ?? '',
    current_company: '',
    linkedin_url: '',
    biggest_mistake: '',
    younger_self_advice: '',
    strongest_section: '',
    student_types_helped: [],
    how_i_work: '',
  });

  const setField = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const toggleStudentType = (type: string) => {
    setFields((prev) => ({
      ...prev,
      student_types_helped: prev.student_types_helped.includes(type)
        ? prev.student_types_helped.filter((t) => t !== type)
        : [...prev.student_types_helped, type],
    }));
  };

  const stepValid = (): boolean => {
    if (step === 0) return fields.full_name.trim() !== '' && fields.cat_percentile.trim() !== '';
    if (step === 3) return fields.strongest_section !== '';
    if (step === 4) return fields.how_i_work.trim() !== '';
    return true;
  };

  const handleNext = () => {
    if (!stepValid()) return;
    setSaveError('');
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setSaveError('');
    setStep((s) => s - 1);
  };

  const handleComplete = async () => {
    if (!stepValid()) return;
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fields.full_name.trim(),
          first_attempt_percentile: !fields.is_first_timer && fields.first_attempt_percentile.trim() !== ''
            ? parseFloat(fields.first_attempt_percentile)
            : null,
          cat_percentile: fields.cat_percentile.trim() !== '' ? parseFloat(fields.cat_percentile) : null,
          cat_year: fields.cat_year.trim() !== '' ? parseInt(fields.cat_year, 10) : null,
          iim_converted: fields.iim_converted.trim() || null,
          current_company: fields.current_company.trim() || null,
          // Normalize: accept a pasted URL or a bare handle; store a full https URL.
          linkedin_url: fields.linkedin_url.trim()
            ? (fields.linkedin_url.trim().startsWith('http')
                ? fields.linkedin_url.trim()
                : `https://${fields.linkedin_url.trim().replace(/^\/+/, '')}`)
            : null,
          biggest_mistake: fields.biggest_mistake.trim() || null,
          younger_self_advice: fields.younger_self_advice.trim() || null,
          strongest_section: fields.strongest_section || null,
          student_types_helped: fields.student_types_helped,
          how_i_work: fields.how_i_work.trim() || null,
          buddy_onboarding_completed: true,
        })
        .eq('id', buddyId);

      if (error) {
        setSaveError(error.message ?? 'Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      window.location.href = '/buddy/home';
    } catch {
      setSaveError('Network error. Please try again.');
      setSaving(false);
    }
  };

  const pillClass = (active: boolean) =>
    cn(
      'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95',
      active
        ? 'border-orange-500 bg-orange-50 text-orange-700'
        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
    );

  const textareaClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none';
  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400';
  const labelClass = 'block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2';

  const journeyPreview = () => {
    const final = fields.cat_percentile.trim() ? `${fields.cat_percentile}%ile` : '—';
    if (fields.is_first_timer) return `${final} (first attempt)`;
    const first = fields.first_attempt_percentile.trim() ? `${fields.first_attempt_percentile}` : '?';
    return `${first} → repeated → ${final}`;
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 justify-center">
        {STEP_TITLES.map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-all',
              i <= step ? 'bg-orange-500' : 'bg-stone-200'
            )}
          />
        ))}
      </div>

      <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
        {STEP_TITLES[step]}
      </h1>

      {step === 0 && (
        <div className="space-y-5">
          <p className="text-sm text-stone-500">This becomes the first thing students read about you.</p>

          <div>
            <label className={labelClass}>Your full name <span className="text-orange-600">*</span></label>
            <input
              type="text"
              placeholder="e.g. Arjun Mehta"
              value={fields.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-stone-400 mt-1">Students see this on every message and call.</p>
          </div>

          <div>
            <label className={labelClass}>Your path</label>
            <div className="flex gap-2">
              {[
                { label: 'First-timer', value: true },
                { label: 'I repeated', value: false },
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setField('is_first_timer', value)}
                  className={cn('flex-1', pillClass(fields.is_first_timer === value))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!fields.is_first_timer && (
            <div>
              <label className={labelClass}>First attempt percentile</label>
              <input
                type="number"
                min={0}
                max={99}
                step={0.01}
                placeholder="e.g. 80"
                value={fields.first_attempt_percentile}
                onChange={(e) => setField('first_attempt_percentile', e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Final CAT percentile <span className="text-orange-600">*</span></label>
            <input
              type="number"
              min={0}
              max={99}
              step={0.01}
              placeholder="e.g. 97"
              value={fields.cat_percentile}
              onChange={(e) => setField('cat_percentile', e.target.value)}
              className={inputClass}
            />
          </div>

          {fields.cat_percentile.trim() !== '' && (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <p className="text-xs text-stone-500 mb-1 uppercase tracking-wider font-semibold">Preview</p>
              <p className="text-sm font-semibold text-stone-800">{journeyPreview()}</p>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className={labelClass}>CAT year cleared</label>
            <div className="flex flex-wrap gap-2">
              {CAT_YEAR_OPTIONS.map((y) => (
                <button
                  key={y}
                  onClick={() => setField('cat_year', y)}
                  className={pillClass(fields.cat_year === y)}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>College / IIM converted</label>
            <input
              type="text"
              placeholder="e.g. IIM Calcutta"
              value={fields.iim_converted}
              onChange={(e) => setField('iim_converted', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Current company</label>
            <input
              type="text"
              placeholder="e.g. McKinsey & Company"
              value={fields.current_company}
              onChange={(e) => setField('current_company', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>LinkedIn profile</label>
            <input
              type="url"
              placeholder="e.g. linkedin.com/in/yourname"
              value={fields.linkedin_url}
              onChange={(e) => setField('linkedin_url', e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-stone-400 mt-1">Students trust a face they can verify. Optional but strongly recommended.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-stone-500">Students trust specifics. Generic advice is useless here.</p>

          <div>
            <label className={labelClass}>Biggest prep mistake</label>
            <textarea
              rows={4}
              placeholder={'e.g. "Wasted 3 months drilling QA when DILR was my real gap — mocks kept showing it but I ignored them."'}
              value={fields.biggest_mistake}
              onChange={(e) => setField('biggest_mistake', e.target.value)}
              className={textareaClass}
            />
            <p className="text-xs text-stone-400 mt-1">Name the mistake and the signal you missed. No platitudes.</p>
            {fields.biggest_mistake.trim().length > 0 && fields.biggest_mistake.trim().length < 50 && (
              <p className="text-xs text-amber-600 mt-1">More specificity helps students trust you. Aim for at least 50 characters.</p>
            )}
          </div>

          <div>
            <label className={labelClass}>What you&apos;d tell yourself</label>
            <textarea
              rows={4}
              placeholder={'e.g. "Time your mocks end-to-end from mock 1, not mock 10. Accuracy without speed is useless in the actual exam."'}
              value={fields.younger_self_advice}
              onChange={(e) => setField('younger_self_advice', e.target.value)}
              className={textareaClass}
            />
            <p className="text-xs text-stone-400 mt-1">Concrete insight, not encouragement.</p>
            {fields.younger_self_advice.trim().length > 0 && fields.younger_self_advice.trim().length < 50 && (
              <p className="text-xs text-amber-600 mt-1">More specificity helps students trust you. Aim for at least 50 characters.</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <label className={labelClass}>Strongest section <span className="text-orange-600">*</span></label>
            <div className="flex gap-2">
              {['VARC', 'DILR', 'QA'].map((s) => (
                <button
                  key={s}
                  onClick={() => setField('strongest_section', s)}
                  className={cn('flex-1', pillClass(fields.strongest_section === s))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Student profiles you&apos;ve helped</label>
            <div className="flex flex-col gap-2">
              {STUDENT_TYPE_OPTIONS.map((type) => {
                const checked = fields.student_types_helped.includes(type);
                return (
                  <label
                    key={type}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all',
                      checked
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudentType(type)}
                      className="accent-orange-600 w-4 h-4"
                    />
                    <span className={cn('text-sm font-medium', checked ? 'text-orange-700' : 'text-stone-700')}>
                      {type}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <div>
            <label className={labelClass}>How do you work with students? <span className="text-orange-600">*</span></label>
            <input
              type="text"
              placeholder={'e.g. "Weekly 30-min calls, daily async feedback on logs, brutal honesty on mock debriefs."'}
              value={fields.how_i_work}
              onChange={(e) => setField('how_i_work', e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
            <p className="text-xs text-stone-400 uppercase tracking-wider font-semibold">Profile preview</p>
            <p className="text-sm font-bold text-stone-900">{journeyPreview()}</p>
            {fields.iim_converted && (
              <p className="text-sm text-stone-600">{fields.iim_converted}{fields.cat_year ? `, CAT ${fields.cat_year}` : ''}{fields.current_company ? ` · ${fields.current_company}` : ''}</p>
            )}
            {fields.strongest_section && (
              <p className="text-sm text-stone-600">Strongest: {fields.strongest_section}</p>
            )}
            {fields.how_i_work && (
              <p className="text-sm text-stone-500 italic">&ldquo;{fields.how_i_work}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <button
            onClick={handleBack}
            disabled={saving}
            className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Back
          </button>
        )}
        {step < 4 ? (
          <button
            onClick={handleNext}
            disabled={!stepValid()}
            className={cn(
              'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
              stepValid() ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            )}
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={!stepValid() || saving}
            className={cn(
              'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
              stepValid() && !saving ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            )}
          >
            {saving ? 'Saving…' : 'Complete setup'}
          </button>
        )}
      </div>
    </div>
  );
}
