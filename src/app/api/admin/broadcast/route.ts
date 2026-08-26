import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';
import { readRowsForIds } from '@/lib/truth/batch';
import { isUnavailable } from '@/lib/truth/source';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, body, recipientIds } = await request.json();
  if (!title || !body || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Through dispatch(), one recipient at a time. As a bulk in-app insert this
  // reached only students who happened to open the bell; each now gets a real
  // delivery attempt against their own preferences, and each is individually
  // counted. One student's failure never stops the broadcast.
  // Bounded, all-or-nothing (B3b gate 1): an unbounded .in() here is a
  // population-scaled read on a path that mutates student state, and a
  // partial read would broadcast against the WRONG preferences — silently
  // pushing to students who turned push off. A read we cannot complete
  // refuses the whole broadcast rather than half-honouring it.
  const prefsSource = await readRowsForIds<string, { id: string; notif_prefs: unknown }>(
    'profiles(broadcast recipients)', recipientIds as string[],
    (chunk) => admin.from('profiles').select('id, notif_prefs').in('id', chunk),
  );
  if (isUnavailable(prefsSource)) {
    return NextResponse.json(
      { error: `Could not read recipient preferences (${prefsSource.reason}) — broadcast refused rather than sent against unknown settings.` },
      { status: 503 },
    );
  }
  const prefsById = new Map<string, Record<string, unknown>>(
    (prefsSource.state === 'value' ? prefsSource.value : [])
      .map((r) => [r.id, (r.notif_prefs as Record<string, unknown>) ?? {}]),
  );

  let sent = 0;
  let failed = 0;
  for (const uid of recipientIds as string[]) {
    try {
      const outcome = await dispatch({
        userId: uid,
        type: 'broadcast',
        title,
        body,
        url: '/student/tracker',
        reason: 'Admin broadcast',
        expectedAction: 'acknowledge',
        prefs: prefsById.get(uid) ?? {},
      });
      if (outcome === 'sent') sent++; else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, audience: recipientIds.length });
}
