import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

// ── 0B — THE CANONICAL EVENT BOUNDARY ───────────────────────────────────────
//
// Phase-0 Integrity Specification, item 0B. The memory layer READS CareerRai's
// canonical records and NEVER writes them.
//
// Why a structural guard and not a code review: on 17 Aug a new module
// re-spelled the coverage ladder instead of consuming the authority that owned
// it, and 1,826 green tests did not notice, because the author ran the
// targeted file instead of the suite. covered-authority.guard.test.ts caught it
// only because someone had previously encoded that authority as a TEST rather
// than as a convention. This file does the same job one level up:
//
//   Every architectural authority needs a test that prevents the next
//   developer — or the next model — from creating a second authority.
//
// A grep for `.insert(` inside src/lib/facts/** would NOT be sufficient, and
// the founder said so explicitly: a helper imported by the layer can mutate
// state on its behalf. src/lib/timetable-apply.ts, src/lib/plan-mutate.ts and
// src/lib/routine-plan.ts all write canonical tables today. So this guard walks
// the TRANSITIVE import closure and enforces two independent barriers:
//
//   BARRIER 1 (structural, absolute): nothing in the closure may import a
//     database client. No client, no writes — and no reads either, which is
//     what forces the pure-core/thin-shell shape 0C requires ("produce: pure,
//     no I/O, no LLM"). Data arrives as arguments.
//
//   BARRIER 2 (belt and braces): even if a client were passed IN as an
//     argument, no file in the closure may chain a write verb onto a canonical
//     table, call a mutating RPC, or reference a table at all.
//
// Barrier 1 alone would be defeated by dependency injection; Barrier 2 alone
// would be defeated by a helper that hides the write. Together they close both.

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// ── The canonical sources, per the founder's locked decision (18 Aug) ────────
// Four different questions. Never one overloaded "topics_covered".
const CANONICAL_TABLES = [
  'routine_task_completions', // observed behaviour — what did the student tick?
  'daily_reports',            // showing-up      — did the student submit a log?
  'topic_coverage',           // syllabus        — what does CareerRai know is covered?
  'daily_routines',           // the plan        — what did CareerRai plan?
  'mock_debriefs',            // mock results
  'study_action_log',         // recommendations shown
];

// Verified against src/ on 18 Aug — every RPC in the codebase that mutates.
const MUTATING_RPCS = [
  'upsert_log_and_streak', 'activate_payment', 'delete_student_account',
  'increment_buddy_cta', 'increment_coupon_use', 'claim_otp_send_slot',
];

const DB_CLIENT_IMPORTS = [
  '@/lib/supabase/admin', '@/lib/supabase/server', '@/lib/supabase/client',
  '@supabase/supabase-js',
];

// Every event/log/queue table that existed when 0B was written, verified live
// against production. A NEW one appearing means someone introduced a second
// event source — the thing 0B exists to prevent.
// Pinned from production 18 Aug with the SAME pattern this test applies
// (`tablename ~ 'event|_log|queue|outbox|stream|bus'`), so the baseline and the
// check can never disagree about what counts. The first draft queried `_log`
// and missed `brain_break_logs`, which the guard then reported as novel — a
// reminder that a baseline gathered by a different rule than the one enforced
// is not a baseline.
const EVENT_TABLE_BASELINE = [
  'admin_audit_log', 'ai_usage_events', 'analytics_events', 'brain_break_logs',
  'buddy_assignment_queue', 'decision_log', 'expedify_events', 'funnel_events',
  'integration_audit_log', 'notification_consent_events', 'otp_send_events',
  'perf_events', 'recovery_events', 'routine_engagement_events', 'security_events',
  'student_events', 'study_action_log', 'timeline_events',
];

const MEMORY_LAYER_DIRS = [join(SRC, 'lib/facts'), join(SRC, 'lib/insights')];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

/** Resolve an import specifier to a real file, or null for bare/package imports. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // bare package import — handled by the client check, not the walk
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

interface Closure { files: string[]; bareImports: Map<string, string[]> }

/** Every local file reachable from the roots, plus which files pulled which packages. */
function transitiveClosure(roots: string[]): Closure {
  const seen = new Set<string>();
  const bare = new Map<string, string[]>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      const resolved = resolveImport(spec, file);
      if (resolved) { if (!seen.has(resolved)) queue.push(resolved); }
      else {
        if (!bare.has(spec)) bare.set(spec, []);
        bare.get(spec)!.push(file);
      }
    }
  }
  return { files: [...seen], bareImports: bare };
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const rootFiles = MEMORY_LAYER_DIRS.flatMap(walk).filter((f) => !f.includes('.test.'));
const closure = transitiveClosure(rootFiles);
const rel = (f: string) => f.replace(`${ROOT}/`, '');

describe('0B — the canonical event contract exists as code, not prose', () => {
  it('declares the canonical sources in one place', () => {
    const canonical = join(SRC, 'lib/facts/canonical.ts');
    expect(existsSync(canonical), 'src/lib/facts/canonical.ts must declare the canonical sources').toBe(true);
  });

  it('names every canonical source exactly once, with its question', () => {
    const src = readFileSync(join(SRC, 'lib/facts/canonical.ts'), 'utf8');
    for (const table of CANONICAL_TABLES) {
      const hits = [...src.matchAll(new RegExp(`'${table}'`, 'g'))].length;
      expect(hits, `${table} must be declared exactly once in the canonical registry`).toBe(1);
    }
  });

  it('keeps the four questions separate — no overloaded "topics_covered" concept', () => {
    const src = readFileSync(join(SRC, 'lib/facts/canonical.ts'), 'utf8');
    // The founder's locked decision: behaviour, showing-up, syllabus and plan
    // are four different facts with four different sources.
    for (const key of ['observedBehaviour', 'dailyLogState', 'syllabusCoverage', 'generatedPlan']) {
      expect(src, `canonical registry must distinguish ${key}`).toContain(key);
    }
  });
});

describe('0B barrier 1 — the memory layer cannot reach a database at all', () => {
  it('imports no database client, transitively', () => {
    const offenders: string[] = [];
    for (const [spec, importers] of closure.bareImports) {
      if (DB_CLIENT_IMPORTS.includes(spec)) offenders.push(...importers.map((f) => `${rel(f)} imports ${spec}`));
    }
    // '@/lib/...' resolves to a local file, so a client import through the alias
    // shows up in the file closure rather than in bareImports — check both.
    for (const f of closure.files) {
      if (/supabase\/(admin|server|client)\.ts$/.test(f)) offenders.push(`${rel(f)} is a database client inside the closure`);
    }
    expect(offenders, 'the memory layer must be pure — data arrives as arguments, never fetched').toEqual([]);
  });
});

describe('0B barrier 2 — even with an injected client, no write is expressible', () => {
  it('chains no write verb onto a canonical table', () => {
    const offenders: string[] = [];
    for (const f of closure.files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const table of CANONICAL_TABLES) {
        const re = new RegExp(`from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.\\s*(insert|update|upsert|delete)\\s*\\(`);
        if (re.test(code)) offenders.push(`${rel(f)} writes ${table}`);
      }
    }
    expect(offenders, 'canonical sources are read-only to the memory layer').toEqual([]);
  });

  it('calls no mutating RPC', () => {
    const offenders: string[] = [];
    for (const f of closure.files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const rpc of MUTATING_RPCS) {
        if (code.includes(`rpc('${rpc}'`)) offenders.push(`${rel(f)} calls ${rpc}`);
      }
    }
    expect(offenders, 'a mutating RPC is a write path wearing a different name').toEqual([]);
  });

  it('references no table at all — the layer is pure by construction', () => {
    const offenders: string[] = [];
    for (const f of closure.files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      // canonical.ts declares table NAMES as data; it never queries them.
      if (f.endsWith('lib/facts/canonical.ts')) continue;
      if (/\.from\(\s*['"]/.test(code)) offenders.push(`${rel(f)} queries a table directly`);
    }
    expect(offenders, 'fact producers take data as input; routes do the fetching').toEqual([]);
  });
});

describe('0B — no second event source is introduced', () => {
  it('adds no new event/log/queue table beyond the pinned baseline', () => {
    const migrations = join(ROOT, 'supabase/migrations');
    const created: string[] = [];
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql'))) {
      const sql = readFileSync(join(migrations, f), 'utf8').toLowerCase();
      for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/g)) {
        const t = m[1];
        if (/(event|_log|queue|outbox|stream|bus)/.test(t)) created.push(t);
      }
    }
    const novel = [...new Set(created)].filter((t) => !EVENT_TABLE_BASELINE.includes(t));
    expect(novel, 'the canonical records ARE the event log — do not introduce a second one').toEqual([]);
  });

  it('introduces no event bus or queue module in the memory layer', () => {
    const offenders = closure.files.filter((f) =>
      /(event-bus|eventbus|message-queue|outbox|dispatcher)\.ts$/.test(f)
    );
    expect(offenders.map(rel), 'events are rows in canonical tables, not messages in a bus').toEqual([]);
  });
});

describe('0B — the guard cannot be quietly emptied', () => {
  it('scans a closure that actually includes the memory layer once it exists', () => {
    // If src/lib/facts/** exists, its files MUST appear in the scanned closure.
    // Without this, deleting the roots would make every assertion above pass
    // vacuously — a guard that protects nothing.
    const factsDir = join(SRC, 'lib/facts');
    if (existsSync(factsDir)) {
      const factFiles = walk(factsDir).filter((f) => !f.includes('.test.'));
      expect(factFiles.length, 'src/lib/facts must contain at least the canonical registry').toBeGreaterThan(0);
      for (const f of factFiles) expect(closure.files).toContain(f);
    }
  });
});
