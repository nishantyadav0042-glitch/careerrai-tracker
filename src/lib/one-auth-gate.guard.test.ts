import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── One gate per door, and none of them lies about an outage ───────────────
//
// 21 Aug. Fixing requireAdmin was not enough: 37 pages carried their own
// inline copy of the same check, so the fix reached almost none of the app.
// Three of those copies were LAYOUTS — they gate an entire section, and a
// flaky profiles read there logs someone out of everything under them.
//
// The buddy layout is the reason this guard exists rather than a comment. It
// had the same root defect pointing BOTH ways at once:
//   · slow path: `profile?.role !== 'buddy'` → a failed read threw a real
//     buddy out to /login
//   · cookie fast path: it tested only for admin and student, so a failed
//     read matched neither, fell through, and RETURNED THE CHILDREN
// The same broken read locked the right person out and let the wrong person
// in, twenty lines apart.
//
// A copy of a security check is a copy of its bugs. There is one gate per
// door now, and this walks the tree to keep it that way.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function pages(dir: string): string[] {
  const abs = join(ROOT, dir);
  try { statSync(abs); } catch { return []; }
  return readdirSync(abs).flatMap((e) => {
    const p = join(abs, e);
    return statSync(p).isDirectory() ? pages(join(dir, e))
      : /(page|layout)\.tsx$/.test(e) ? [join(dir, e)] : [];
  });
}

const GATED = [...pages('src/app/admin'), ...pages('src/app/sales'), ...pages('src/app/buddy')];

describe('no page rolls its own role check', () => {
  it('finds the gated sections at all — the walk is not vacuously empty', () => {
    expect(GATED.length).toBeGreaterThan(25);
  });

  // Reading `role` is FINE — several buddy screens select it alongside the
  // name and avatar they render. What is forbidden is DECIDING from a read
  // whose error was never inspected. The first version of this test matched
  // the string select('role and flagged three innocent data reads, which is
  // the same mistake in miniature: encode the idea, not the characters.
  it('no gated file decides access from an unchecked read', () => {
    const DECIDES = /(me|profile|adminProfile)\?\.role\s*(!==|===)[\s\S]{0,80}(redirect|notFound)/;
    const offenders = GATED.filter((f) => DECIDES.test(code(f)));
    expect(offenders, 'these turn a read that may have failed into "not allowed"').toEqual([]);
  });

  it('any file that still gates on a role uses a canonical helper to get it', () => {
    const offenders = GATED.filter((f) => {
      const s = code(f);
      const gates = /role\s*(!==|===)\s*'(admin|buddy|sales)'/.test(s);
      return gates && !/requireAdmin|requireSales|requireBuddy/.test(s);
    });
    expect(offenders, 'use requireAdmin / requireSales / requireBuddy').toEqual([]);
  });
});

describe('the three section gates all go through the canonical helpers', () => {
  it.each([
    ['src/app/admin/layout.tsx', 'requireAdmin'],
    ['src/app/sales/layout.tsx', 'requireSales'],
    ['src/app/buddy/layout.tsx', 'requireBuddy'],
  ])('%s uses %s', (file, helper) => {
    expect(code(file)).toContain(helper);
  });

  it('every helper reads the role through the one honest primitive', () => {
    const s = code('src/lib/admin-auth.ts');
    for (const fn of ['requireAdmin', 'requireBuddy', 'requireSales']) {
      const body = s.slice(s.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 400), `${fn} must use readRole`).toContain('readRole');
    }
  });

  it('a wrong-but-known role goes home, not to the login screen', () => {
    // Sending a signed-in person to /login is its own small lie — they are
    // signed in, they just took a wrong door.
    const s = code('src/lib/admin-auth.ts');
    expect(s).toContain('homeForRole');
  });
});
