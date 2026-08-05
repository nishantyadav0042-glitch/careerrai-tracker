import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { disconnectGoogle } from '@/lib/google-oauth';

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await disconnectGoogle(user.id);
  return NextResponse.json({ ok: true });
}
