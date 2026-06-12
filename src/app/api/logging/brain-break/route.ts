import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_GAMES = ['math_sprint', 'pattern_lock', 'memory_grid', 'sudoku_blitz'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { game_type: string; score: number; duration_seconds?: number };
    if (!VALID_GAMES.includes(body.game_type)) {
      return NextResponse.json({ error: 'Invalid game_type' }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from('brain_break_logs').insert({
      student_id: user.id,
      game_type: body.game_type,
      score: body.score ?? null,
      duration_seconds: body.duration_seconds ?? null,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Brain break log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
