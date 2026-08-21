import { WORKSPACES } from '@/lib/admin-workspaces';

// One page frame for every admin screen: title, purpose, and the workspace's
// own tab row. Before this each page hand-rolled its own header and its own
// "← Dashboard" link, which is why the panel had 32 pages and no consistent
// way to move between related ones.
//
// The tabs come from lib/admin-workspaces, so a screen can never appear in a
// tab row it does not belong to, and a new page is one registry entry away
// from being reachable rather than becoming orphan number twelve.

export function WorkspaceShell({
  workspaceId,
  // activeHref stays in the API — callers name the tab they are — but the tab
  // row itself moved to AdminNav (21 Aug) so a page can no longer orphan its
  // siblings by forgetting the shell. The nav highlights from the pathname.
  title,
  subtitle,
  children,
}: {
  workspaceId: string;
  activeHref: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const ws = WORKSPACES.find((w) => w.id === workspaceId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-3 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
          {ws?.label ?? 'Admin'}
        </p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
      </div>

      {children}
    </div>
  );
}

/** Empty state, so 32 pages stop inventing 32 different ones. */
export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
      {children}
    </div>
  );
}

/** A labelled number. The label is the definition, not a decoration. */
export function AdminStat({
  label, value, hint, tone = 'plain',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'plain' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'bad' ? 'text-red-600'
    : 'text-stone-900';
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-1 text-[22px] font-bold leading-none ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-stone-500">{hint}</p>}
    </div>
  );
}
