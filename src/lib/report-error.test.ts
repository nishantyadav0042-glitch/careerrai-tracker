import { describe, it, expect } from 'vitest';
import { errorText } from './report-error';

// Every case below exists because the first version of this module got it
// wrong in a way that mattered: it used `e instanceof Error ? e.message :
// String(e)`, and Supabase errors are plain objects. The reporter built so
// Incident #14 could never go unlogged would have logged Incident #14 as
// "[object Object]".

describe('errorText — the Supabase shape, which is the whole point', () => {
  it('reads a PostgrestError, which is a plain object and NOT an Error', () => {
    // This is the literal shape postgrest-js returns for the incident.
    const postgrestError = {
      message: 'permission denied for function is_admin',
      details: null,
      hint: null,
      code: '42501',
    };
    expect(errorText(postgrestError)).toBe('permission denied for function is_admin [42501]');
  });

  it('never returns "[object Object]" for any object shape', () => {
    const shapes: unknown[] = [
      { message: 'boom' },
      { message: 'boom', details: 'because', hint: 'try this', code: 'X1' },
      { code: 'PGRST301' },
      { error: 'weird', status: 500 },
      {},
    ];
    for (const s of shapes) {
      expect(errorText(s), JSON.stringify(s)).not.toContain('[object Object]');
      expect(errorText(s).length).toBeGreaterThan(0);
    }
  });

  it('keeps details and hint, where the actionable part usually lives', () => {
    const e = { message: 'insert violates policy', details: 'row 3', hint: 'check RLS', code: '42501' };
    const text = errorText(e);
    expect(text).toContain('row 3');
    expect(text).toContain('check RLS');
  });
});

describe('errorText — everything else it can be handed', () => {
  it('handles a real Error', () => {
    expect(errorText(new Error('network down'))).toBe('network down');
  });

  it('falls back to the name when an Error has no message', () => {
    expect(errorText(new TypeError())).toBe('TypeError');
  });

  it('handles a bare string', () => {
    expect(errorText('Failed to fetch')).toBe('Failed to fetch');
  });

  it('returns empty for null and undefined, so nothing is reported', () => {
    expect(errorText(null)).toBe('');
    expect(errorText(undefined)).toBe('');
  });

  it('survives a circular object rather than throwing inside the reporter', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => errorText(circular)).not.toThrow();
    expect(errorText(circular).length).toBeGreaterThan(0);
  });

  it('never returns a giant string that would be truncated server-side anyway', () => {
    const big = { blob: 'x'.repeat(5000) };
    expect(errorText(big).length).toBeLessThanOrEqual(400);
  });
});
