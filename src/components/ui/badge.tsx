import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'stone';
  className?: string;
}

export function Badge({ children, color = 'stone', className }: BadgeProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    stone: 'bg-stone-100 text-stone-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}
