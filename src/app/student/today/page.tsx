'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTodayIST, formatDateLong } from '@/lib/utils';

const TOPICS = ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'];

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Form fields
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

  // Get user on load
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  const toggleTopic = (topic: string) => {
    setTopicsCovered(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const parseValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const handleSubmit = async () => {
    if (!userId) {
      setError('Not authenticated');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { error: insertError } = await supabase.from('daily_reports').upsert({
        student_id: userId,
        report_date: today,
        study_duration: parseValue(studyDuration) ?? 0,
        topics_covered: topicsCovered,
        quality_focus: qualityFocus || 3,
        difficulty: difficulty || 3,
        mock_taken: mockTaken,
        mock_name: mockTaken && mockName ? mockName : null,
        quant_score: mockTaken ? parseValue(quantScore) : null,
        verbal_score: mockTaken ? parseValue(verbalScore) : null,
        logic_score: mockTaken ? parseValue(logicScore) : null,
        total_accuracy: mockTaken ? parseValue(totalAccuracy) : null,
        confidence: confidence || 3,
        stress: stress || 3,
        sleep_quality: sleepQuality || 3,
        nutrition_exercise: nutritionExercise,
        overall_energy: overallEnergy || 3,
        notes: notes || null,
      });

      if (insertError) throw insertError;

      setSaving(false);
      setSaved(true);
      setTimeout(() => router.push('/student/home'), 1500);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', paddingBottom: '140px' }}>
      <h1>How was today?</h1>
      <p>{formatDateLong(today)}</p>

      {error && <div style={{ color: 'red', padding: '10px', marginBottom: '20px', backgroundColor: '#ffe0e0', borderRadius: '4px' }}>{error}</div>}
      {saved && <div style={{ color: 'green', padding: '10px', marginBottom: '20px', backgroundColor: '#e0ffe0', borderRadius: '4px' }}>✓ Saved!</div>}

      {/* STUDY LOG */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>📚 Study Log</h2>

        <div style={{ marginBottom: '15px' }}>
          <label>Study duration (hours)</label>
          <input
            type="text"
            value={studyDuration}
            onChange={(e) => setStudyDuration(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Topics covered</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '5px' }}>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: topicsCovered.includes(t) ? '#ff6b35' : '#fff',
                  color: topicsCovered.includes(t) ? '#fff' : '#000',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Quality of focus: {qualityFocus}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={qualityFocus}
            onChange={(e) => setQualityFocus(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>

        <div>
          <label>Difficulty: {difficulty}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>
      </div>

      {/* PERFORMANCE */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '2px solid #ff6b35', borderRadius: '8px' }}>
        <h2>🎯 Performance</h2>

        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="checkbox"
            checked={mockTaken}
            onChange={(e) => setMockTaken(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label style={{ cursor: 'pointer' }}>Did you take a mock test?</label>
        </div>

        {mockTaken && (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label>Test name</label>
              <input
                type="text"
                value={mockName}
                onChange={(e) => setMockName(e.target.value)}
                placeholder="e.g., CAT Mock 21"
                style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
              <div>
                <label>Quant</label>
                <input
                  type="text"
                  value={quantScore}
                  onChange={(e) => setQuantScore(e.target.value)}
                  placeholder="0-100"
                  style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
                />
              </div>
              <div>
                <label>Verbal</label>
                <input
                  type="text"
                  value={verbalScore}
                  onChange={(e) => setVerbalScore(e.target.value)}
                  placeholder="0-100"
                  style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
                />
              </div>
              <div>
                <label>Logic Games</label>
                <input
                  type="text"
                  value={logicScore}
                  onChange={(e) => setLogicScore(e.target.value)}
                  placeholder="0-100"
                  style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
                />
              </div>
              <div>
                <label>Accuracy %</label>
                <input
                  type="text"
                  value={totalAccuracy}
                  onChange={(e) => setTotalAccuracy(e.target.value)}
                  placeholder="0-100"
                  style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '16px' }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* MOOD & ENERGY */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>💭 Mood & Energy</h2>

        <div style={{ marginBottom: '15px' }}>
          <label>Confidence: {confidence}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Stress: {stress}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Sleep quality: {sleepQuality}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={sleepQuality}
            onChange={(e) => setSleepQuality(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="checkbox"
            checked={nutritionExercise}
            onChange={(e) => setNutritionExercise(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label style={{ cursor: 'pointer' }}>Ate well + moved body?</label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Overall energy: {overallEnergy}/5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={overallEnergy}
            onChange={(e) => setOverallEnergy(Number(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>

        <div>
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', minHeight: '80px', fontSize: '16px' }}
          />
        </div>
      </div>

      {/* SUBMIT BUTTON - Fixed position above nav */}
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
            cursor: saving || saved ? 'default' : 'pointer',
            opacity: saving || saved ? 0.7 : 1,
          }}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Submit today\'s report'}
        </button>
      </div>
    </div>
  );
}
