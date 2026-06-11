import { createAdminClient } from '../src/lib/supabase/admin';

/**
 * Seed script to populate daily LRDI puzzles for the next 30 days
 * Run: npx ts-node scripts/seed-daily-puzzles.ts
 */

const puzzleTypes = ['seating', 'blood_relation', 'constraint', 'arrangement'];
const samplePuzzles: Record<string, any> = {
  seating: {
    description: 'Seating arrangement puzzle',
    setup: 'Six people (A, B, C, D, E, F) sit around a circular table...',
    clues: [
      'A sits opposite to C',
      'B is not adjacent to D',
      'E sits to the left of F',
    ],
    questions: [
      'Who sits between A and B?',
      'What is the clockwise order starting from A?',
    ],
  },
  blood_relation: {
    description: 'Blood relation puzzle',
    setup: 'Pointing to a woman, Raj said, "Her father is the only son of my father"...',
    relationship: 'The woman is Raj\'s daughter',
  },
  constraint: {
    description: 'Constraint-based logic puzzle',
    setup: 'Five projects must be assigned to three teams...',
    constraints: [
      'Project A cannot be with Project B',
      'Project C must be with Team 1',
      'Each team gets at least one project',
    ],
  },
  arrangement: {
    description: 'Arrangement puzzle',
    setup: '8 floors building with specific conditions...',
  },
};

async function seedPuzzles() {
  const admin = createAdminClient();

  console.log('🌱 Starting puzzle seed...\n');

  // Generate 30 days of puzzles
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const puzzles = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const puzzleType = puzzleTypes[i % puzzleTypes.length] as keyof typeof samplePuzzles;
    const difficulty = (i % 10) + 1; // 1-10
    const estimatedTime = difficulty <= 3 ? 10 : difficulty <= 6 ? 15 : 20;

    puzzles.push({
      puzzle_date: dateStr,
      puzzle_type: puzzleType,
      difficulty,
      difficulty_description:
        difficulty <= 3 ? 'Beginner' : difficulty <= 6 ? 'Intermediate' : 'Advanced',
      estimated_time_minutes: estimatedTime,
      puzzle_content: samplePuzzles[puzzleType],
      solution: `Solution for ${puzzleType} puzzle on ${dateStr}`,
      explanation: `Step-by-step explanation for the ${puzzleType} puzzle`,
    });
  }

  console.log(`📋 Generated ${puzzles.length} puzzles for the next 30 days\n`);

  // Upsert puzzles (don't fail if already exist)
  try {
    const { data, error } = await admin
      .from('daily_lrdi_puzzles')
      .upsert(puzzles, { onConflict: 'puzzle_date' })
      .select();

    if (error) {
      console.error('❌ Error inserting puzzles:', error.message);
      process.exit(1);
    }

    console.log(`✅ Successfully seeded ${data?.length || 0} puzzles\n`);

    // Show breakdown by difficulty
    const byDifficulty = puzzles.reduce(
      (acc, p) => {
        const key =
          p.difficulty <= 3 ? 'Beginner' : p.difficulty <= 6 ? 'Intermediate' : 'Advanced';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('📊 Breakdown by difficulty:');
    Object.entries(byDifficulty).forEach(([level, count]) => {
      console.log(`   ${level}: ${count} puzzles`);
    });

    console.log('\n✨ Seed complete!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

seedPuzzles();
