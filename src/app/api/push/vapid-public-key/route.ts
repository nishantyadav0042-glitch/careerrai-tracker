import { NextResponse } from 'next/server';
import { getServerConfig } from '@/lib/server-config';

// Serves the VAPID public key to the client so it can subscribe to push.
// Reads from env first, then the server_config table — so push works without a
// build-time NEXT_PUBLIC_ env var. The public key is, by design, public.
export async function GET() {
  // DB-authoritative (no env) so it always matches the private key the server
  // signs with — see lib/push.ts.
  const key = await getServerConfig('VAPID_PUBLIC_KEY');
  if (!key) return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  return NextResponse.json({ key });
}
