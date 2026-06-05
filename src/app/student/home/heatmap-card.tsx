'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HeatmapCardProps {
  daysData: Array<{
    date: string;
    hours: number;
  }>;
  days?: number; // default 14
  className?: string;
}

export function HeatmapCard({ daysData, days = 14, className }: HeatmapCardProps) {
  // Calculate intensity for each day
  const maxHours = Math.max(...daysData.map(d => d.hours), 4);

  const getIntensity = (hours: number) => {
    if (hours === 0) return 0;
    return Math.min(4, Math.floor((hours / maxHours) * 4));
  };

  const colors = [
    'bg-stone-100', // 0
    'bg-orange-100', // 1
    'bg-orange-300', // 2
    'bg-orange-500', // 3
    'bg-orange-700' // 4
  ];

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
          const intensity = getIntensity(d.hours);
          const date = new Date(d.date);
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cn('aspect-square w-full rounded-md transition-all hover:ring-2 hover:ring-orange-600 cursor-pointer', colors[intensity])}
                title={`${d.date}: ${d.hours.toFixed(1)} hrs`}
              />
              <span className="text-[10px] text-stone-500">{dayLabel}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-stone-200">
        <span className="text-xs font-medium text-stone-600">Intensity</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-stone-500">Less</span>
          <div className="flex gap-0.5">
            {colors.map((color, i) => (
              <div key={i} className={cn('w-3 h-3 rounded-sm', color)} />
            ))}
          </div>
          <span className="text-[10px] text-stone-500">More</span>
        </div>
      </div>
    </Card>
  );
}
