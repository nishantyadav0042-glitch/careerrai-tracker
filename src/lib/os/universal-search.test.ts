import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { PALETTE_COMMANDS } from './universal-search';
import { ENTITY_GRAPH } from './entity-graph';

// The palette can only take you where a page exists.
//
// Founder: "navigate anywhere." A command that routes to a 404 is a dead key,
// and a dead key in a tool you reach for on muscle memory is worse than a
// missing one. Every static destination must resolve to a real page.

function pageExists(route: string): boolean {
  // Strip a trailing :id-style segment for dynamic routes; the palette's static
  // commands are all concrete, so this is really just a file-exists check.
  const clean = route.split('?')[0];
  return existsSync(`src/app${clean}/page.tsx`);
}

describe('every command-palette destination is a real page', () => {
  it('no command routes to a 404', () => {
    const dead = PALETTE_COMMANDS.filter((c) => !pageExists(c.route));
    expect(
      dead.map((c) => `${c.title} → ${c.route}`),
      'these palette commands point at pages that do not exist',
    ).toEqual([]);
  });

  it('has both navigation and action groups', () => {
    // "Navigate anywhere AND run admin actions." Both must be present.
    expect(PALETTE_COMMANDS.some((c) => c.group === 'go')).toBe(true);
    expect(PALETTE_COMMANDS.some((c) => c.group === 'act')).toBe(true);
  });

  it('every command has a unique id', () => {
    const ids = PALETTE_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('search hits open through the entity graph', () => {
  it('every entity kind the search can return has a route', () => {
    // universalSearch returns student, buddy, payment, coupon. Each must be a
    // graph entity so its route comes from the one place routes are defined.
    for (const kind of ['student', 'buddy', 'payment', 'coupon'] as const) {
      expect(ENTITY_GRAPH[kind]).toBeDefined();
      expect(ENTITY_GRAPH[kind].route).toMatch(/^\/admin/);
    }
  });
});
