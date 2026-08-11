import { NextResponse } from 'next/server';

// The one question a running client may ask: "which deployment is live?"
//
// Exists for DeployFreshness (components/deploy-freshness.tsx). On 11 Aug the
// founder shipped ten builds to production and then reported "nothing is
// live" — his installed app had been open since before the deploy and was
// still running the client bundle it launched with. Nothing anywhere told the
// old client a new build existed. This endpoint is that telling.
//
// force-dynamic + no-store: a cached answer here would defeat the entire
// purpose — the response must always come from the deployment that is live
// RIGHT NOW, never from a CDN copy of an older one.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { dpl: process.env.VERCEL_DEPLOYMENT_ID ?? 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
