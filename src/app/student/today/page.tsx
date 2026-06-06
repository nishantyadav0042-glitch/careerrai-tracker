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

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  // Simple state management
  const [userId, setUserId] = useState<string>('');
  const [existingId, setExistingId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<'study' | 'perf' | 'mood'>('study');

  // Study Section
  const [studyDuration, setStudyDuration] = useState('0');
  const [topicsCovered, setTopicsCovered] = useState<string[]>([]);
  const [qualityFocus, setQualityFocus] = useState(3);
  const [difficulty, setDifficulty] = useState(3);

  // Performance Section
  const [mockTaken, setMockTaken] = useState(false);
  const [mockName, setMockName] = useState('');
  const [quantScore, setQuantScore] = useState('0');
  const [verbalScore, setVerbalScore] = useState('0');
  const [logicScore, setLogicScore] = useState('0');
  const [totalAccuracy, setTotalAccuracy] = useState('0');

  // Mood Section
  const [confidence, setConfidence] = useState(3);
  const [stress, setStress] = useState(3);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [nutritionExercise, setNutritionExercise] = useState(false);
  const [overallEnergy, setOverallEnergy] = useState(3);
  const [notes, setNotes] = useState('');

  // Load existing data on mount
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
        setStudyDuration(String(data.study_duration || 0));
        setTopicsCovered(data.topics_covered || []);
        setQualityFocus(data.quality_focus || 3);
        setDifficulty(data.difficulty || 3);
        setMockTaken(data.mock_taken || false);
        setMockName(data.mock_name || '');
        setQuantScore(String(data.quant_score || 0));
        setVerbalScore(String(data.verbal_score || 0));
        setLogicScore(String(data.logic_score || 0));
        setTotalAccuracy(String(data.total_accuracy || 0));
        setConfidence(data.confidence || 3);
        setStress(data.stress || 3);
        setSleepQuality(data.sleep_quality || 3);
        setNutritionExercise(data.nutrition_exercise || false);
        setOverallEnergy(data.overall_energy || 3);
        setNotes(data.notes || '');
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTopic = (topic: string) => {
    setTopicsCovered(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  async function handleSubmit() {
    if (!userId) return;
    setSaving(true);

    const payload = {
      student_id: userId,
      report_date: today,
      study_duration: parseFloat(studyDuration) || 0,
      topics_covered: topicsCovered,
      quality_focus: qualityFocus,
      difficulty: difficulty,
      mock_taken: mockTaken,
      mock_name: mockTaken ? mockName : null,
      quant_score: mockTaken ? (parseFloat(quantScore) || null) : null,
      verbal_score: mockTaken ? (parseFloat(verbalScore) || null) : null,
      logic_score: mockTaken ? (parseFloat(logicScore) || null) : null,
      total_accuracy: mockTaken ? (parseFloat(totalAccuracy) || null) : null,
      confidence: confidence,
      stress: stress,
      sleep_quality: sleepQuality,
      nutrition_exercise: nutritionExercise,
      overall_energy: overallEnergy,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (existingId) {
        await supabase.from('daily_reports').update(payload).eq('id', existingId);
      } else {
        await supabase.from('daily_reports').insert(payload);
      }

      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        router.push('/student/home');
      }, 1500);
    } catch (error) {
      console.error('Error saving:', error);
      setSaving(false);
    }
  }

  const Section = ({ id, icon: Icon, title, subtitle, children }: any) => {
    const isOpen = openSection === id;
    const tileColor = id === 'study' ? 'bg-stone-900' : id === 'perf' ? 'bg-orange-600' : 'bg-teal-700';
    return (
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpenSection(id)}
          className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors"
        >
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

      {/* STUDY SECTION */}
      <Section id="study" icon={BookOpen} title="Study Log" subtitle="What you worked on">
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Study duration (hours)</label>
          <input
            type="text"
            inputMode="decimal"
            value={studyDuration}
            onChange={(e) => setStudyDuration(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-800 mb-2">Topics covered</label>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <TopicChip
                key={t}
                label={t}
                active={topicsCovered.includes(t)}
                onClick={() => toggleTopic(t)}
              />
            ))}
          </div>
        </div>

        <SliderInput
          label="Quality of focus"
          value={qualityFocus}
          onChange={setQualityFocus}
          leftLabel="Distracted"
          rightLabel="Locked in"
        />
        <SliderInput
          label="Difficulty of material"
          value={difficulty}
          onChange={setDifficulty}
          leftLabel="Easy"
          rightLabel="Brutal"
        />
      </Section>

      {/* PERFORMANCE SECTION - COMPLETELY REWRITTEN */}
      <Section id="perf" icon={Target} title="Performance" subtitle="Mock tests & accuracy">
        <ToggleInput
          label="Did you take a mock test?"
          value={mockTaken}
          onChange={setMockTaken}
        />

        {mockTaken && (
          <div className="space-y-4 pl-3 border-l-2 border-orange-300">
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">Test name</label>
              <input
                type="text"
                value={mockName}
                onChange={(e) => setMockName(e.target.value)}
                placeholder="e.g. CAT Mock 21"
                className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">Quant</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={quantScore}
                  onChange={(e) => setQuantScore(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">Verbal</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={verbalScore}
                  onChange={(e) => setVerbalScore(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">Logic Games</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={logicScore}
                  onChange={(e) => setLogicScore(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-800 mb-1.5">Accuracy %</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totalAccuracy}
                  onChange={(e) => setTotalAccuracy(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900"
                />
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* MOOD SECTION */}
      <Section id="mood" icon={Heart} title="Mood & Energy" subtitle="How you're holding up">
        <SliderInput
          label="Confidence"
          value={confidence}
          onChange={setConfidence}
          leftLabel="Shaky"
          rightLabel="Solid"
          color="teal"
        />
        <SliderInput
          label="Stress"
          value={stress}
          onChange={setStress}
          leftLabel="Calm"
          rightLabel="Frazzled"
          color="rose"
        />
        <SliderInput
          label="Sleep quality"
          value={sleepQuality}
          onChange={setSleepQuality}
          leftLabel="Poor"
          rightLabel="Great"
          color="teal"
        />
        <ToggleInput
          label="Ate well + moved your body?"
          value={nutritionExercise}
          onChange={setNutritionExercise}
        />
        <SliderInput
          label="Overall energy"
          value={overallEnergy}
          onChange={setOverallEnergy}
          leftLabel="Drained"
          rightLabel="Charged"
          color="orange"
        />
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 resize-none"
          />
        </div>
      </Section>

      {/* Sticky submit button */}
      <div className="fixed bottom-20 left-0 right-0 px-4 z-30 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || saved}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Saved!
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            <>
              <Send className="w-4 h-4" />
              {existingId ? "Update today's report" : "Submit today's report"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
