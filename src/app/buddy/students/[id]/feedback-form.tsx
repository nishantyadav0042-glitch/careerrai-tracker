'use client';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Send, Star, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { BuddyFeedback } from '@/types';

const NEXT_STEP_OPTIONS = [
  'Increase Quant practice', 'Work on speed', 'Reduce test anxiety',
  'Improve sleep schedule', 'Focus on DILR', 'Schedule 1:1 call',
  'Review previous mistakes', 'Push RC speed', 'Take 2 days rest',
  'Maintain current schedule',
];

const FEEDBACK_TEMPLATES: { label: string; text: string }[] = [
  {
    label: '🔥 Streak praise',
    text: 'Your consistency this week stood out — that streak is exactly how toppers build momentum. Keep the same rhythm and the scores will follow.',
  },
  {
    label: '📉 Score dip',
    text: "I saw the dip in your last mock. One bad mock is data, not a verdict — the pool gets tougher every month. Let's review your error log together and fix the 2-3 question types that cost you the most.",
  },
  {
    label: '😰 High stress',
    text: 'Your stress levels have been high lately. Remember: 2 focused hours beat 5 anxious ones. Cut tonight short, sleep well, and we reset tomorrow.',
  },
  {
    label: '👻 Missing logs',
    text: "I noticed you haven't logged in a few days. No judgment — life happens. Log even 30 minutes today so we don't lose the habit. Small steps count.",
  },
  {
    label: '🎯 Mock reminder',
    text: "You haven't taken a mock recently. At this stage one mock per week is non-negotiable — it's the only way to train exam temperament. Block 3 hours this weekend.",
  },
];

export function FeedbackForm({
  studentId,
  studentFirstName,
  onSuccess,
}: {
  studentId: string;
  studentFirstName: string;
  onSuccess: (fb: BuddyFeedback) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [rating, setRating] = useState(4);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleStep = (s: string) =>
    setNextSteps((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function submit() {
    if (!fbText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/buddy/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, feedback_text: fbText.trim(), rating, next_steps: nextSteps, period_covered: 'adhoc' }),
      });
      if (!res.ok) { setError('Failed to submit. Try again.'); return; }
      const { feedback } = await res.json();
      onSuccess(feedback as BuddyFeedback);
      setFbText(''); setRating(4); setNextSteps([]); setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-teal-700 text-white rounded-xl font-medium hover:bg-teal-800 transition-all"
      >
        <Send className="w-4 h-4" /> Write feedback
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-stone-900 mb-4">Feedback for {studentFirstName}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Your feedback</label>
          <textarea
            value={fbText}
            onChange={(e) => setFbText(e.target.value)}
            placeholder="Be specific. Reference their data. e.g., 'Mock scores are climbing but stress is high — let's focus on Quant speed this week.'"
            rows={4}
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Overall performance</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)}>
                <Star className={cn('w-7 h-7 transition-all', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Suggested next steps</label>
          <div className="grid grid-cols-1 gap-2">
            {NEXT_STEP_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={nextSteps.includes(s)} onChange={() => toggleStep(s)} className="w-4 h-4 rounded accent-teal-700" />
                <span className="text-sm text-stone-800">{s}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!fbText.trim() || submitting}
            className="flex-1 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50 transition-all"
          >
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function FeedbackList({ initial, studentId, studentFirstName }: { initial: BuddyFeedback[]; studentId: string; studentFirstName: string }) {
  const supabase = createClient();
  const [feedbackList, setFeedbackList] = useState(initial);
  const [studentResponses, setStudentResponses] = useState<BuddyFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch student responses to buddy feedback
    const fetchResponses = async () => {
      try {
        const { data, error } = await supabase
          .from('buddy_feedback')
          .select('*')
          .eq('student_id', studentId)
          .eq('feedback_type', 'student_response')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setStudentResponses(data as BuddyFeedback[]);
        }
      } catch (err) {
        console.error('Error fetching student responses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResponses();
  }, [studentId, supabase]);

  function onSuccess(fb: BuddyFeedback) {
    setFeedbackList((prev) => [fb, ...prev]);
  }

  return (
    <>
      {/* Student Responses Section */}
      {studentResponses.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">📝 {studentFirstName}&apos;s responses</h2>
          <div className="space-y-2 mb-4">
            {studentResponses.map((resp) => (
              <Card key={resp.id} className="p-4 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-stone-600">Responded {new Date(resp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                {resp.voice_note_url && (
                  <div className="mb-2">
                    <VoiceNotePlayer
                      feedbackId={resp.id}
                      audioUrl={resp.voice_note_url}
                      buddyName={studentFirstName}
                      createdAt={resp.created_at}
                    />
                  </div>
                )}
                {resp.feedback_text && (
                  <p className="text-sm text-stone-800">{resp.feedback_text}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Buddy Feedback Section */}
      {feedbackList.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Your feedback</h2>
          <div className="space-y-2">
            {feedbackList.map((f) => (
              <Card key={f.id} className="p-4">
                {f.voice_note_url && (
                  <div className="mb-3">
                    <VoiceNotePlayer
                      feedbackId={f.id}
                      audioUrl={f.voice_note_url}
                      buddyName="You"
                      createdAt={f.feedback_date}
                    />
                  </div>
                )}

                {/* Date and Rating */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-stone-600">{new Date(f.feedback_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={cn('w-3 h-3', s <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
                    ))}
                  </div>
                </div>

                {/* Feedback Text */}
                {f.feedback_text && (
                  <p className="text-sm text-stone-800 mb-2">{f.feedback_text}</p>
                )}

                {/* Next Steps */}
                {f.next_steps?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {f.next_steps.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 bg-stone-100 rounded-full text-stone-600">{s}</span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
      <FeedbackFormConnected studentId={studentId} onSuccess={onSuccess} />
    </>
  );
}

function FeedbackFormConnected({ studentId, onSuccess }: { studentId: string; onSuccess: (fb: BuddyFeedback) => void }) {
  const [open, setOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [rating, setRating] = useState(4);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftUsed, setDraftUsed] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [error, setError] = useState('');

  const toggleStep = (s: string) =>
    setNextSteps((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  async function generateDraft() {
    setDraftLoading(true);
    setDraftError('');
    try {
      const res = await fetch('/api/feedback-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (res.ok && data.draft) {
        setFbText(`[AI Draft — please personalize before sending]\n\n${data.draft}`);
        setDraftUsed(true);
      } else {
        setDraftError(data.error ?? 'AI draft failed — try again or use a template below.');
      }
    } catch (e) {
      console.error('draft error', e);
      setDraftError('Could not reach AI — check your connection and try again.');
    } finally {
      setDraftLoading(false);
    }
  }

  async function submit() {
    if (!fbText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/buddy/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, feedback_text: fbText.trim(), rating, next_steps: nextSteps, period_covered: 'adhoc' }),
      });
      if (!res.ok) { setError('Failed to submit. Try again.'); return; }
      const { feedback } = await res.json();
      onSuccess(feedback as BuddyFeedback);
      setFbText(''); setRating(4); setNextSteps([]); setOpen(false); setDraftUsed(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-teal-700 text-white rounded-xl font-medium hover:bg-teal-800 transition-all">
        <Send className="w-4 h-4" /> Write feedback
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-stone-900 mb-4">Write feedback</h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-stone-700">Your feedback</label>
            <button
              type="button"
              onClick={generateDraft}
              disabled={draftLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-all disabled:opacity-50"
            >
              {draftLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {draftLoading ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {FEEDBACK_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => { setFbText(t.text); setDraftUsed(false); }}
                className="text-[11px] px-2.5 py-1 bg-stone-100 text-stone-700 rounded-full hover:bg-teal-100 hover:text-teal-800 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={fbText}
            onChange={(e) => { setFbText(e.target.value); setDraftUsed(false); }}
            placeholder="Be specific and reference their data..."
            rows={4}
            className={cn(
              'w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none resize-none transition-colors',
              draftUsed ? 'border-teal-300 bg-teal-50/40 focus:border-teal-500' : 'border-stone-300 focus:border-stone-900'
            )}
          />
          {draftUsed && (
            <p className="text-[11px] text-teal-600 mt-1">✏️ AI draft loaded — edit before sending</p>
          )}
          {draftError && (
            <p className="text-[11px] text-rose-500 mt-1">{draftError}</p>
          )}
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setRating(s)}>
              <Star className={cn('w-7 h-7', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {NEXT_STEP_OPTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={nextSteps.includes(s)} onChange={() => toggleStep(s)} className="w-4 h-4 rounded accent-teal-700" />
              <span className="text-sm text-stone-800">{s}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-stone-300 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
          <button type="button" onClick={submit} disabled={!fbText.trim() || submitting} className="flex-1 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </Card>
  );
}
