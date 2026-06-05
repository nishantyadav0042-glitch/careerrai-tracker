'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, BookOpen, Target, Heart, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SliderInput } from '@/components/ui/slider-input';
import { ToggleInput } from '@/components/ui/toggle-input';
import { TopicChip } from '@/components/ui/topic-chip';
import { getTodayIST, formatDateLong, cn } from '@/lib/utils';

const TOPICS = ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'];

const DEFAULT_STUDY = { duration: 4, topicsCovered: [] as string[], qualityFocus: 3, difficulty: 3 };
const DEFAULT_PERF = { mockTaken: false, mockName: '', quantScore: 0, verbalScore: 0, logicScore: 0, totalAccuracy: 0 };
const DEFAULT_MOOD = { confidence: 3, stress: 3, sleepQuality: 3, nutritionExercise: false, overallEnergy: 3, notes: '' };

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  const [study, setStudy] = useState(DEFAULT_STUDY);
  const [perf, setPerf] = useState(DEFAULT_PERF);
  const [mood, setMood] = useState(DEFAULT_MOOD);
  const [openSection, setOpenSection] = useState<'study' | 'perf' | 'mood'>('study');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('student_id', user.id)
        .eq('report_date', today)
        .single();
      if (data) {
        setExistingId(data.id);
        setStudy({ duration: data.study_duration, topicsCovered: data.topics_covered ?? [], qualityFocus: data.quality_focus, difficulty: data.difficulty });
        setPerf({ mockTaken: data.mock_taken, mockName: data.mock_name ?? '', quantScore: data.quant_score ?? 0, verbalScore: data.verbal_score ?? 0, logicScore: data.logic_score ?? 0, totalAccuracy: data.total_accuracy ?? 0 });
        setMood({ confidence: data.confidence, stress: data.stress, sleepQuality: data.sleep_quality, nutritionExercise: data.nutrition_exercise, overallEnergy: data.overall_energy, notes: data.notes ?? '' });
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTopic = (t: string) =>
    setStudy((p) => ({ ...p, topicsCovered: p.topicsCovered.includes(t) ? p.topicsCovered.filter((x) => x !== t) : [...p.topicsCovered, t] }));

  async function handleSubmit() {
    if (!userId) return;
    setSaving(true);
    const payload = {
      student_id: userId,
      report_date: today,
      study_duration: study.duration,
      topics_covered: study.topicsCovered,
      quality_focus: study.qualityFocus,
      difficulty: study.difficulty,
      mock_taken: perf.mockTaken,
      mock_name: perf.mockTaken ? perf.mockName : null,
      quant_score: perf.mockTaken ? perf.quantScore : null,
      verbal_score: perf.mockTaken ? perf.verbalScore : null,
      logic_score: perf.mockTaken ? perf.logicScore : null,
      total_accuracy: perf.mockTaken ? perf.totalAccuracy : null,
      confidence: mood.confidence,
      stress: mood.stress,
      sleep_quality: mood.sleepQuality,
      nutrition_exercise: mood.nutritionExercise,
      overall_energy: mood.overallEnergy,
      notes: mood.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      await supabase.from('daily_reports').update(payload).eq('id', existingId);
    } else {
      await supabase.from('daily_reports').insert(payload);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); router.push('/student/home'); }, 1500);
  }

  const Section = ({ id, icon: Icon, title, subtitle, children }: { id: typeof openSection; icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode }) => {
    const isOpen = openSection === id;
    const tileColor = id === 'study' ? 'bg-stone-900' : id === 'perf' ? 'bg-orange-600' : 'bg-teal-700';
    return (
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <button type="button" onClick={() => setOpenSection(id)} className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', tileColor)}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-stone-900">{title}</div>
              <div className="text-xs text-stone-500">{subtitle}</div>
            </div>
          </div>
          <ChevronDown className={cn('w-5 h-5 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
        </button>
        {isOpen && <div className="border-t border-stone-200 p-5 space-y-5">{children}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-32">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Daily Report</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>
          {existingId ? "Edit today's entry" : 'How was today?'}
        </h1>
        <p className="text-sm text-stone-600 mt-1">{formatDateLong(today)}</p>
      </div>

      <Section id="study" icon={BookOpen} title="Study Log" subtitle="What you worked on">
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Study duration (hours)</label>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={study.duration}
            onChange={(e) => setStudy((p) => ({ ...p, duration: Number(e.target.value) }))}
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Topics covered</label>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <TopicChip key={t} label={t} active={study.topicsCovered.includes(t)} onClick={() => toggleTopic(t)} />
            ))}
          </div>
        </div>
        <SliderInput label="Quality of focus" value={study.qualityFocus} onChange={(v) => setStudy((p) => ({ ...p, qualityFocus: v }))} leftLabel="Distracted" rightLabel="Locked in" />
        <SliderInput label="Difficulty of material" value={study.difficulty} onChange={(v) => setStudy((p) => ({ ...p, difficulty: v }))} leftLabel="Easy" rightLabel="Brutal" />
      </Section>

      <Section id="perf" icon={Target} title="Performance" subtitle="Mock tests & accuracy">
        <ToggleInput label="Did you take a mock test?" value={perf.mockTaken} onChange={(v) => setPerf((p) => ({ ...p, mockTaken: v }))} />
        {perf.mockTaken && (
          <div className="space-y-4 pl-3 border-l-2 border-orange-300">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Test name</label>
              <input type="text" value={perf.mockName} onChange={(e) => setPerf((p) => ({ ...p, mockName: e.target.value }))} placeholder="e.g. CAT Mock 21" className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['quant', 'verbal', 'logic', 'accuracy'] as const).map((field) => {
                const keyMap = { quant: 'quantScore', verbal: 'verbalScore', logic: 'logicScore', accuracy: 'totalAccuracy' } as const;
                const labelMap = { quant: 'Quant', verbal: 'Verbal', logic: 'Logic Games', accuracy: 'Accuracy %' };
                const k = keyMap[field];
                return (
                  <div key={field}>
                    <label className="block text-sm font-medium text-stone-800 mb-1.5">{labelMap[field]}</label>
                    <input type="number" value={perf[k]} onChange={(e) => setPerf((p) => ({ ...p, [k]: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <Section id="mood" icon={Heart} title="Mood & Energy" subtitle="How you're holding up">
        <SliderInput label="Confidence" value={mood.confidence} onChange={(v) => setMood((p) => ({ ...p, confidence: v }))} leftLabel="Shaky" rightLabel="Solid" color="teal" />
        <SliderInput label="Stress" value={mood.stress} onChange={(v) => setMood((p) => ({ ...p, stress: v }))} leftLabel="Calm" rightLabel="Frazzled" color="rose" />
        <SliderInput label="Sleep quality" value={mood.sleepQuality} onChange={(v) => setMood((p) => ({ ...p, sleepQuality: v }))} leftLabel="Poor" rightLabel="Great" color="teal" />
        <ToggleInput label="Ate well + moved your body?" value={mood.nutritionExercise} onChange={(v) => setMood((p) => ({ ...p, nutritionExercise: v }))} />
        <SliderInput label="Overall energy" value={mood.overallEnergy} onChange={(v) => setMood((p) => ({ ...p, overallEnergy: v }))} leftLabel="Drained" rightLabel="Charged" color="orange" />
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Notes (optional)</label>
          <textarea value={mood.notes} onChange={(e) => setMood((p) => ({ ...p, notes: e.target.value }))} placeholder="What's on your mind?" rows={3} className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none" />
        </div>
      </Section>

      {/* Sticky submit */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || saved}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saved ? <><CheckCircle2 className="w-4 h-4" />Saved!</> : saving ? 'Saving…' : <><Send className="w-4 h-4" />{existingId ? "Update today's report" : "Submit today's report"}</>}
        </button>
      </div>
    </div>
  );
}
