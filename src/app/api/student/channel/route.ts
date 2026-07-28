import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerConfig } from '@/lib/server-config';
import { isChannelId, CHANNEL_CONFIG_KEY, type ChannelId } from '@/lib/channels';

// GET  /api/student/channel        → should we ask? and what's the join URL?
// POST /api/student/channel        → record clicked / joined / dismissed
//
// The join URL lives in server_config (falling back to an env var), so the
// founder can change or replace the channel without a deploy — he runs this
// alone and a redeploy to swap a link is friction he does not need.

const DEFAULT_CHANNEL: ChannelId = 'whatsapp';

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const param = request.nextUrl.searchParams.get('channel');
  const channel: ChannelId = isChannelId(param) ? param : DEFAULT_CHANNEL;

  const url = await getServerConfig(CHANNEL_CONFIG_KEY[channel], CHANNEL_CONFIG_KEY[channel]);
  // No link configured yet → never ask. Better silent than a broken prompt.
  if (!url) return NextResponse.json({ ask: false, reason: 'not_configured' });

  const admin = createAdminClient();
  const { data } = await admin
    .from('student_channels')
    .select('joined_at, dismissed_at, prompted_at')
    .eq('student_id', user.id).eq('channel', channel)
    .maybeSingle();

  return NextResponse.json({
    ask: !data?.joined_at,
    channel,
    url,
    joinedAt: data?.joined_at ?? null,
    promptedAt: data?.prompted_at ?? null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    channel?: unknown; action?: unknown; source?: unknown;
  };
  const channel: ChannelId = isChannelId(body.channel) ? body.channel : DEFAULT_CHANNEL;
  const action = body.action;
  if (action !== 'prompted' && action !== 'clicked' && action !== 'joined' && action !== 'dismissed') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const stamp: Record<string, string> = { [`${action}_at`]: now };

  const admin = createAdminClient();
  const { error } = await admin.from('student_channels').upsert({
    student_id: user.id,
    channel,
    source: typeof body.source === 'string' ? body.source.slice(0, 40) : null,
    ...stamp,
    updated_at: now,
  }, { onConflict: 'student_id,channel' });

  if (error) {
    console.error('[channel] could not record', action, error.message);
    // Never let bookkeeping block the student — they still get their link.
    return NextResponse.json({ ok: true, recorded: false });
  }
  return NextResponse.json({ ok: true, recorded: true });
}
