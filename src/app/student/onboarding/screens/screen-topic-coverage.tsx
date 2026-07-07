'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_GRAPH, type CoverageSectionId } from '@/lib/topics-constants';

// Student-declared states only — exam_ready (🟢) is earned through
// confidence signals and mock evidence, never self-assigned, and
// revision-due (🟠) is derived. This screen is "where are you in your
// preparation journey," not "how good are you" — journey positions are
// easier to answer honestly than ability ratings.
type DeclaredStatus = 'not_started' | 'learning' | 'practicing';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

const STATUS_OPTIONS: { value: DeclaredStatus; dot: string; label: string; active: string }[] = [
  { value: 'not_started', dot: '⚪', label: "Haven't started", active: 'bg-stone-600 border-stone-600 text-white' },
  { value: 'learning',    dot: '🟡', label: 'Learning concepts', active: 'bg-amber-500 border-amber-500 text-white' },
  { value: 'practicing',  dot: '🔵', label: 'Practicing questions', active: 'bg-blue-600 border-blue-600 text-white' },
];

// Honesty is what gets celebrated — never knowledge. A student who marks
// "Haven't started" did the Blueprint a bigger favor than one who
// flattered themselves; the copy says so, instantly, on every tap.
const HONESTY_LINES: Record<DeclaredStatus, (unit: string) => string> = {
  not_started: (u) => `Excellent — now the plan won't waste your time assuming you know ${u}. That one tap probably saved you weeks.`,
  learning: (u) => `Noted — ${u} stays in concept mode. Questions come after concepts, and your plan will respect that order.`,
  practicing: (u) => `Perfect — that's exactly why we asked. ${u} goes into your revision cycle, and revision is where percentiles are won.`,
};

// Section-completion rewards — a short win at the end of every block of
// work, phrased as what the Blueprint now KNOWS, not "section completed."
const SECTION_REWARD: Record<CoverageSectionId, string> = {
  VARC: 'VARC mapped — the plan now knows where to start you and what to skip.',
  DILR: 'DILR mapped — set selection just got personal.',
  QA: 'Quant mapped — where to start, what to skip, where revision matters. Your Blueprint just became much smarter.',
  MOCKS: 'Mock prep mapped — your test-readiness now has a baseline.',
  REVISION: 'Revision habits mapped — decay is now part of your plan.',
  READING: 'Reading habits mapped — the highest-leverage VARC input is on record.',
};

// Micro-lessons — onboarding that already teaches. Each is a widely-known
// CAT-prep convention consistent with this codebase's own topic weightages,
// never an invented statistic.
const SECTION_LESSON: Partial<Record<CoverageSectionId, string>> = {
  VARC: '💡 Reading Comprehension carries most VARC marks — a daily reading habit moves this section more than any drill.',
  DILR: '💡 DILR is a set-selection game: choosing the right 2 sets to attempt matters more than raw speed.',
  QA: '💡 Arithmetic + Algebra contribute the majority of CAT Quant questions. Good thing we mapped these carefully.',
};

// Effort preview per section — people abandon uncertainty, not effort.
// ~4 seconds per one-tap unit, said out loud so the brain can price it.
function effortLabel(unitCount: number): string {
  const seconds = unitCount * 4;
  return seconds < 60 ? `≈${Math.round(seconds / 5) * 5}s` : `≈${Math.round(seconds / 60)} min`;
}

// Everything starts collapsed — never all ~57 units at once. A section
// header shows its declared tally and time price; expanding reveals its
// units (QA expands once more into its five clusters). Untouched units stay
// ⚪ by default, so "expand nothing, continue" is itself an honest answer.
export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [statuses, setStatuses] = useState<Record<string, DeclaredStatus>>({});
  const [openSection, setOpenSection] = useState<CoverageSectionId | null>('VARC');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [celebration, setCelebration] = useState<string | null>(null);
  const [touchedSections, setTouchedSections] = useState<Set<CoverageSectionId>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (celebrationTimer.current) clearTimeout(celebrationTimer.current); }, []);

  const statusOf = (unit: string): DeclaredStatus => statuses[unit] ?? 'not_started';
  const allUnits = KNOWLEDGE_GRAPH.flatMap((s) => s.groups.flatMap((g) => g.units));
  const touched = allUnits.filter((u) => statusOf(u) !== 'not_started');

  const sectionTally = (sectionId: CoverageSectionId) => {
    const units = KNOWLEDGE_GRAPH.find((s) => s.id === sectionId)!.groups.flatMap((g) => g.units);
    const learning = units.filter((u) => statusOf(u) === 'learning').length;
    const practicing = units.filter((u) => statusOf(u) === 'practicing').length;
    return { total: units.length, learning, practicing };
  };

  const declareStatus = (sectionId: CoverageSectionId, unit: string, value: DeclaredStatus) => {
    setStatuses((prev) => ({ ...prev, [unit]: value }));
    setTouchedSections((prev) => new Set(prev).add(sectionId));
    setCelebration(HONESTY_LINES[value](unit));
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const matrix = KNOWLEDGE_GRAPH.flatMap((s) =>
        s.groups.flatMap((g) => g.units.map((unit) => ({ section: s.id, topic: unit, status: statusOf(unit) })))
      );
      const res = await fetch('/api/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error ?? 'Could not save your preparation map.');
      }
      onNext({
        coverage_practicing: matrix.filter((m) => m.status === 'practicing').length,
        coverage_learning: matrix.filter((m) => m.status === 'learning').length,
        coverage_total: matrix.length,
      });
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not save your preparation map.');
    } finally {
      setSaving(false);
    }
  };

  const renderUnit = (sectionId: CoverageSectionId, unit: string) => {
    const current = statusOf(unit);
    return (
      <div key={unit} className="rounded-xl border border-stone-200 p-2.5">
        <p className="text-[13px] font-semibold text-stone-800 mb-1.5">{unit}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map(({ value, dot, label, active }) => (
            <button
              key={value}
              disabled={saving || isLoading}
              onClick={() => declareStatus(sectionId, unit, value)}
              className={cn(
                'rounded-lg border py-1.5 px-1 text-[10px] font-semibold leading-tight transition-all active:scale-95',
                current === value ? active : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
              )}
            >
              {dot} {label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 leading-relaxed">
        Where are you currently with these topics? Open only what you&apos;ve touched —{' '}
        <span className="font-semibold text-stone-800">leaving everything &ldquo;Haven&apos;t started&rdquo; is a perfectly honest answer.</span>
      </p>

      {/* Honesty celebration — one live slot, decisions get celebrated the
          moment they're made, not at the end. */}
      <div aria-live="polite" className={cn('transition-opacity duration-300', celebration ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden')}>
        {celebration && (
          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 leading-relaxed">{celebration}</p>
        )}
      </div>

      <div className="space-y-2">
        {KNOWLEDGE_GRAPH.map((section) => {
          const isOpen = openSection === section.id;
          const tally = sectionTally(section.id);
          const declared = tally.learning + tally.practicing;
          const rewardEarned = !isOpen && touchedSections.has(section.id);
          return (
            <div key={section.id} className="rounded-xl border border-stone-200 overflow-hidden">
              <button
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                className="w-full flex items-center justify-between px-3.5 py-3 bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <span className="text-sm font-bold text-stone-800">{section.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-stone-500">
                    {declared > 0
                      ? `${tally.practicing > 0 ? `🔵 ${tally.practicing}  ` : ''}${tally.learning > 0 ? `🟡 ${tally.learning}  ` : ''}of ${tally.total}`
                      : `${tally.total} units · ${effortLabel(tally.total)}`}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>
              {rewardEarned && (
                <p className="px-3.5 py-2 text-[11px] text-teal-700 bg-teal-50/60 border-t border-teal-100 leading-relaxed">
                  ✓ {SECTION_REWARD[section.id]}
                </p>
              )}
              {isOpen && (
                <div className="p-2.5 space-y-2">
                  {section.groups.map((group) =>
                    group.label == null ? (
                      group.units.map((u) => renderUnit(section.id, u))
                    ) : (
                      <div key={group.label} className="rounded-xl border border-stone-100 overflow-hidden">
                        <button
                          onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label!]: !prev[group.label!] }))}
                          className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-stone-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-stone-600">{group.label}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-400">{group.units.length} units · {effortLabel(group.units.length)}</span>
                            <ChevronDown className={cn('w-3.5 h-3.5 text-stone-400 transition-transform', openGroups[group.label] && 'rotate-180')} />
                          </span>
                        </button>
                        {openGroups[group.label] && <div className="p-2 space-y-2">{group.units.map((u) => renderUnit(section.id, u))}</div>}
                      </div>
                    )
                  )}
                  {SECTION_LESSON[section.id] && (
                    <p className="text-[11px] text-stone-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 leading-relaxed">
                      {SECTION_LESSON[section.id]}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {touched.length > 0 && (
        <p className="text-xs text-stone-500 text-center">{touched.length} of {allUnits.length} units marked</p>
      )}

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 pt-1">
        {canGoBack && (
          <button onClick={onBack} disabled={saving} className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || isLoading}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Lock my preparation map →'}
        </button>
      </div>
    </div>
  );
}
