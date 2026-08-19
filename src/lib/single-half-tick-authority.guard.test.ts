import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── One half-tick authority, not two ────────────────────────────────────────
//
// routine_task_completions carried a `portion` column constrained to
// ('full','half') -- the half-tick concept -- alongside `confidence`, which is
// where the half-tick ACTUALLY lives ('blue' = half, per completion-portion.ts).
//
// The column was never populated: 0 of 289 rows, no writer anywhere in src/, no
// reader, no index, no view. But an empty column with the right name and the
// right CHECK constraint is not harmless clutter. It is a second authority
// waiting to be adopted -- and "a second definition added quietly" is this
// codebase's documented recurring failure, the one covered-authority and the
// canonical boundary guard both exist to prevent. The next person to implement
// half-ticks would have found `portion` and used it, and then the two would
// have disagreed.
//
// So it was retired, not left with a warning comment: removing the hazard beats
// documenting it.
//
// WHAT DID NOT CHANGE: complete-task still accepts `portion` in the REQUEST
// BODY and maps it to a confidence signal. That is the client contract and the
// column was never its storage, so dropping the column changes no API
// behaviour. This test pins both halves -- the column stays gone, the request
// parameter keeps working.

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');

const stripSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the half-tick has exactly one authority', () => {
  it('drops the portion column', () => {
    const dropped = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => stripSql(readFileSync(join(MIGRATIONS, f), 'utf8')))
      .some((sql) => /alter table[\s\S]{0,80}routine_task_completions[\s\S]{0,80}drop column[\s\S]{0,40}portion/i.test(sql));
    expect(dropped, 'a migration must retire routine_task_completions.portion').toBe(true);
  });

  it('never re-adds it', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
      const sql = stripSql(readFileSync(join(MIGRATIONS, f), 'utf8'));
      for (const m of sql.matchAll(/alter table\s+(?:public\.)?routine_task_completions\s+add column\s+(?:if not exists\s+)?(\w+)/gi)) {
        if (m[1].toLowerCase() === 'portion') offenders.push(f);
      }
    }
    // The drop migration itself must not also re-add it.
    expect(offenders, 'portion must not come back — confidence is the authority').toEqual([]);
  });

  it('no code reads or writes the column', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, 'src'))) {
      const code = stripTs(readFileSync(f, 'utf8'));
      // a select list or an insert/update object naming the column
      if (/routine_task_completions[\s\S]{0,200}['"][^'"]*\bportion\b/.test(code)) offenders.push(f.replace(`${ROOT}/`, ''));
      if (/\bportion:\s*(?!undefined)/.test(code) && /from\(['"]routine_task_completions/.test(code)) offenders.push(f.replace(`${ROOT}/`, ''));
    }
    expect(offenders, 'the column is gone; writing it would now error at runtime').toEqual([]);
  });

  it('keeps the request-body contract working', () => {
    // Dropping the column must not have broken the client's API.
    const route = stripTs(readFileSync(join(ROOT, 'src/app/api/routine/complete-task/route.ts'), 'utf8'));
    expect(route, 'clients still send portion').toMatch(/portion/);
    expect(route, "and it still maps to the confidence signal").toMatch(/portion === 'half'/);
  });

  it('leaves completion-portion.ts as the interpreter', () => {
    const mod = readFileSync(join(ROOT, 'src/lib/completion-portion.ts'), 'utf8');
    expect(mod).toMatch(/HALF_TICK_SIGNAL/);
  });
});
