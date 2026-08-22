import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// This repo's vitest environment is 'node' with no DOM, so the listener cannot
// be mounted and torn down here. The two properties that matter are structural
// and are asserted structurally rather than faked: it is subscribed in exactly
// ONE place, and the subscription is released when that place unmounts.

const NOTICE = 'src/components/session-loss-notice.tsx';
const notice = readFileSync(NOTICE, 'utf8');

function allSource(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) allSource(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('exactly one auth listener, at the student-layout boundary', () => {
  const sources = allSource('src');

  it('only one file subscribes to auth state changes at all', () => {
    const subscribers = sources.filter((f) => {
      const body = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      return body.includes('onAuthStateChange');
    });
    expect(subscribers).toEqual([NOTICE]);
  });

  it('it is mounted once, and the mount point is the student layout', () => {
    const mounts = sources.filter((f) => readFileSync(f, 'utf8').includes('<SessionLossNotice'));
    expect(mounts).toEqual(['src/app/student/layout.tsx']);
    const layout = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect((layout.match(/<SessionLossNotice/g) ?? []).length).toBe(1);
  });

  it('the effect subscribes with no dependencies, so navigation cannot stack listeners', () => {
    // A dependency array that changes would re-subscribe on every render of a
    // layout that never unmounts — the duplicate-listener bug this guards.
    expect(notice).toMatch(/\}\s*,\s*\[\]\s*\)\s*;/);
  });
});

describe('the subscription is released', () => {
  it('the effect returns an unsubscribe rather than leaking it', () => {
    const effectBody = notice.slice(notice.indexOf('useEffect('), notice.indexOf('if (!lost)'));
    expect(effectBody).toContain('unsubscribe()');
    expect(effectBody).toMatch(/return\s*\(\)\s*=>/);
  });
});

describe('the notice cannot drive navigation', () => {
  it('it never redirects, refreshes or reloads — that is the loop risk', () => {
    const code = notice.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/router\.(push|replace|refresh)/);
    expect(code).not.toMatch(/location\.(assign|replace|reload)/);
    expect(code).not.toMatch(/window\.location\s*=/);
  });

  it('recovery is a link the student chooses to follow', () => {
    expect(notice).toMatch(/href="\/login"/);
  });
});
