import { cn } from '@/lib/utils';

type BadgeColor = 'stone' | 'green' | 'red' | 'amber' | 'orange' | 'teal';

const colors: Record<BadgeColor, string> = {
  stone: 'bg-stone-100 text-stone-700 border-stone-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
};

export function Badge({
  children,
  color = 'stone',
}: {
  children: React.ReactNode;
  color?: BadgeColor;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border', colors[color])}>
      {children}
    </span>
  );
}
