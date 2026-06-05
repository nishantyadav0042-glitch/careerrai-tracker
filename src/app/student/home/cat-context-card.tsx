'use client';

import { Card } from '@/components/ui/card';
import { Calendar, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// CAT exam date (hardcoded)
const CAT_EXAM_DATE = new Date(2026, 10, 23); // Nov 23, 2026

interface CATContextCardProps {
  className?: string;
}

export function CATContextCard({ className }: CATContextCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = Math.ceil((CAT_EXAM_DATE.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Dynamic message based on days remaining
  const getMessage = () => {
    if (daysRemaining >= 180) {
      return {
        title: 'Foundation Phase',
        message: 'Build habits now — they compound harder than any topic revision.',
        icon: '🏗️',
        color: 'from-blue-600 to-blue-700'
      };
    } else if (daysRemaining >= 90) {
      return {
        title: 'Mock Phase',
        message: 'One mock per week minimum. Your buddy is watching your scores closely.',
        icon: '📊',
        color: 'from-orange-600 to-orange-700'
      };
    } else if (daysRemaining >= 30) {
      return {
        title: 'Final Stretch',
        message: "Don't change strategy now. Your buddy will guide every mock.",
        icon: '⚡',
        color: 'from-amber-600 to-amber-700'
      };
    } else {
      return {
        title: 'Last Mile',
        message: 'Trust your preparation. Your buddy has one job: keep you calm.',
        icon: '🎯',
        color: 'from-red-600 to-red-700'
      };
    }
  };

  const info = getMessage();

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className={cn('bg-gradient-to-br p-6 text-white', info.color)}>
        <div className="space-y-4">
          {/* Days Counter */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-5xl font-bold font-mono leading-none">
                {daysRemaining}
              </div>
              <p className="text-sm opacity-90 mt-1">
                {daysRemaining === 1 ? 'day' : 'days'} until CAT
              </p>
            </div>
            <div className="text-4xl">{info.icon}</div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/20" />

          {/* Phase Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{info.title}</h3>
            <p className="text-sm opacity-90 leading-relaxed">{info.message}</p>
          </div>

          {/* Exam Date */}
          <div className="flex items-center gap-2 text-xs opacity-75">
            <Calendar className="w-3 h-3" />
            <span>Exam: {CAT_EXAM_DATE.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="h-1 bg-gradient-to-r from-transparent via-stone-300 to-transparent" />
    </Card>
  );
}
