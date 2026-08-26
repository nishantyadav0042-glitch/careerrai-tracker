import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── Every signOut states its scope, deliberately ───────────────────────────
//
// auth-js defaults to `signOut(options = { scope: 'global' })` — verified in
// node_modules/@supabase/auth-js/dist/main/GoTrueClient.js. A bare
// `signOut()` therefore revokes EVERY refresh token the user holds, on every
// device they own.
//
// That default is how "log out on the laptop" silently killed the session in
// the student's installed phone app: the phone kept working until its next
// refresh, then died and bounced to /login with no explanation. It is a
// leading cause of the forced-relogin incident, and nobody ever chose it.
//
// The rule: a bare signOut() is forbidden. Ending a session is a product
// decision and must be written down at the call site — 'local' for a logout,
// 'global' only where security genuinely demands every device die at once.

const SRC = 'src';

/** Call sites permitted to use scope:'global', with the reason. */
const GLOBAL_ALLOWED: Record<string, string> = {
  'src/app/api/account/delete/route.ts':
    'The account is being destroyed. Every session on every device must die with it.',
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const ALL_SIGNOUTS = /\.signOut\s*\(/g;
const BARE_SIGNOUT = /\.signOut\s*\(\s*\)/;
const GLOBAL_SIGNOUT = /\.signOut\s*\(\s*\{[^}]*scope:\s*['"`]global['"`]/;

describe('signOut scope is always a decision, never a default', () => {
  const files = tsFiles(SRC).map((f) => [f, stripComments(readFileSync(f, 'utf8'))] as const);
  const callers = files.filter(([, code]) => ALL_SIGNOUTS.test(code) && (ALL_SIGNOUTS.lastIndex = 0) === 0);

  it('no bare signOut() anywhere — the global default must never be inherited', () => {
    const bare = callers.filter(([, code]) => BARE_SIGNOUT.test(code)).map(([f]) => f);
    expect(
      bare,
      `Bare signOut() inherits scope:'global' and kills the user's session on EVERY device — the forced-relogin bug. Pass { scope: 'local' } for a normal logout:\n  ${bare.join('\n  ')}`,
    ).toEqual([]);
  });

  it("scope:'global' appears only where destroying every session is the point", () => {
    const globals = callers.filter(([, code]) => GLOBAL_SIGNOUT.test(code)).map(([f]) => f);
    const unapproved = globals.filter((f) => !(f in GLOBAL_ALLOWED));
    expect(
      unapproved,
      `scope:'global' logs the user out of every device at once. That is a security action, not a logout. Use 'local' unless this file belongs in GLOBAL_ALLOWED with a reason:\n  ${unapproved.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the ordinary logout door is local', () => {
    const code = stripComments(readFileSync('src/app/api/auth/logout/route.ts', 'utf8'));
    expect(code).toMatch(/signOut\s*\(\s*\{\s*scope:\s*['"`]local['"`]\s*\}\s*\)/);
  });

  it('account deletion stays global — the one place it is correct', () => {
    const code = stripComments(readFileSync('src/app/api/account/delete/route.ts', 'utf8'));
    expect(code).toMatch(/signOut\s*\(\s*\{\s*scope:\s*['"`]global['"`]\s*\}\s*\)/);
  });
});
