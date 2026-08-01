import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

// POST /api/client-error — crash reporting for a TWA.
//
// Play Console reports native crashes and ANRs, but CareerRai's Android app is
// a Trusted Web Activity: a JavaScript error inside the webview never reaches
// Play, and Crashlytics (a native SDK) cannot see it either. Without this
// endpoint, the first signal that a screen is broken on some Android build
// would be a 1-star review. Server errors already land in security_events via
// instrumentation.ts; this is the missing client half.
//
// Deliberately permissive about auth: an error thrown before/while the session
// resolves is exactly the kind we most need to see, so an anonymous report is
// still accepted (student_id null). Deliberately strict about volume: a render
// loop must not be able to write a million rows.

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_PER_STUDENT_PER_HOUR = 20;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.message !== 'string' || body.message.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Never let error reporting itself break the app — every failure below
  // returns ok:true, because a client that retries a failing report is worse
  // than a lost report.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createAdminClient();

    if (user) {
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from('client_errors')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id).gte('created_at', hourAgo);
      if ((count ?? 0) >= MAX_PER_STUDENT_PER_HOUR) {
        return NextResponse.json({ ok: true, throttled: true });
      }
    }

    const message = String(body.message).slice(0, MAX_MESSAGE);
    // Fingerprint = what makes two reports "the same bug". Line/col are
    // included because the same generic message from two places is two bugs.
    const fingerprint = [
      message.replace(/\d+/g, 'N').slice(0, 120),
      String(body.file ?? '').split('/').pop() ?? '',
      String(body.line ?? ''),
    ].join('|');

    await admin.from('client_errors').insert({
      student_id: user?.id ?? null,
      fingerprint,
      message,
      // 'handled' = an error we caught and showed the student (see
      // lib/report-error.ts). Kept as its own value rather than folded into
      // 'error', because a message a student actually read is worth more than
      // a stack nobody saw, and we want to be able to query for exactly those.
      source: body.source === 'unhandledrejection' || body.source === 'handled'
        ? body.source
        : 'error',
      stack: typeof body.stack === 'string' ? body.stack.slice(0, MAX_STACK) : null,
      path: typeof body.path === 'string' ? body.path.slice(0, 200) : null,
      display_mode: typeof body.displayMode === 'string' ? body.displayMode.slice(0, 40) : null,
      install_source: typeof body.installSource === 'string' ? body.installSource.slice(0, 20) : null,
      browser: typeof body.browser === 'string' ? body.browser.slice(0, 40) : null,
      platform: typeof body.platform === 'string' ? body.platform.slice(0, 40) : null,
      app_version: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : null,
    });
  } catch (e) {
    console.error('[client-error] could not record', e);
  }
  return NextResponse.json({ ok: true });
}
