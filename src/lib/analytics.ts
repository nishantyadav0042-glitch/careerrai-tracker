import type { DailyReport, AnalyticsSummary } from '@/types';

type Trend = 'up' | 'down' | 'stable';

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function trend(values: number[]): Trend {
  if (values.length < 2) return 'stable';
  const recent = avg(values.slice(-3));
  const earlier = avg(values.slice(0, Math.max(1, values.length - 3)));
  if (recent > earlier + 0.3) return 'up';
  if (recent < earlier - 0.3) return 'down';
  return 'stable';
}

export function computeSummary(reports: DailyReport[], period: number): AnalyticsSummary {
  const mockReports = reports.filter((r) => r.mock_taken && r.total_accuracy != null);
  const mockScores = mockReports.map((r) => r.total_accuracy as number);

  const avgStudy = avg(reports.map((r) => r.study_duration));
  const totalStudy = reports.reduce((s, r) => s + r.study_duration, 0);
  const avgConfidence = avg(reports.map((r) => r.confidence));
  const avgStress = avg(reports.map((r) => r.stress));
  const avgSleep = avg(reports.map((r) => r.sleep_quality));
  const avgEnergy = avg(reports.map((r) => r.overall_energy));
  const avgMockScore = avg(mockScores);

  const consistency = (reports.length / period) * 25;
  const studyScore = Math.min(25, (avgStudy / 6) * 25);
  const mockScore = mockScores.length ? Math.min(25, (avgMockScore / 100) * 25) : 12;
  const moodScore = Math.min(25, ((avgConfidence + (6 - avgStress) + avgEnergy) / 15) * 25);
  const overallScore = Math.round(consistency + studyScore + mockScore + moodScore);

  let band: AnalyticsSummary['band'];
  if (overallScore >= 70) band = 'On track';
  else if (overallScore >= 50) band = 'Needs nudging';
  else band = 'Needs intervention';

  const redFlags: string[] = [];
  if (avgStress >= 4) redFlags.push(`Avg stress ${avgStress.toFixed(1)}/5 — burnout risk`);
  if (avgStudy < 3) redFlags.push('Avg study below 3 hrs/day — momentum dropping');
  if (avgSleep < 3) redFlags.push('Sleep quality below 3/5 — affects retention');
  if (reports.length < 4 && period === 7) redFlags.push('Fewer than 4 reports this week — going quiet');
  if (mockScores.length >= 2 && mockScores[mockScores.length - 1] < mockScores[0]) {
    redFlags.push('Mock accuracy declining');
  }

  return {
    avgStudy,
    totalStudy,
    totalMocks: mockReports.length,
    avgMockScore,
    avgConfidence,
    avgStress,
    avgSleep,
    avgEnergy,
    daysSubmitted: reports.length,
    period,
    studyTrend: trend(reports.map((r) => r.study_duration)),
    confidenceTrend: trend(reports.map((r) => r.confidence)),
    stressTrend: trend(reports.map((r) => r.stress)),
    overallScore,
    band,
    redFlags,
  };
}

export function computeStreak(reports: DailyReport[]): number {
  if (!reports.length) return 0;
  const sorted = [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let streak = 0;
  let cursor = new Date(today + 'T00:00:00');
  for (const r of sorted) {
    const rDate = new Date(r.report_date + 'T00:00:00');
    const diff = Math.round((cursor.getTime() - rDate.getTime()) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      cursor = rDate;
    } else {
      break;
    }
  }
  return streak;
}

export function getHeatmapData(reports: DailyReport[], days = 14) {
  const byDate = new Map(reports.map(r => [r.report_date, r]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const found = byDate.get(ds);
    result.push({ date: ds, hours: found?.study_duration ?? 0, submitted: !!found });
  }
  return result;
}
