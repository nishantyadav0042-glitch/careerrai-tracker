import { cn } from '@/lib/utils';

interface Props {
  /** Number of placeholder cards below the header */
  cards?: number;
  /** Show the small uppercase eyebrow + big title placeholders */
  header?: boolean;
  className?: string;
}

/**
 * Generic route-level loading skeleton, used by loading.tsx files so taps on
 * the bottom nav respond instantly while the server renders the page.
 */
export function RouteSkeleton({ cards = 3, header = true, className }: Props) {
  return (
    <div className={cn('animate-pulse space-y-5 max-w-md mx-auto w-full', className)}>
      {header && (
        <div className="space-y-2 px-1">
          <div className="h-3 w-24 bg-stone-200 rounded-full" />
          <div className="h-7 w-44 bg-stone-200 rounded-lg" />
        </div>
      )}
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3"
        >
          <div className="h-4 w-1/3 bg-stone-100 rounded" />
          <div className="h-3 w-2/3 bg-stone-100 rounded" />
          <div className="h-3 w-1/2 bg-stone-100 rounded" />
        </div>
      ))}
    </div>
  );
}
