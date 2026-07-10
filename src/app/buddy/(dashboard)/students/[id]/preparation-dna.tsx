import { Card } from '@/components/ui/card';
import type { Momentum, RiskLevel } from '@/lib/signal-engine';
import { getStudentPrepSnapshot } from './prep-snapshot';

// Preparation DNA — one card, features not raw logs. Everything here reads
// off Student State V1 (src/lib/signal-engine.ts): Knowledge, Consistency,
// Momentum, and Risk, each traceable to real logged behavior, plus the
// small Signal library. Reads the request-scoped snapshot shared with
// StudyPlanFeed (prep-snapshot.ts) instead of re-running the same profile
// fetch + computePrepMemory for the same student in the same render.
export async function PreparationDNA({ studentId }: { studentId: string }) {
  const snapshot = await getStudentPrepSnapshot(studentId);
  if (!snapshot) return null;
  const { prepMemory, studentState, signals } = snapshot;

  const MOMENTUM_LABEL: Record<Momentum, { label: string; color: string }> = {
    accelerating: { label: '↑ Accelerating', color: 'text-teal-600' },
    steady: { label: '→ Steady', color: 'text-stone-600' },
    slowing: { label: '↓ Slowing', color: 'text-orange-600' },
    stalled: { label: '⏸ Stalled', color: 'text-stone-400' },
  };
  const RISK_LABEL: Record<RiskLevel, { label: string; color: string }> = {
    low: { label: 'Low', color: 'text-teal-600' },
    medium: { label: 'Medium', color: 'text-orange-600' },
    high: { label: 'High', color: 'text-rose-600' },
  };

  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3">Preparation DNA</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Knowledge</p>
          <p className="text-lg font-bold text-stone-900">{studentState.knowledge}<span className="text-xs text-stone-400 font-normal">%</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Consistency</p>
          <p className="text-lg font-bold text-stone-900">{studentState.consistency}<span className="text-xs text-stone-400 font-normal">%</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Momentum</p>
          <p className={`text-sm font-bold ${MOMENTUM_LABEL[studentState.momentum].color}`}>{MOMENTUM_LABEL[studentState.momentum].label}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">Risk</p>
          <p className={`text-sm font-bold ${RISK_LABEL[studentState.risk.level].color}`}>{RISK_LABEL[studentState.risk.level].label}</p>
        </div>
      </div>

      {studentState.risk.reason && (
        <p className="text-xs text-stone-600 border-t border-stone-100 mt-3 pt-3">
          <span className="font-semibold text-stone-500">Risk reason: </span>{studentState.risk.reason}
        </p>
      )}

      <p className="text-xs text-stone-600 border-t border-stone-100 mt-3 pt-3">
        <span className="font-semibold text-stone-500">Last 30 days: </span>
        {prepMemory.last30.daysStudied} days studied · {Math.round(prepMemory.last30.minutesStudied / 6) / 10}h
        {prepMemory.last30.emergencyDays > 0 && <> · {prepMemory.last30.emergencyDays} emergency-mode days</>}
      </p>

      {signals.length > 0 && (
        <ul className="mt-3 border-t border-stone-100 pt-3 space-y-1.5">
          {signals.map((s) => (
            <li key={s.key} className="text-xs text-stone-600 flex items-start gap-1.5">
              <span className="text-stone-400 mt-0.5 shrink-0">•</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
