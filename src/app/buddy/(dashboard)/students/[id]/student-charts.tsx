'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MoodPoint { date: string; confidence: number | null; stress: number | null; sleep: number | null; energy: number | null }

export function MoodChart({ data }: { data: MoodPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
          <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: '#78716c' }} />
          <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" />
          <Line type="monotone" dataKey="confidence" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="stress" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="sleep" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="energy" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
