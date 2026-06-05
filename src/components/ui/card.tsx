import { cn } from '@/lib/utils';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-stone-200 rounded-2xl', className)}>
      {children}
    </div>
  );
}
