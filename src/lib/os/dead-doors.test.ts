import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── No dead doors — enforced, not hoped ─────────────────────────────────────
//
// Founder, 9 Aug: "Buttons should NEVER open dead doors. As we grow this will
// be messed up." So this is the guard: every internal /admin link the panel
// emits — href, route, actionRoute, destination — must resolve to a page that
// actually exists. A new button pointing at a route nobody built fails the
// build, here, before the founder ever taps it into a 404.

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|ts)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every admin PAGE that exists, as a matcher (dynamic [id] → any segment). */
function realRouteMatchers(): RegExp[] {
  const pages = walk('src/app/admin').filter((f) => f.endsWith('page.tsx'));
  return pages.map((f) => {
    const route = f.replace('src/app', '').replace('/page.tsx', '') || '/admin';
    // [id]/[studentId]/… → one non-slash segment.
    const pattern = route.replace(/\[[^\]]+\]/g, '[^/?#]+');
    return new RegExp(`^${pattern}$`);
  });
}

/** Strip comments so a route mentioned in prose is not scanned as a live link. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Collect every /admin path literal used as a navigation target. */
function referencedAdminPaths(files: string[]): { path: string; file: string }[] {
  const refs: { path: string; file: string }[] = [];
  const re = /(?:href|route|actionRoute|destination)\s*[=:]\s*[`'"]((?:\/admin)[^`'"]*)[`'"]/g;
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(re)) refs.push({ path: m[1], file: f });
  }
  return refs;
}

function normalize(path: string): string {
  // Drop query/hash — a filter param does not change which page answers.
  let p = path.split(/[?#]/)[0];
  // A `${...}` interpolation is one dynamic segment; so is a bare :id.
  p = p.replace(/\$\{[^}]+\}/g, 'X').replace(/:[a-zA-Z]+/g, 'X');
  return p;
}

describe('no admin button opens a dead door', () => {
  const matchers = realRouteMatchers();
  const files = [
    ...walk('src/app/admin'),
    ...walk('src/components/admin'),
    ...walk('src/lib/os'),
  ];
  const refs = referencedAdminPaths(files);

  it('found admin links to check (the scan is not silently empty)', () => {
    expect(refs.length).toBeGreaterThan(10);
    expect(matchers.length).toBeGreaterThan(20);
  });

  it('every /admin link resolves to a page that exists', () => {
    const dead: string[] = [];
    for (const { path, file } of refs) {
      const norm = normalize(path);
      // A dynamic segment placeholder 'X' must match the [^/?#]+ patterns.
      const probe = norm.replace(/X/g, 'concrete-id');
      if (!matchers.some((m) => m.test(probe))) {
        dead.push(`${path}  (in ${file.replace('src/', '')})`);
      }
    }
    expect(dead, `Dead doors found:\n${dead.join('\n')}`).toEqual([]);
  });
});
