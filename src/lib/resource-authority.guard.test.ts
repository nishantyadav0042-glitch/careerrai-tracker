/**
 * ── ONE resource authority, provable ────────────────────────────────────────
 *
 * Audit findings C1 and H1: routines are persisted as JSON and only rebuild on
 * a new day, so a resource resolved at generation time kept serving whatever
 * the inventory said when the row was written — including, before Layer A, a
 * practice video on a practice task. And `add-block` built tasks without ever
 * consulting the resolver.
 *
 * The fix is structural rather than corrective: a task never carries a resource
 * into storage at all, and every task acquires one at read time through a
 * single projection. These tests fail if either property is lost.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { projectTaskResources, resourceForTask, secondaryForTask } from './routine-engine';
import { TOPIC_RESOURCES } from './topic-resources';

const SRC = join(__dirname, '..');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const COVERED = Object.keys(TOPIC_RESOURCES)[0];

describe('C1 — a persisted task can never serve a stale resource', () => {
  it('discards a resource that was stored on the row', () => {
    // The exact production shape of the bug: a routine generated before Layer A
    // with a practice video welded onto a practising task.
    const stale = {
      id: 'qa-set',
      topic: COVERED,
      topicPhase: 'intensive' as const,
      resource: { intent: 'practice_easy', videoId: 'staleXXXXXXX', title: 'old', channel: 'x', realMinutes: 9 },
      secondary: { intent: 'practice_cat', videoId: 'stale2XXXXXX', title: 'old2', channel: 'x', realMinutes: 9 },
    };
    const projected = projectTaskResources(stale, 'practicing', 'foundation');
    // intensive resolves to nothing under Layer A, so the stale rows must go.
    expect(projected.resource).toBeNull();
    expect(projected.secondary).toBeNull();
  });

  it('re-resolves against the CURRENT inventory, not the stored one', () => {
    const stored = { topic: COVERED, topicPhase: 'foundation' as const, resource: { videoId: 'staleXXXXXXX' } };
    const projected = projectTaskResources(stored, 'learning', 'foundation');
    expect(projected.resource?.videoId).toBe(resourceForTask(COVERED, 'foundation')!.videoId);
    expect(projected.resource?.videoId).not.toBe('staleXXXXXXX');
  });

  it('does not destructively rewrite the rest of the task', () => {
    const stored = { id: 'x1', topic: COVERED, topicPhase: 'foundation' as const, target: 'Solve 15 questions', estMinutes: 30 };
    const projected = projectTaskResources(stored, 'learning', 'foundation');
    expect(projected.id).toBe('x1');
    expect(projected.target).toBe('Solve 15 questions');
    expect(projected.estMinutes).toBe(30);
  });

  it('falls back to live coverage for tasks written before topicPhase existed', () => {
    const legacy = { topic: COVERED, resource: { videoId: 'staleXXXXXXX' } };
    // practicing → intensive → nothing, so the legacy stale resource is dropped.
    expect(projectTaskResources(legacy, 'practicing', 'foundation').resource).toBeNull();
    // learning → foundation → the current concept video.
    expect(projectTaskResources(legacy, 'learning', 'foundation').resource?.videoId)
      .toBe(resourceForTask(COVERED, 'foundation')!.videoId);
  });

  it('uses the phase the target was worded for, not live coverage, when both exist', () => {
    // A student who advances the topic mid-day must not see the row contradict
    // an instruction that still says "Learn X".
    const task = { topic: COVERED, topicPhase: 'foundation' as const };
    expect(projectTaskResources(task, 'practicing', 'revision').resource).not.toBeNull();
  });
});

describe('C1 — generation never writes a resource into storage', () => {
  it('no task-construction path assigns resource or secondary', () => {
    // If a future edit resolves at generation again, the stale-resource class
    // of bug returns silently. The only legal place is the read-time projection.
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const rel = f.slice(SRC.length + 1);
      if (rel === 'lib/routine-engine.ts') continue; // owns the projection
      const code = strip(readFileSync(f, 'utf8'));
      if (/\bresource:\s*resourceForTask\(/.test(code) || /\bsecondary:\s*secondaryForTask\(/.test(code)) {
        offenders.push(rel);
      }
    }
    expect(offenders, 'resolve at read time via projectTaskResources instead').toEqual([]);
  });

  it('only the inventory and the engine may call the resolvers', () => {
    // topic-resources.ts is allowed because resourceByPreference and
    // resourceSecondary are defined there and delegate to resourceFor in the
    // same file — the inventory owning its own lookup, not a second authority.
    // routine-engine.ts is the resolver and the read-time projection.
    // Anything else appearing here is a second decision-maker.
    const callers: string[] = [];
    for (const f of walk(SRC)) {
      const rel = f.slice(SRC.length + 1);
      const code = strip(readFileSync(f, 'utf8'));
      if (/\b(resourceForTask|secondaryForTask|resourceByPreference|resourceSecondary)\s*\(/.test(code)) {
        callers.push(rel);
      }
    }
    expect(callers.sort()).toEqual(['lib/routine-engine.ts', 'lib/topic-resources.ts']);
  });
});

describe('H1 — no task-construction path can invent resource selection', () => {
  it('add-block records the phase and resolves nothing itself', () => {
    const code = strip(readFileSync(join(SRC, 'app/api/routine/add-block/route.ts'), 'utf8'));
    expect(code, 'must record the phase its target was worded for').toContain('topicPhase: phaseForTopic(');
    expect(code, 'must not resolve a resource itself').not.toContain('resourceForTask');
  });

  it('every route that returns tasks to the student projects them', () => {
    // Today exactly one route surfaces tasks. If another appears and forgets
    // the projection, its tasks silently carry no resource — or worse, a stale
    // one from storage.
    const surfacing = walk(join(SRC, 'app/api'))
      .filter((f) => /tasksWithStatus/.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(surfacing).toEqual(['app/api/routine/today/route.ts']);
    for (const f of surfacing) {
      expect(strip(readFileSync(join(SRC, f), 'utf8'))).toContain('projectTaskResources(');
    }
  });

  it('no client component resolves a resource for itself', () => {
    const offenders = walk(SRC)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /TOPIC_RESOURCES|resourceFor\s*\(/.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});

describe('the projection obeys the same contract as the resolver', () => {
  it('never yields a resource for a practice or revision task', () => {
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      for (const phase of ['intensive', 'revision'] as const) {
        const p = projectTaskResources({ topic, topicPhase: phase }, 'practicing', 'foundation');
        expect(p.resource, `${topic}/${phase}`).toBeNull();
        expect(p.secondary, `${topic}/${phase}`).toBeNull();
      }
    }
  });

  it('never yields a secondary without a primary', () => {
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      const p = projectTaskResources({ topic, topicPhase: 'foundation' as const }, 'learning', 'foundation');
      if (p.secondary) expect(p.resource, topic).not.toBeNull();
    }
  });

  it('handles a task with no topic without throwing', () => {
    const p = projectTaskResources({ topic: null }, null, 'foundation');
    expect(p.resource).toBeNull();
    expect(p.secondary).toBeNull();
  });

  it('agrees with the resolver it delegates to', () => {
    for (const topic of Object.keys(TOPIC_RESOURCES)) {
      const p = projectTaskResources({ topic, topicPhase: 'foundation' as const }, 'learning', 'foundation');
      expect(p.resource).toEqual(resourceForTask(topic, 'foundation'));
      expect(p.secondary).toEqual(secondaryForTask(topic, 'foundation'));
    }
  });
});
