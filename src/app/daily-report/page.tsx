'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTodayIST, formatDateLong } from '@/lib/utils';

export default function DailyReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const today = getTodayIST();

  const [userId, setUserId] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [studyDuration, setStudyDuration] = useState('');
  const [mockName, setMockName] = useState('');
  const [quantScore, setQuantScore] = useState('');
  const [verbalScore, setVerbalScore] = useState('');
  const [logicScore, setLogicScore] = useState('');
  const [accuracy, setAccuracy] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  const handleSubmit = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      await supabase.from('daily_reports').insert({
        student_id: userId,
        report_date: today,
        study_duration: studyDuration ? parseFloat(studyDuration) : 0,
        mock_name: mockName || null,
        quant_score: quantScore ? parseFloat(quantScore) : null,
        verbal_score: verbalScore ? parseFloat(verbalScore) : null,
        logic_score: logicScore ? parseFloat(logicScore) : null,
        total_accuracy: accuracy ? parseFloat(accuracy) : null,
        updated_at: new Date().toISOString(),
      });

      setSaved(true);
      setTimeout(() => router.push('/student/home'), 1500);
    } catch (error) {
      console.error('Error:', error);
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'Arial' }}>
      <h1>Daily Report</h1>
      <p>{formatDateLong(today)}</p>

      <div style={{ marginBottom: '20px' }}>
        <label>Study Duration (hours):</label>
        <input
          type="text"
          value={studyDuration}
          onChange={(e) => setStudyDuration(e.target.value)}
          placeholder="e.g., 3.5"
          style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>Mock Test Name:</label>
        <input
          type="text"
          value={mockName}
          onChange={(e) => setMockName(e.target.value)}
          placeholder="e.g., CAT Mock 21"
          style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label>Quant Score:</label>
          <input
            type="text"
            value={quantScore}
            onChange={(e) => setQuantScore(e.target.value)}
            placeholder="0-100"
            style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Verbal Score:</label>
          <input
            type="text"
            value={verbalScore}
            onChange={(e) => setVerbalScore(e.target.value)}
            placeholder="0-100"
            style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Logic Games:</label>
          <input
            type="text"
            value={logicScore}
            onChange={(e) => setLogicScore(e.target.value)}
            placeholder="0-100"
            style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>Accuracy %:</label>
          <input
            type="text"
            value={accuracy}
            onChange={(e) => setAccuracy(e.target.value)}
            placeholder="0-100"
            style={{ width: '100%', padding: '10px', marginTop: '5px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || saved}
        style={{
          width: '100%',
          padding: '15px',
          backgroundColor: saved ? '#4caf50' : '#ff6b35',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: saving || saved ? 'default' : 'pointer',
        }}
      >
        {saved ? 'Saved! ✓' : saving ? 'Saving...' : 'Submit Report'}
      </button>

      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        <h3>❓ Debug Info</h3>
        <p>Study Duration: {studyDuration}</p>
        <p>Mock Name: {mockName}</p>
        <p>Quant: {quantScore}</p>
        <p>Verbal: {verbalScore}</p>
        <p>Logic: {logicScore}</p>
        <p>Accuracy: {accuracy}</p>
      </div>
    </div>
  );
}
