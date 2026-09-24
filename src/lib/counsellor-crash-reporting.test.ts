import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { startCrashReporting } from '@/components/crash-reporter';
import { isCounsellorWorkspacePath } from './client-error-meta';

// ── The counsellor workspace reports its own errors ────────────────────────
//
// Founder, 24 Sep: "Add the crash logger to Anshul's workspace." Until then
// the reporter ran on student routes only, so every defect on /sales reached
// us the same way — the rep noticed, recorded a video, and told us. Zero
// client_errors rows from /sales meant "not measured", not "no errors".
//
// Three things are pinned here:
//   1. On /sales an uncaught error becomes one client_errors report carrying
//      the path, exactly as it does for a student.
//   2. The install-source stamp stays OFF there. That route writes the first
//      value it sees onto the caller's profile, and a rep is not an install.
//   3. A rep's error never moves a STUDENT metric (crash-free students).

type Listener = (e: unknown) => void;

function fakeBrowser(pathname: string) {
  const listeners: Record<string, Listener[]> = {};
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('window', {
    location: { pathname, search: '' },
    matchMedia: () => ({ matches: false }),
    addEventListener: (t: string, fn: Listener) => { (listeners[t] ??= []).push(fn); },
    removeEventListener: (t: string, fn: Listener) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn);
    },
  });
  vi.stubGlobal('document', { getElementsByTagName: () => [] });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; test device)', platform: 'Linux armv8l' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('fetch', fetchMock);
  const urls = () => fetchMock.mock.calls.map((c) => c[0]);
  const fire = (type: string, e: unknown) => (listeners[type] ?? []).forEach((fn) => fn(e));
  return { fetchMock, urls, fire };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the crash reporter on the counsellor workspace', () => {
  it('reports an uncaught error on /sales with its path', () => {
    const b = fakeBrowser('/sales/leads');
    const stop = startCrashReporting({ stampInstallSource: false });
    b.fire('error', { message: 'leads render failed', filename: 'leads.js', lineno: 7, error: new Error('x') });
    stop();

    const reports = b.fetchMock.mock.calls.filter((c) => c[0] === '/api/client-error');
    expect(reports).toHaveLength(1);
    const body = JSON.parse(String(reports[0][1]?.body));
    expect(body.path).toBe('/sales/leads');
    expect(body.message).toBe('leads render failed');
  });

  it('never stamps an install source for a counsellor', () => {
    const b = fakeBrowser('/sales');
    const stop = startCrashReporting({ stampInstallSource: false });
    stop();
    expect(b.urls()).not.toContain('/api/student/install-source');
  });

  it('the student side is unchanged: it still stamps the install source', () => {
    const b = fakeBrowser('/student/tracker');
    const stop = startCrashReporting({ stampInstallSource: true });
    stop();
    expect(b.urls()).toContain('/api/student/install-source');
  });

  it('stops reporting once unmounted', () => {
    const b = fakeBrowser('/sales/followups');
    const stop = startCrashReporting({ stampInstallSource: false });
    stop();
    b.fire('error', { message: 'after unmount', filename: 'f.js', lineno: 1 });
    expect(b.urls()).not.toContain('/api/client-error');
  });

  it('is mounted in the sales layout with the stamp off, and the student layout keeps it on', () => {
    const sales = readFileSync('src/app/sales/layout.tsx', 'utf8');
    expect(sales).toContain('<CrashReporter stampInstallSource={false} />');
    const student = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect(student).toContain('<CrashReporter />');
  });
});

describe("a counsellor's error is not a student's crash", () => {
  it('recognises the workspace by whole path segment', () => {
    for (const p of ['/sales', '/sales/', '/sales/leads', '/sales/student/abc']) {
      expect(isCounsellorWorkspacePath(p), p).toBe(true);
    }
    for (const p of ['/student/tracker', '/salesforce', '/admin/sales/tower', '', null, undefined]) {
      expect(isCounsellorWorkspacePath(p), String(p)).toBe(false);
    }
  });

  it('the crash-free-students metric reads student surfaces only', () => {
    const src = readFileSync('src/app/api/admin/launch-metrics/route.ts', 'utf8');
    expect(src).toMatch(/const studentErrs = \(errs24 \?\? \[\]\)\.filter\(\(e\) => !isCounsellorWorkspacePath\(e\.path\)\)/);
    // Every use of the error rows after that line goes through studentErrs.
    const after = src.slice(src.indexOf('const studentErrs'));
    expect(after.replace(/const studentErrs = \(errs24[^;]*;/, '')).not.toMatch(/errs24/);
  });
});
