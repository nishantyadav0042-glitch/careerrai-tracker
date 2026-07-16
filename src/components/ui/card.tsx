import { cn } from '@/lib/utils';

export function Card({ children, className = '', ...props }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white border border-stone-200 rounded-2xl', className)} {...props}>
      {children}
    </div>
  );
}
