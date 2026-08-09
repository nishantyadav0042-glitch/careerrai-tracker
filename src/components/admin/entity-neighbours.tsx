import Link from 'next/link';
import type { ResolvedEntity } from '@/lib/os/resolve-entity';

// Every object connected to this one — read straight from the entity graph.
//
// Co-founder rule, 9 Aug: "reverse integration. Open a student and never leave.
// Everything connected should be visible." This renders the neighbour groups
// resolveEntity returns, so a profile shows its buddy, payments, sessions,
// timetables, plans and notifications without the page having to know how any
// of them join — the graph knows, and this just draws it.
//
// Reusable on purpose: the buddy 360 and payment 360 render the exact same
// component over their own resolved entity. One connected-objects panel, every
// profile.

export function EntityNeighbours({ entity }: { entity: ResolvedEntity }) {
  const groups = entity.neighbours.filter((g) => g.cardinality === 'many' || g.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">Connected</p>
      {groups.map((g) => (
        <div key={g.label} className="rounded-2xl border border-stone-200 bg-white p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[13px] font-bold text-stone-800">{g.label}</p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
              {g.rows.length}{g.truncated ? '+' : ''}
            </span>
          </div>

          {g.rows.length === 0 ? (
            <p className="text-[12px] text-stone-400">
              {g.cardinality === 'one' ? 'None' : 'Nothing yet'}
            </p>
          ) : (
            <div className="space-y-1">
              {g.rows.map((r) => (
                <Link
                  key={r.id}
                  href={r.route}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-stone-50"
                >
                  <span className="min-w-0 truncate text-stone-800">{r.label}</span>
                  {r.detail && <span className="shrink-0 text-[11px] text-stone-400">{r.detail}</span>}
                </Link>
              ))}
              {g.truncated && (
                <p className="px-2 pt-1 text-[11px] text-stone-400">
                  Showing the first {g.rows.length} — more exist.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
