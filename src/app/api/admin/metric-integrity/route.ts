import { NextResponse } from 'next/server';
import { requireAdminCtx } from '@/lib/require-admin';
import { ACCEPTED_EMPTY_COLUMNS, METRICS } from '@/lib/metric-registry';

export const maxDuration = 60;

// GET /api/admin/metric-integrity
//
// The live half of the metric registry. metric-registry.test.ts checks the
// registry against itself at build time; this checks it against PRODUCTION —
// the thing a test can never see.
//
// It answers one question: is any number in this product structurally
// incapable of being right? A column that is 100% NULL while a metric reads it
// is exactly that, and it is how the launch dashboard reported a 0% push open
// rate for weeks against a system that was delivering 68% of its pushes.
//
// Every finding is one of two kinds:
//   · KNOWN   — on the accepted-empty list, with a reason. Fine.
//   · SURPRISE — nothing writes it and nobody has looked at why. Investigate.
//
// A surprise is not automatically a bug. It is automatically unreviewed, which
// at 10 million users is the same thing.

export async function GET() {
  const ctx = await requireAdminCtx();
  if ('error' in ctx) return ctx.error;
  const { admin } = ctx;

  const { data: dead, error } = await admin.rpc('dead_columns', { min_rows: 20 });
  if (error) {
    return NextResponse.json({ ok: false, error: 'dead_columns failed', detail: error.message }, { status: 500 });
  }

  type DeadCol = { table_name: string; column_name: string; table_rows: number };
  const rows = (dead ?? []) as DeadCol[];

  const known: DeadCol[] = [];
  const surprises: (DeadCol & { readBy?: string[] })[] = [];

  for (const r of rows) {
    const key = `${r.table_name}.${r.column_name}`;
    if (ACCEPTED_EMPTY_COLUMNS[key]) { known.push(r); continue; }
    // Is a live metric reading this empty column? That is the severe case:
    // the metric cannot render anything but zero.
    const readBy = METRICS
      .filter((m) => m.source === r.table_name && m.requires.includes(r.column_name))
      .map((m) => m.id);
    surprises.push(readBy.length > 0 ? { ...r, readBy } : r);
  }

  // Accepted-empty entries that have since started filling up are also worth
  // knowing — the note is now wrong and should be retired.
  const stillEmpty = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const staleNotes = Object.keys(ACCEPTED_EMPTY_COLUMNS).filter((k) => !stillEmpty.has(k));

  const structurallyBroken = surprises.filter((s) => (s.readBy?.length ?? 0) > 0);

  return NextResponse.json({
    ok: structurallyBroken.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      emptyColumns: rows.length,
      known: known.length,
      surprises: surprises.length,
      structurallyBrokenMetrics: structurallyBroken.length,
      staleAcceptedNotes: staleNotes.length,
      registeredMetrics: METRICS.length,
    },
    // The only section that should ever be non-empty in a healthy system.
    structurallyBroken,
    surprises,
    staleAcceptedNotes: staleNotes,
  });
}
