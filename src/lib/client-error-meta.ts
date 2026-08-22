// ── Making a client error identifiable without identifying the student ──────
//
// The 22 Aug hydration investigation stalled on a question the data could not
// answer: WHICH build, and WHICH kind of React failure. 42 collected #418
// reports carried app_version = null, so there was no way to tell whether a
// fix had landed, and the server fingerprint replaced every digit with 'N',
// which quietly folded React #418 (hydration mismatch) and #419 (a Suspense
// boundary that never finished) into one indistinguishable group.
//
// Neither gap needs a schema change and neither needs a third-party monitor.
// Both are pure functions so they can be tested without a browser.
//
// WHAT WE STILL CANNOT CAPTURE, stated rather than papered over: React's
// componentStack. Next's client passes onRecoverableError -> reportGlobalError,
// and report-global-error.js is `reportError(error)` — the errorInfo carrying
// componentStack is dropped before any handler we can register. React 19's
// owner stacks are development-only. So in a production build the component
// behind a hydration mismatch is genuinely not observable from the client, and
// nothing here pretends otherwise.

/** The deployment that served this page, read from the script URLs Next
 *  already stamps with `?dpl=`. Preferred over an env var because it needs no
 *  build configuration and it is the SAME identifier that appears inside the
 *  stack traces we collect, so an error and a build can be joined by eye. */
export function readDeploymentId(scriptUrls: readonly string[]): string | null {
  for (const url of scriptUrls) {
    const m = /[?&]dpl=(dpl_[A-Za-z0-9]+)/.exec(url ?? '');
    if (m) return m[1];
  }
  return null;
}

export interface ReactErrorMeta {
  /** e.g. '418'. Null when this is not a minified React error. */
  code: string | null;
  /** What React said diverged. Only meaningful for hydration errors. */
  mismatch: 'html' | 'text' | null;
}

/** React's minified errors carry their code and their arguments in the URL
 *  they point at: `#418; visit https://react.dev/errors/418?args[]=HTML`.
 *  That first arg is the difference between "the element shape differed" and
 *  "the text differed" — two different bugs that must not share a group. */
export function describeReactError(message: string): ReactErrorMeta {
  const code = /Minified React error #(\d+)/.exec(message)?.[1] ?? null;
  if (!code) return { code: null, mismatch: null };
  const arg = /[?&]args\[\]=(HTML|text)\b/i.exec(message)?.[1];
  return {
    code,
    mismatch: arg ? (arg.toLowerCase() as 'html' | 'text') : null,
  };
}

/** What makes two reports the same bug. React errors keep their code and
 *  mismatch kind; everything else keeps the previous behaviour of blanking
 *  digits, which stops a line number or a timestamp from splitting one bug
 *  into hundreds. */
export function fingerprintFor(message: string, file: unknown, line: unknown): string {
  const react = describeReactError(message);
  if (react.code) {
    return `react#${react.code}:${react.mismatch ?? 'unknown'}`;
  }
  return [
    message.replace(/\d+/g, 'N').slice(0, 120),
    String(file ?? '').split('/').pop() ?? '',
    String(line ?? ''),
  ].join('|');
}
