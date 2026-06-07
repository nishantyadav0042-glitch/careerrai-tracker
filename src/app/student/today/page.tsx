'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getTodayIST, formatDateLong } from '@/lib/utils';

const TOPICS = ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'];

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  const [userId, setUserId] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // All form fields - simple string/number state
  const [studyDuration, setStudyDuration] = useState('');
  const [topicsCovered, setTopicsCovered] = useState<string[]>([]);
  const [qualityFocus, setQualityFocus] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [mockTaken, setMockTaken] = useState(false);
  const [mockName, setMockName] = useState('');
  const [quantScore, setQuantScore] = useState('');
  const [verbalScore, setVerbalScore] = useState('');
  const [logicScore, setLogicScore] = useState('');
  const [totalAccuracy, setTotalAccuracy] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [stress, setStress] = useState(3);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [nutritionExercise, setNutritionExercise] = useState(false);
  const [overallEnergy, setOverallEnergy] = useState(3);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        console.log('Auth user:', user?.id);
        if (!user) {
          console.error('No authenticated user found');
          return;
        }
        setUserId(user.id);
      } catch (err) {
        console.error('Error getting user:', err);
      }
    }
    load();
  }, [supabase]);

  const toggleTopic = (topic: string) => {
    setTopicsCovered(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const handleSubmit = async () => {
    console.log('=== FORM SUBMISSION START ===');
    console.log('userId:', userId);
    console.log('today:', today);

    if (!userId) {
      console.error('CRITICAL: No userId found!');
      alert('ERROR: Not authenticated. Please refresh and try again.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        student_id: userId,
        report_date: today,
        study_duration: studyDuration ? parseFloat(studyDuration) : 0,
        topics_covered: topicsCovered || [],
        quality_focus: qualityFocus,
        difficulty: difficulty,
        mock_taken: mockTaken,
        mock_name: mockTaken && mockName ? mockName : null,
        quant_score: mockTaken && quantScore ? parseFloat(quantScore) : null,
        verbal_score: mockTaken && verbalScore ? parseFloat(verbalScore) : null,
        logic_score: mockTaken && logicScore ? parseFloat(logicScore) : null,
        total_accuracy: mockTaken && totalAccuracy ? parseFloat(totalAccuracy) : null,
        confidence: confidence,
        stress: stress,
        sleep_quality: sleepQuality,
        nutrition_exercise: nutritionExercise,
        overall_energy: overallEnergy,
        notes: notes || null,
      };

      console.log('Payload:', JSON.stringify(payload, null, 2));

      const { data, error } = await supabase.from('daily_reports').insert([payload]).select();

      console.log('Response data:', data);
      console.log('Response error:', error);

      if (error) {
        console.error('❌ Database error:', error.message, error.code, error.details);
        setSaving(false);
        const errorMsg = error.details || error.message || 'Unknown database error';
        alert('Failed to save report:\n\n' + errorMsg + '\n\nCode: ' + error.code);
        return;
      }

      console.log('✅ Insert successful, data:', data);
      setSaving(false);
      setSaved(true);
      console.log('Redirecting to home in 1.5 seconds...');
      setTimeout(() => router.push('/student/home'), 1500);
    } catch (error) {
      console.error('❌ EXCEPTION:', error);
      setSaving(false);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert('Exception submitting report:\n\n' + message);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', paddingBottom: '120px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>How was today?</h1>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '30px' }}>{formatDateLong(today)}</p>

      {/* STUDY LOG */}
      <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>📚 Study Log</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Study duration (hours)</label>
          <input
            type="text"
            value={studyDuration}
            onChange={(e) => setStudyDuration(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Topics covered</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                style={{
                  padding: '8px 12px',
                  border: topicsCovered.includes(t) ? '2px solid #ff6b35' : '1px solid #ccc',
                  backgroundColor: topicsCovered.includes(t) ? '#ff6b35' : 'white',
                  color: topicsCovered.includes(t) ? 'white' : 'black',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Quality of focus: {qualityFocus}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={qualityFocus}
            onChange={(e) => setQualityFocus(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Difficulty: {difficulty}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* PERFORMANCE */}
      <div style={{ marginBottom: '30px', border: '2px solid #ff6b35', padding: '15px', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>🎯 Performance</h2>

        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>Did you take a mock test?</label>
          <input
            type="checkbox"
            checked={mockTaken}
            onChange={(e) => setMockTaken(e.target.checked)}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
        </div>

        {mockTaken && (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Test name</label>
              <input
                type="text"
                value={mockName}
                onChange={(e) => setMockName(e.target.value)}
                placeholder="e.g. CAT Mock 21"
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Quant</label>
                <input
                  type="text"
                  value={quantScore}
                  onChange={(e) => setQuantScore(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Verbal</label>
                <input
                  type="text"
                  value={verbalScore}
                  onChange={(e) => setVerbalScore(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Logic Games</label>
                <input
                  type="text"
                  value={logicScore}
                  onChange={(e) => setLogicScore(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Accuracy %</label>
                <input
                  type="text"
                  value={totalAccuracy}
                  onChange={(e) => setTotalAccuracy(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* MOOD */}
      <div style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>💭 Mood & Energy</h2>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Confidence: {confidence}/5</label>
          <input type="range" min="1" max="5" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Stress: {stress}/5</label>
          <input type="range" min="1" max="5" value={stress} onChange={(e) => setStress(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Sleep quality: {sleepQuality}/5</label>
          <input type="range" min="1" max="5" value={sleepQuality} onChange={(e) => setSleepQuality(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>Ate well + moved body?</label>
          <input
            type="checkbox"
            checked={nutritionExercise}
            onChange={(e) => setNutritionExercise(e.target.checked)}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Overall energy: {overallEnergy}/5</label>
          <input type="range" min="1" max="5" value={overallEnergy} onChange={(e) => setOverallEnergy(Number(e.target.value))} style={{ width: '100%' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '5px' }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box', minHeight: '80px', fontFamily: 'Arial' }}
          />
        </div>
      </div>

      {/* SUBMIT BUTTON - positioned above bottom nav */}
      <div style={{ position: 'fixed', bottom: '100px', left: '20px', right: '20px', maxWidth: '560px', margin: '0 auto' }}>
        <button
          onClick={handleSubmit}
          disabled={saving || saved}
          style={{
            width: '100%',
            padding: '15px',
            backgroundColor: saved ? '#4caf50' : '#ff6b35',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: saved ? 'default' : 'pointer',
            opacity: saving || saved ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          {saved ? <><CheckCircle2 size={20} /> Saved!</> : saving ? 'Saving...' : <><Send size={20} /> Submit Report</>}
        </button>
      </div>
    </div>
  );
}
