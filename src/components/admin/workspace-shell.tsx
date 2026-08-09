import Link from 'next/link';
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
  activeHref,
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

      {ws && ws.tabs.length > 1 && (
        <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
          {ws.tabs.map((t) => {
            // A tab with no data source is shown, disabled, with the reason on
            // hover. Hiding it would let the gap be forgotten; faking a number
            // would be worse than either.
            if (t.status === 'planned') {
              return (
                <span
                  key={t.label}
                  title={t.blockedOn}
                  className="shrink-0 cursor-help rounded-lg border border-dashed border-stone-200 px-2.5 py-1.5 text-[11px] font-semibold text-stone-300"
                >
                  {t.label}
                </span>
              );
            }
            const active = t.href === activeHref;
            return (
              <Link
                key={t.href}
                href={t.href!}
                className={
                  active
                    ? 'shrink-0 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-white'
                    : 'shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 hover:border-stone-400 hover:text-stone-900'
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}

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
