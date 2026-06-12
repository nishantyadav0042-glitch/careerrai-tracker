import { readFileSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

/**
 * Seed script to populate daily LRDI detective cases for the next 30 days.
 * Cases are CAT-level medium sets played as an interactive "detective game"
 * (arrange suspects on the evidence board, then answer CAT-style questions).
 *
 * Run: npx ts-node scripts/seed-daily-puzzles.ts
 */

interface GameSet {
  type: string;
  difficulty: number;
  estimatedTime: number;
  content: Record<string, unknown>;
  solutionText: string;
  explanation: string;
}

const sets: GameSet[] = JSON.parse(
  readFileSync(join(__dirname, 'lrdi-game-sets.json'), 'utf-8')
);

async function seedPuzzles() {
  const admin = createAdminClient();

  console.log('🕵️ Seeding CAT Detective cases...\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const puzzles = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const set = sets[i % sets.length];

    puzzles.push({
      puzzle_date: dateStr,
      puzzle_type: set.type,
      difficulty: set.difficulty,
      difficulty_description: set.difficulty <= 6 ? 'Medium' : 'Hard',
      estimated_time_minutes: set.estimatedTime,
      puzzle_content: set.content,
      solution: set.solutionText,
      explanation: set.explanation,
    });
  }

  console.log(`📋 Generated ${puzzles.length} cases (${sets.length} unique sets, rotating)\n`);

  try {
    const { data, error } = await admin
      .from('daily_lrdi_puzzles')
      .upsert(puzzles, { onConflict: 'puzzle_date' })
      .select();

    if (error) {
      console.error('❌ Error inserting cases:', error.message);
      process.exit(1);
    }

    console.log(`✅ Successfully seeded ${data?.length || 0} cases`);
    console.log('\n✨ Seed complete!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

seedPuzzles();
