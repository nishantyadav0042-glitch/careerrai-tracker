import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';
import { FileImage, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

// OCR CENTER — timetable and scorecard reading.
//
// Founder, 9 Aug: a dedicated page with success rate, failures, retry queue.
//
// ONE OF THOSE CANNOT BE BUILT HONESTLY TODAY, and it is the most important
// one. `api/timetable/parse` returns 422 with "Couldn't read any classes or
// targets from that" and records NOTHING — only successful parses write a
// `timetable_parsed` event. So a success rate computed from what we store
// would always read 100%, which is worse than no number at all: it would say
// the scanner is perfect on the exact day a student cannot get their photo in.
//
// What is real: how many timetables were read, how much of each one we could
// map to our own topics, and who is stuck on a confirmed sheet with nothing
// matched. That last group is the actionable one — a student whose sheet
// parsed but mapped zero topics has a plan that ignores their coaching.

export default async function OcrCenterPage() {
  const { admin } = await requireAdmin();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: parses }, { data: tables }] = await Promise.all([
    admin.from('student_events')
      .select('user_id, props, created_at')
      .eq('event', 'timetable_parsed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('student_timetables').select('student_id, blocks, confirmed_at, created_at'),
  ]);

  const events = parses ?? [];
  const sheets = tables ?? [];

  const ids = [...new Set([...events.map((e) => e.user_id), ...sheets.map((s) => s.student_id)])].filter(Boolean) as string[];
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? '—']));

  // Mapping quality: blocks the model read, versus blocks it matched to one of
  // OUR topics. A sheet with many blocks and zero mapped is a sheet we read
  // but cannot use.
  let readBlocks = 0;
  let mappedBlocks = 0;
  for (const e of events) {
    const p = (e.props ?? {}) as { blocks?: number; mapped?: number };
    readBlocks += p.blocks ?? 0;
    mappedBlocks += p.mapped ?? 0;
  }
  const mapRate = readBlocks > 0 ? Math.round((mappedBlocks / readBlocks) * 100) : null;

  const confirmed = sheets.filter((s) => s.confirmed_at);
  const unusable = confirmed.filter((s) => {
    const blocks = Array.isArray(s.blocks) ? (s.blocks as { topic?: string | null }[]) : [];
    return blocks.length > 0 && blocks.every((b) => !b.topic);
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <WorkspaceShell
      workspaceId="ocr"
      activeHref="/admin/ocr"
      title="OCR uploads"
      subtitle="Timetable reads in the last 30 days"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminStat label="Timetables read" value={events.length} />
        <AdminStat label="Sheets confirmed" value={confirmed.length} />
        <AdminStat
          label="Topics matched"
          value={mapRate == null ? '—' : `${mapRate}%`}
          tone={mapRate == null ? 'plain' : mapRate >= 60 ? 'good' : mapRate >= 30 ? 'warn' : 'bad'}
          hint={`${mappedBlocks} of ${readBlocks} blocks matched a CAT topic`}
        />
        <AdminStat
          label="Confirmed but unusable"
          value={unusable.length}
          tone={unusable.length ? 'bad' : 'good'}
          hint="Read, but nothing matched our syllabus"
        />
      </div>

      {unusable.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {unusable.length} student{unusable.length === 1 ? '' : 's'} confirmed a sheet we cannot use
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-amber-800">
            {unusable.map((s) => nameOf.get(s.student_id as string) ?? '—').join(', ')}
            {' '}— the photo was read, but not one block matched a CAT topic, so their daily plan
            is not following their coaching at all.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-dashed border-stone-300 bg-white p-3.5">
        <p className="text-[12px] font-bold text-stone-700">Why there is no success rate here</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-stone-500">
          A failed parse returns 422 and writes nothing, so only successes are stored. A rate
          computed from that would read 100% forever — including on the day a student cannot get
          their photo in. Recording a <code className="text-[10.5px]">timetable_parse_failed</code> event
          is the one change that makes this measurable.
        </p>
      </div>

      {events.length === 0 ? (
        <AdminEmpty>No timetables read in the last 30 days.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 40).map((e, i) => {
            const p = (e.props ?? {}) as { blocks?: number; mapped?: number; targets?: number; mediaType?: string };
            const mapped = p.mapped ?? 0;
            const blocks = p.blocks ?? 0;
            return (
              <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileImage className="h-4 w-4 shrink-0 text-stone-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-stone-900">
                      {nameOf.get(e.user_id as string) ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {fmt(e.created_at as string)} · {p.mediaType ?? 'image'}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    blocks === 0 ? 'bg-stone-100 text-stone-500'
                    : mapped === 0 ? 'bg-red-100 text-red-700'
                    : mapped / blocks >= 0.5 ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {mapped}/{blocks} matched
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
