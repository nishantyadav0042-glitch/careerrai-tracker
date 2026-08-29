import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── EVERY ACTION RUNS AT A SHA WE CHOSE ─────────────────────────────────────
//
// A tag is a mutable pointer. `actions/checkout@v4` means "whatever the owner
// of that repository decides v4 means, at the moment CI runs" — and CI runs
// with a token that can read this repository and push to it. That is the exact
// shape of the trivy-action and kics-github-action compromises: the tag moved,
// and every consumer executed new code without changing a line.
//
// This was 13 of the 16 findings that kept the `security` workflow red on
// every commit to main for long enough that the gate stopped being read
// (Incident #48). Fixing them once is not the same as fixing them: the next
// person to add a step will copy the syntax from the docs, which uses a tag.
// So the rule lives here, where it fails in the same run as everything else.
//
// The trailing `# v4` comment is not decoration — Dependabot reads it to know
// which tag to track, and a human reads it to know what the SHA is.

const WORKFLOWS = join(__dirname, '..', '..', '.github', 'workflows');

/** `uses:` values that are not third-party actions and cannot be pinned. */
const NOT_PINNABLE = /^\.\/|^docker:\/\//;

const steps = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .flatMap((file) => {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    return [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)]
      .map((m, i) => ({ file, ref: m[1], rest: m[2], index: i }));
  });

describe('GUARD: every GitHub Action is pinned to a commit SHA', () => {
  it('there are actions to check — an empty sweep must not pass silently', () => {
    // Without this, a rename of .github/workflows turns this whole file into a
    // vacuous pass, which is the failure mode of every glob-based guard.
    expect(steps.length).toBeGreaterThan(5);
  });

  it('no step uses a mutable tag or branch', () => {
    const unpinned = steps
      .filter((s) => !NOT_PINNABLE.test(s.ref))
      .filter((s) => !/@[0-9a-f]{40}$/.test(s.ref))
      .map((s) => `${s.file}: ${s.ref}`);
    expect(
      unpinned,
      'pin these to a full 40-character commit SHA:\n  ' + unpinned.join('\n  ')
        + '\n\nResolve one with:  git ls-remote --tags https://github.com/<owner>/<repo> "refs/tags/<tag>^{}"',
    ).toEqual([]);
  });

  it('each pin still says which version it is, so it can be read and updated', () => {
    const undocumented = steps
      .filter((s) => /@[0-9a-f]{40}$/.test(s.ref))
      .filter((s) => !/#\s*v?[0-9]/.test(s.rest))
      .map((s) => `${s.file}: ${s.ref}`);
    expect(
      undocumented,
      'add a trailing "# v4" comment — Dependabot tracks the tag through it:\n  '
        + undocumented.join('\n  '),
    ).toEqual([]);
  });

  it('an updater exists, so the pins do not freeze at today s security fixes', () => {
    const cfg = join(__dirname, '..', '..', '.github', 'dependabot.yml');
    expect(existsSync(cfg), 'pinning without an updater trades one risk for another').toBe(true);
    expect(readFileSync(cfg, 'utf8')).toMatch(/package-ecosystem:\s*github-actions/);
  });
});
