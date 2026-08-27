import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EVENT_POLICY, EVENT_PREFIX_POLICY, hasDeclaredPolicy, policyFor, chooseChannels, isPaidChannel } from './event-policy';
import { STUDENT_BUDGET_TYPES } from './notification-os';

// ── The registry IS the catalogue, or it is decoration ─────────────────────
//
// event-policy.ts is now the live channel authority: dispatch() asks it which
// rails to try. That promotion is only safe while the table covers EVERY type
// dispatch() actually emits. On 27 Aug it covered 25 of 57, and policyFor()
// quietly returned DEFAULT_POLICY for the other 32 — invisible, because
// DEFAULT_POLICY happens to be push-only and push-only happened to be right.
//
// "The default happens to be right" is not a property you can keep. The
// moment a type needs email, WhatsApp or a quiet-hour exemption, silence is
// the failure mode. This guard makes the coverage a build condition.
//
// It also pins the two equivalences that made the wiring a no-op, because
// they are exactly what a future edit will break without noticing:
//   · every ladder contains push  → wantsPush == the old prefs.push === true
//   · every email-leg caller's type declares email → no silent email loss
//
// That second one is not hypothetical. FOUR live types — red_flag,
// activation, onboarding_evening, builder_recovery — pass an email leg to
// dispatch() and had NO email in their ladder. Wiring the table as it stood
// would have killed a mentor's red-flag email and three student recovery
// emails, and not one of the 3,763 tests would have failed.

const SRC = 'src';
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every dispatch() call site, with its literal type and whether it sends email. */
function callSites(): Array<{ file: string; type: string; email: boolean }> {
  const out: Array<{ file: string; type: string; email: boolean }> = [];
  for (const file of tsFiles(SRC)) {
    const code = strip(readFileSync(file, 'utf8'));
    let i = 0;
    while ((i = code.indexOf('dispatch(', i)) !== -1) {
      const before = code.slice(Math.max(0, i - 30), i);
      if (/function\s+$/.test(before) || /\w\.$/.test(before)) { i += 9; continue; }
      const win = code.slice(i, i + 1400);
      const m = win.match(/\btype:\s*'([^']+)'/);
      // `email:` followed by an object OR a ternary/guard that yields one.
      const email = /\bemail:\s*(\{|[A-Za-z_$][\w$.]*\s*(\?|&&))/.test(win);
      if (m) out.push({ file, type: m[1], email });
      i += 9;
    }
  }
  return out;
}

/**
 * Types built at runtime. Each is resolved from its PRODUCER, so this list
 * cannot rot into a hand-maintained fiction: if study-companion gains a slot
 * or decision-engine gains an event, it appears here automatically.
 */
function runtimeTypes(): string[] {
  const companion = [...strip(readFileSync('src/lib/companion.ts', 'utf8'))
    .matchAll(/'(kickoff|morning|spark|fact|open|wind|progress|log|close)'/g)]
    .map((m) => `companion_${m[1]}`);
  const decision = [...strip(readFileSync('src/lib/decision-engine.ts', 'utf8'))
    .matchAll(/type:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  return [...new Set([...companion, ...decision, 'brain_example_action_id'])];
}

const sites = callSites();
const liveTypes = [...new Set([...sites.map((s) => s.type), ...runtimeTypes()])].sort();

describe('every live event has exactly one declared policy', () => {
  it('the extractor still finds the call sites (the guard is a guard)', () => {
    // Every string-matching guard's failure mode is finding nothing.
    expect(sites.length).toBeGreaterThan(30);
    expect(runtimeTypes().length).toBeGreaterThan(10);
  });

  it('no dispatched type falls through to DEFAULT_POLICY', () => {
    const undeclared = liveTypes.filter((t) => !hasDeclaredPolicy(t));
    expect(
      undeclared,
      'These types reach dispatch() with no entry in EVENT_POLICY, so their channels come from DEFAULT_POLICY — a silent push-only fallback that will be wrong the day one of them needs email or a quiet-hour exemption. Register each one:\n  ' +
        undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('no registry entry is obsolete — nothing registered that nobody emits', () => {
    const emitted = new Set(liveTypes);
    const orphans = Object.keys(EVENT_POLICY).filter((t) => !emitted.has(t));
    expect(
      orphans,
      'Registered but never dispatched. A policy for an event that does not exist is a claim the codebase cannot honour, and it hides the fact that the producer was never built:\n  ' +
        orphans.join('\n  '),
    ).toEqual([]);
  });

  it('the prefix families resolve to a declared policy, never the default', () => {
    for (const [prefix] of EVENT_PREFIX_POLICY) {
      expect(hasDeclaredPolicy(`${prefix}anything`)).toBe(true);
    }
  });
});

describe('the wiring is a no-op — these are the two equivalences that make it so', () => {
  it('EVERY ladder contains push, so the policy cannot silently mute a push', () => {
    // dispatch() used to push whenever prefs.push === true, for every type.
    // The substitution is only behaviour-preserving while that stays true.
    const muted = Object.entries(EVENT_POLICY)
      .filter(([, p]) => !p.ladder.includes('push'))
      .map(([t]) => t);
    expect(
      muted,
      'Removing push from a ladder now STOPS a push that production sends today. If that is intended it is a product change and belongs in its own commit with its own note — not a table edit:\n  ' +
        muted.join('\n  '),
    ).toEqual([]);
  });

  it('every caller that passes an email leg has email in its ladder', () => {
    const broken = sites
      .filter((s) => s.email)
      .filter((s) => !policyFor(s.type).ladder.includes('email'))
      .map((s) => `${s.type}  (${s.file})`);
    expect(
      broken,
      'This caller builds an email and hands it to dispatch(), but the policy does not list email for that type — so the email is silently dropped. This is exactly how red_flag, activation, onboarding_evening and builder_recovery would have gone dark:\n  ' +
        broken.join('\n  '),
    ).toEqual([]);
  });

  it('the email-leg set is still the five we reconciled — a new one must be deliberate', () => {
    const withEmail = [...new Set(sites.filter((s) => s.email).map((s) => s.type))].sort();
    expect(withEmail).toEqual(
      ['activation', 'builder_recovery', 'onboarding_evening', 'red_flag', 'weekly_digest'],
    );
  });
});

describe('constitutional invariants, enforced on the live path', () => {
  it('invariant 2 — no budgeted daily-ladder type may ride a paid rail', () => {
    const offenders = STUDENT_BUDGET_TYPES
      .filter((t) => hasDeclaredPolicy(t))
      .filter((t) => policyFor(t).ladder.some(isPaidChannel))
      .map((t) => `${t} -> ${policyFor(t).ladder.join('+')}`);
    expect(
      offenders,
      'EVENT-OS invariant 2. A daily nudge on WhatsApp is roughly ₹98,000/month at 3,000 students, and it is the kind of traffic Meta classifies as marketing:\n  ' +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the in-app floor holds for a user who can receive nothing', () => {
    const nothing = { push: false, whatsapp: false, email: false, calendar: false };
    for (const type of Object.keys(EVENT_POLICY)) {
      expect(chooseChannels(type, nothing), `${type} left a student with no record at all`).toContain('in_app');
    }
  });

  it('a capability the user lacks is never used, however the ladder is written', () => {
    const nothing = { push: false, whatsapp: false, email: false, calendar: false };
    for (const type of Object.keys(EVENT_POLICY)) {
      expect(chooseChannels(type, nothing)).toEqual(['in_app']);
    }
  });
});

describe('dispatch has no second channel decision left in it', () => {
  const code = strip(readFileSync('src/lib/notification-os.ts', 'utf8'));

  it('it asks the policy', () => {
    expect(code).toMatch(/chooseChannels\(opts\.type, caps\)/);
  });

  it('WhatsApp is declared unavailable rather than quietly assumed', () => {
    // The day the transport lands, this flips to a real capability read and
    // every ladder that names WhatsApp starts working at once.
    expect(code).toMatch(/whatsapp:\s*false/);
  });

  it('no branch decides a channel from prefs directly any more', () => {
    // The old form. Its survival anywhere means two authorities again.
    expect(code).not.toMatch(/if\s*\(\s*opts\.prefs\.push\s*===\s*true/);
    expect(code).not.toMatch(/if\s*\(\s*opts\.email\s*&&\s*opts\.prefs\.email/);
  });
});
