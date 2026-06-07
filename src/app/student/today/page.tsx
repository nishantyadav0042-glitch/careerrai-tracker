'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTodayIST, formatDateLong } from '@/lib/utils';
import { updateStreakAfterLog } from '@/lib/streak-utils';

const TOPICS = ['Quant', 'Verbal', 'Logic Games', 'Reading Comprehension', 'Mock Test', 'Revision'];

interface DebugLog {
  timestamp: string;
  message: string;
  data?: unknown;
}

export default function TodayPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  // Authentication
  const [userId, setUserId] = useState<string>('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Form state
  const [studyDuration, setStudyDuration] = useState('1');
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

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Add debug log
  const addLog = (message: string, data?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`, data);
    setDebugLogs((prev) => [
      ...prev,
      { timestamp, message, data },
    ].slice(-20)); // Keep last 20 logs
  };

  // Get user on load
  useEffect(() => {
    const getUser = async () => {
      try {
        addLog('Checking authentication...');
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          addLog('Auth error', error.message);
          setAuthError('Failed to check authentication');
          return;
        }

        if (!user) {
          addLog('No user found, redirecting to login');
          setAuthError('Not authenticated');
          router.push('/login');
          return;
        }

        addLog('User authenticated', { id: user.id, email: user.email });
        setUserId(user.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        addLog('Exception in getUser', message);
        setAuthError(message);
      } finally {
        setAuthLoading(false);
      }
    };

    getUser();
  }, []);

  const toggleTopic = (topic: string) => {
    setTopicsCovered((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleSubmit = async () => {
    addLog('Submit button clicked');

    // Validate authentication
    if (!userId) {
      const msg = 'User not authenticated. Please log in first.';
      addLog(msg);
      setError(msg);
      return;
    }

    setSaving(true);
    setError('');
    addLog('Starting submission...', { userId, today });

    try {
      // Parse numeric values
      const studyDurationNum = studyDuration
        ? parseFloat(studyDuration)
        : 0;

      if (isNaN(studyDurationNum)) {
        throw new Error('Study duration must be a valid number');
      }

      const quantScoreNum = quantScore ? parseFloat(quantScore) : null;
      const verbalScoreNum = verbalScore ? parseFloat(verbalScore) : null;
      const logicScoreNum = logicScore ? parseFloat(logicScore) : null;
      const totalAccuracyNum = totalAccuracy ? parseFloat(totalAccuracy) : null;

      if (
        (quantScore && quantScoreNum !== null && isNaN(quantScoreNum)) ||
        (verbalScore && verbalScoreNum !== null && isNaN(verbalScoreNum)) ||
        (logicScore && logicScoreNum !== null && isNaN(logicScoreNum)) ||
        (totalAccuracy && totalAccuracyNum !== null && isNaN(totalAccuracyNum))
      ) {
        throw new Error('All score fields must be valid numbers');
      }

      // Build the insert payload
      const payload = {
        student_id: userId,
        report_date: today,
        study_duration: studyDurationNum,
        topics_covered: topicsCovered.length > 0 ? topicsCovered : [],
        quality_focus: qualityFocus || 3,
        difficulty: difficulty || 3,
        mock_taken: mockTaken === true,
        mock_name: mockTaken && mockName ? mockName : null,
        quant_score: mockTaken && quantScoreNum !== null ? quantScoreNum : null,
        verbal_score: mockTaken && verbalScoreNum !== null ? verbalScoreNum : null,
        logic_score: mockTaken && logicScoreNum !== null ? logicScoreNum : null,
        total_accuracy: mockTaken && totalAccuracyNum !== null ? totalAccuracyNum : null,
        confidence: confidence || 3,
        stress: stress || 3,
        sleep_quality: sleepQuality || 3,
        nutrition_exercise: nutritionExercise === true,
        overall_energy: overallEnergy || 3,
        notes: notes ? notes.trim() : null,
      };

      addLog('Payload prepared', payload);

      // Make the upsert call
      const { data, error: dbError } = await supabase
        .from('daily_reports')
        .upsert(payload, { onConflict: 'student_id,report_date' })
        .select();

      addLog('Database response', { data, error: dbError?.message });

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error('Failed to save report - no data returned');
      }

      addLog('Success! Report saved', data[0]);

      // Update streak after successful submission
      try {
        addLog('Updating streak...');
        const streakResult = await updateStreakAfterLog(userId);
        addLog('Streak updated', streakResult);
      } catch (streakError) {
        addLog('Warning: Failed to update streak', streakError instanceof Error ? streakError.message : 'Unknown error');
        // Don't fail the whole submission if streak update fails
      }

      setSaving(false);
      setSaved(true);
      setError('');

      // Redirect after 2 seconds
      setTimeout(() => {
        addLog('Redirecting to home...');
        router.push('/student/home');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      addLog('Submission failed', message);
      setSaving(false);
      setError(message);
    }
  };

  if (authLoading) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
        <h1>Loading...</h1>
        <p>Checking your authentication...</p>
      </div>
    );
  }

  if (authError && !userId) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ color: 'red' }}>Authentication Error</h1>
        <p>{authError}</p>
        <button
          onClick={() => router.push('/login')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ff6b35',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', paddingBottom: '140px' }}>
      <h1>How was today?</h1>
      <p>{formatDateLong(today)}</p>

      {/* Error display */}
      {error && (
        <div
          style={{
            color: '#c41e3a',
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#ffe0e0',
            borderRadius: '4px',
            border: '1px solid #ff6b6b',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Success message */}
      {saved && (
        <div
          style={{
            color: '#0b7f36',
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#e0ffe0',
            borderRadius: '4px',
            border: '1px solid #4caf50',
          }}
        >
          ✓ Report saved successfully!
        </div>
      )}

      {/* STUDY LOG */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>📚 Study Log</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Study duration (hours): <span style={{ color: '#666' }}>{studyDuration || '0'}</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={studyDuration}
            onChange={(e) => setStudyDuration(e.target.value)}
            placeholder="Enter hours (e.g., 3.5)"
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '5px',
              boxSizing: 'border-box',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Topics covered</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '5px' }}>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                type="button"
                style={{
                  padding: '8px 12px',
                  backgroundColor: topicsCovered.includes(t) ? '#ff6b35' : '#fff',
                  color: topicsCovered.includes(t) ? '#fff' : '#000',
                  border: topicsCovered.includes(t) ? '2px solid #ff6b35' : '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: topicsCovered.includes(t) ? 'bold' : 'normal',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Quality of focus: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{qualityFocus}/5</span>
          </label>
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Difficulty: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{difficulty}/5</span>
          </label>
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
            id="mockTaken"
            checked={mockTaken}
            onChange={(e) => setMockTaken(e.target.checked)}
            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
          />
          <label htmlFor="mockTaken" style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            Did you take a mock test?
          </label>
        </div>

        {mockTaken && (
          <>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Test name</label>
              <input
                type="text"
                value={mockName}
                onChange={(e) => setMockName(e.target.value)}
                placeholder="e.g., CAT Mock 21"
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '5px',
                  boxSizing: 'border-box',
                  fontSize: '16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Quant</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantScore}
                  onChange={(e) => setQuantScore(e.target.value)}
                  placeholder="0-100"
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Verbal</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={verbalScore}
                  onChange={(e) => setVerbalScore(e.target.value)}
                  placeholder="0-100"
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Logic Games</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={logicScore}
                  onChange={(e) => setLogicScore(e.target.value)}
                  placeholder="0-100"
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Accuracy %</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalAccuracy}
                  onChange={(e) => setTotalAccuracy(e.target.value)}
                  placeholder="0-100"
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginTop: '5px',
                    boxSizing: 'border-box',
                    fontSize: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Confidence: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{confidence}/5</span>
          </label>
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Stress: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{stress}/5</span>
          </label>
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
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Sleep quality: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{sleepQuality}/5</span>
          </label>
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
            id="nutrition"
            checked={nutritionExercise}
            onChange={(e) => setNutritionExercise(e.target.checked)}
            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
          />
          <label htmlFor="nutrition" style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            Ate well + moved body?
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Overall energy: <span style={{ fontSize: '18px', color: '#ff6b35' }}>{overallEnergy}/5</span>
          </label>
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
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            style={{
              width: '100%',
              padding: '10px',
              marginTop: '5px',
              boxSizing: 'border-box',
              minHeight: '80px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>
      </div>

      {/* DEBUG PANEL */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <button
          onClick={() => setShowDebug(!showDebug)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#888',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {showDebug ? '▼ Hide' : '▶ Show'} Debug Logs
        </button>

        {showDebug && (
          <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
            {debugLogs.length === 0 ? (
              <div style={{ color: '#666' }}>No logs yet</div>
            ) : (
              debugLogs.map((log, i) => {
                const dataStr = log.data ? JSON.stringify(log.data, null, 2) : '';
                return (
                  <div key={i} style={{ padding: '4px', borderBottom: '1px solid #ddd', color: '#333' }}>
                    <span style={{ color: '#666' }}>[{log.timestamp}]</span> {log.message}
                    {dataStr && <pre style={{ margin: '4px 0', background: '#eee', padding: '4px', borderRadius: '2px' }}>{dataStr}</pre>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* SUBMIT BUTTON - Fixed position */}
      <div
        style={{
          position: 'fixed',
          bottom: '100px',
          left: '20px',
          right: '20px',
          maxWidth: '560px',
          margin: '0 auto',
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={saving || saved || !userId}
          type="button"
          style={{
            width: '100%',
            padding: '15px',
            backgroundColor: saved ? '#4caf50' : saving ? '#ff9500' : '#ff6b35',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: saving || saved || !userId ? 'not-allowed' : 'pointer',
            opacity: saving || saved || !userId ? 0.6 : 1,
            transition: 'all 0.3s ease',
          }}
        >
          {!userId
            ? '⚠️ Not logged in'
            : saved
              ? '✓ Saved! Redirecting...'
              : saving
                ? '⏳ Saving...'
                : "📝 Submit today's report"}
        </button>
      </div>
    </div>
  );
}
