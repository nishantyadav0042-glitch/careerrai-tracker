'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HeatmapCardProps {
  daysData: Array<{
    date: string;
    hours: number;
  }>;
  days?: number;
  className?: string;
}

export function HeatmapCard({ daysData, days = 14, className }: HeatmapCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">Last {days} Days</h3>
        <a href="/student/reports" className="text-[10px] text-stone-500 hover:text-stone-900 transition-colors">
          View all →
        </a>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {daysData.map((d, i) => {
          const date = new Date(d.date);
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
          const hasStudy = d.hours > 0;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'aspect-square w-full rounded-md flex items-center justify-center hover:ring-2 hover:ring-orange-400 cursor-pointer transition-all',
                  hasStudy ? 'bg-orange-50 border border-orange-200' : 'bg-stone-100'
                )}
                title={`${d.date}: ${d.hours.toFixed(1)} hrs`}
              >
                <span className={cn(
                  'text-[9px] font-bold leading-none',
                  hasStudy ? 'text-orange-700' : 'text-stone-300'
                )}>
                  {hasStudy ? d.hours.toFixed(1) : '–'}
                </span>
              </div>
              <span className="text-[10px] text-stone-500">{dayLabel}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-stone-400 mt-4 pt-3 border-t border-stone-100">
        Numbers show hours studied each day
      </p>
    </Card>
  );
}
