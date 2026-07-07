'use client';

import { useState } from 'react';
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

// Everything starts collapsed — never all ~56 units at once. A section
// header shows its declared tally; expanding reveals its units (QA expands
// once more into its five clusters). Untouched units stay ⚪ by default, so
// "expand nothing, continue" is itself an honest, valid answer.
export default function ScreenTopicCoverage({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [statuses, setStatuses] = useState<Record<string, DeclaredStatus>>({});
  const [openSection, setOpenSection] = useState<CoverageSectionId | null>('VARC');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOf = (unit: string): DeclaredStatus => statuses[unit] ?? 'not_started';
  const allUnits = KNOWLEDGE_GRAPH.flatMap((s) => s.groups.flatMap((g) => g.units));
  const touched = allUnits.filter((u) => statusOf(u) !== 'not_started');

  const sectionTally = (sectionId: CoverageSectionId) => {
    const units = KNOWLEDGE_GRAPH.find((s) => s.id === sectionId)!.groups.flatMap((g) => g.units);
    const learning = units.filter((u) => statusOf(u) === 'learning').length;
    const practicing = units.filter((u) => statusOf(u) === 'practicing').length;
    return { total: units.length, learning, practicing };
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

  const renderUnit = (unit: string) => {
    const current = statusOf(unit);
    return (
      <div key={unit} className="rounded-xl border border-stone-200 p-2.5">
        <p className="text-[13px] font-semibold text-stone-800 mb-1.5">{unit}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map(({ value, dot, label, active }) => (
            <button
              key={value}
              disabled={saving || isLoading}
              onClick={() => setStatuses((prev) => ({ ...prev, [unit]: value }))}
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

      <div className="space-y-2">
        {KNOWLEDGE_GRAPH.map((section) => {
          const isOpen = openSection === section.id;
          const tally = sectionTally(section.id);
          const declared = tally.learning + tally.practicing;
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
                      : `${tally.total} units`}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-stone-400 transition-transform', isOpen && 'rotate-180')} />
                </span>
              </button>
              {isOpen && (
                <div className="p-2.5 space-y-2">
                  {section.groups.map((group) =>
                    group.label == null ? (
                      group.units.map(renderUnit)
                    ) : (
                      <div key={group.label} className="rounded-xl border border-stone-100 overflow-hidden">
                        <button
                          onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label!]: !prev[group.label!] }))}
                          className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-stone-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-stone-600">{group.label}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-400">{group.units.length} units</span>
                            <ChevronDown className={cn('w-3.5 h-3.5 text-stone-400 transition-transform', openGroups[group.label] && 'rotate-180')} />
                          </span>
                        </button>
                        {openGroups[group.label] && <div className="p-2 space-y-2">{group.units.map(renderUnit)}</div>}
                      </div>
                    )
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
