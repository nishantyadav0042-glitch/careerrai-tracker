// ── Is this surface actually reachable by a student? ────────────────────────
//
// Three features have now shipped that no user could ever reach: the Sales
// workspace that was in the registry but on no nav, the daily LRDI puzzle
// whose cron generated 34 puzzles into a table with no UI, and the evidence
// capture whose announcement banner outlived the screen it announced. Each
// looked complete in review, passed its tests, and served nobody.
//
// Registry membership is not reachability. A test is not reachability. The
// only thing that makes a component reachable is an unbroken import path from
// a routed entrypoint, so that is what this walks.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** Static imports, re-exports, and the dynamic import() Next uses for code
 *  splitting — a component pulled in only by next/dynamic is still reached. */
const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function walkDir(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__fixtures__') continue;
      walkDir(full, out);
    } else if (EXTS.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // a package, not our source

  for (const ext of ['', ...EXTS]) {
    const candidate = base + ext;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch { /* keep trying */ }
  }
  for (const ext of EXTS) {
    const candidate = join(base, 'index' + ext);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch { /* keep trying */ }
  }
  return null;
}

/** Everything Next.js will actually serve: routed pages, layouts, route
 *  handlers, the middleware, and the instrumentation entrypoint. */
export function entrypoints(): string[] {
  return walkDir(SRC).filter((f) => {
    const rel = relative(SRC, f).replace(/\\/g, '/');
    if (rel === 'proxy.ts' || rel === 'middleware.ts' || rel.startsWith('instrumentation')) return true;
    if (!rel.startsWith('app/')) return false;
    return /\/(page|layout|route|template|error|not-found|loading|default)\.(t|j)sx?$/.test('/' + rel);
  });
}

/** Every source file reachable from a routed entrypoint by following imports. */
export function reachableFiles(): Set<string> {
  const seen = new Set<string>();
  const queue = entrypoints();
  for (const e of queue) seen.add(e);

  while (queue.length) {
    const file = queue.pop()!;
    let text: string;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveSpecifier(m[1], file);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}

/** True when a student can, in principle, get to this file's code. */
export function isReachable(relPath: string, reachable = reachableFiles()): boolean {
  return reachable.has(join(ROOT, relPath));
}
