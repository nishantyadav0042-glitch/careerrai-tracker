'use client';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

interface StudentSummary {
  id: string;
  name: string;
  avgStudy: number;
  avgConfidence: number;
  daysSubmitted: number;
}

export default function BuddyTrendsCharts({
  chartData,
  summaries,
  colors,
}: {
  chartData: Record<string, string | number | null>[];
  summaries: StudentSummary[];
  colors: string[];
}) {
  if (summaries.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-stone-600">No students assigned yet.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-5">
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Daily study hours · last 7 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#78716c' }} />
              <YAxis tick={{ fontSize: 10, fill: '#78716c' }} />
              <Tooltip contentStyle={{ background: '#1c1917', border: 'none', borderRadius: 8, color: 'white', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {summaries.map((s, i) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.name.split(' ')[0]}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">Quick comparison</h2>
        <div className="space-y-3">
          {summaries.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{s.name}</div>
                  <div className="text-xs text-stone-500">{s.daysSubmitted}/7 days</div>
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Study</div>
                  <div className="font-mono font-bold text-stone-900 text-sm">{s.avgStudy.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Conf</div>
                  <div className="font-mono font-bold text-stone-900 text-sm">{s.avgConfidence.toFixed(1)}/5</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
