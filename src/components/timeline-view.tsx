'use client';

import { useEffect, useState } from 'react';
import { loadStudentTimeline, groupTimelineByWeek, TimelineItem } from '@/lib/timeline-utils';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  studentId: string;
}

const colorMap = {
  orange: 'border-orange-200 bg-orange-50',
  blue: 'border-blue-200 bg-blue-50',
  emerald: 'border-emerald-200 bg-emerald-50',
  purple: 'border-purple-200 bg-purple-50',
  amber: 'border-amber-200 bg-amber-50'
};

const dotColorMap = {
  orange: 'bg-orange-600',
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  purple: 'bg-purple-600',
  amber: 'bg-amber-600'
};

export function TimelineView({ studentId }: TimelineViewProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const data = await loadStudentTimeline(studentId);
      setItems(data);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-stone-600">Loading journey...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center bg-stone-50">
        <p className="text-stone-600">No activity yet. Start logging to build your timeline!</p>
      </Card>
    );
  }

  const grouped = groupTimelineByWeek(items);

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([week, weekItems]) => (
        <div key={week}>
          {/* Week Header */}
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700 px-2 mb-4">
            {week}
          </h3>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-stone-200" />

            {/* Items */}
            <div className="space-y-4">
              {weekItems.map((item, idx) => (
                <div key={item.id} className="relative pl-16">
                  {/* Timeline Dot */}
                  <div
                    className={cn(
                      'absolute left-0 top-2 w-9 h-9 rounded-full border-4 border-white flex items-center justify-center text-lg',
                      dotColorMap[item.color]
                    )}
                  >
                    {item.icon}
                  </div>

                  {/* Card */}
                  <Card
                    className={cn(
                      'p-4 border-l-4 cursor-pointer hover:shadow-md transition-all',
                      colorMap[item.color]
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-stone-900">{item.title}</p>
                        <p className="text-sm text-stone-600 mt-1">{item.description}</p>

                        {/* Extra details for specific types */}
                        {item.type === 'test_result' && item.metadata && (
                          <div className="mt-2 text-xs text-stone-600 space-y-0.5">
                            <p>
                              <span className="font-medium">Time:</span>{' '}
                              {new Date(item.metadata.created_at as string).toLocaleDateString()}
                            </p>
                          </div>
                        )}

                        {item.type === 'daily_log' && item.metadata && (
                          <div className="mt-2 text-xs text-stone-600">
                            <p>
                              Topics: <span className="font-medium">{item.description}</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Date Badge */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-stone-600">
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
