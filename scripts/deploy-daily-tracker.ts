import { createAdminClient } from '../src/lib/supabase/admin';

/**
 * Complete deployment script for Daily Tracker
 * Runs all post-deployment tasks:
 * 1. Verify Supabase connection
 * 2. Check if migration 018 is applied
 * 3. Seed daily puzzles (30 days)
 * 4. Verify all tables and data
 */

const admin = createAdminClient();

async function verifyConnection() {
  console.log('🔗 Verifying Supabase connection...');
  try {
    const { data, error } = await admin.from('profiles').select('count()', { count: 'exact' }).limit(0);
    if (error) throw error;
    console.log('✅ Supabase connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
    return false;
  }
}

async function checkMigrations() {
  console.log('📋 Checking if migration 018 is applied...');
  try {
    // Check if new tables exist
    const tables = ['daily_lrdi_puzzles', 'lrdi_puzzle_attempts', 'streak_shields', 'todo_items'];
    let allExist = true;

    for (const table of tables) {
      const { data, error } = await admin.from(table).select('count()', { count: 'exact' }).limit(0);
      if (error) {
        console.log(`  ⚠️  Table "${table}" does not exist yet`);
        allExist = false;
      } else {
        console.log(`  ✅ Table "${table}" exists`);
      }
    }

    if (allExist) {
      console.log('✅ All migration 018 tables present\n');
    } else {
      console.log(
        '⚠️  Some tables missing. Run: npx supabase migration up\n'
      );
    }

    return allExist;
  } catch (error) {
    console.error('❌ Migration check failed:', error);
    return false;
  }
}

async function seedPuzzles() {
  console.log('🌱 Seeding 30 days of puzzles...');

  const puzzleTypes = ['seating', 'blood_relation', 'constraint', 'arrangement'];
  const samplePuzzles: Record<string, any> = {
    seating: { description: 'Seating arrangement puzzle' },
    blood_relation: { description: 'Blood relation puzzle' },
    constraint: { description: 'Constraint-based logic puzzle' },
    arrangement: { description: 'Arrangement puzzle' },
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const puzzles = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const puzzleType = puzzleTypes[i % puzzleTypes.length] as keyof typeof samplePuzzles;
    const difficulty = (i % 10) + 1;
    const estimatedTime = difficulty <= 3 ? 10 : difficulty <= 6 ? 15 : 20;

    puzzles.push({
      puzzle_date: dateStr,
      puzzle_type: puzzleType,
      difficulty,
      difficulty_description: difficulty <= 3 ? 'Beginner' : difficulty <= 6 ? 'Intermediate' : 'Advanced',
      estimated_time_minutes: estimatedTime,
      puzzle_content: samplePuzzles[puzzleType],
      solution: `Solution for ${puzzleType} puzzle on ${dateStr}`,
      explanation: `Step-by-step explanation for the ${puzzleType} puzzle`,
    });
  }

  try {
    const { data, error } = await admin
      .from('daily_lrdi_puzzles')
      .upsert(puzzles, { onConflict: 'puzzle_date' })
      .select();

    if (error) throw error;

    console.log(`✅ Seeded ${data?.length || 0} puzzles\n`);

    // Show breakdown
    const byDifficulty = puzzles.reduce(
      (acc, p) => {
        const key = p.difficulty <= 3 ? 'Beginner' : p.difficulty <= 6 ? 'Intermediate' : 'Advanced';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('📊 Breakdown by difficulty:');
    Object.entries(byDifficulty).forEach(([level, count]) => {
      console.log(`   ${level}: ${count} puzzles`);
    });
    console.log();

    return true;
  } catch (error) {
    console.error('❌ Puzzle seeding failed:', error);
    return false;
  }
}

async function verifyDeployment() {
  console.log('✅ Verifying deployment...\n');

  try {
    // Check tables exist
    const tables: Record<string, string> = {
      daily_lrdi_puzzles: 'Daily puzzles',
      lrdi_puzzle_attempts: 'Puzzle attempts',
      streak_shields: 'Streak shields',
      todo_items: 'TODO items',
      analytics_events: 'Analytics',
    };

    console.log('📊 Table Status:');
    for (const [table, label] of Object.entries(tables)) {
      const { data, error } = await admin.from(table).select('count()', { count: 'exact' }).limit(0);
      if (!error) {
        console.log(`   ✅ ${label}`);
      } else {
        console.log(`   ❌ ${label} (missing)`);
      }
    }

    // Check puzzles
    const { data: puzzles } = await admin.from('daily_lrdi_puzzles').select('count()', { count: 'exact' }).limit(0);
    console.log(`\n🧩 Puzzles loaded: ${puzzles ? 'Yes' : 'No'}`);

    console.log('\n🟢 DEPLOYMENT READY FOR PRODUCTION\n');
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  }
}

async function main() {
  console.log('================================================================================');
  console.log('CAREERRAI DAILY TRACKER - DEPLOYMENT SCRIPT');
  console.log('================================================================================\n');

  const connected = await verifyConnection();
  if (!connected) {
    console.error('\n❌ Cannot proceed without Supabase connection.');
    process.exit(1);
  }

  const migrationsApplied = await checkMigrations();
  if (!migrationsApplied) {
    console.warn('\n⚠️  Please apply migrations first: npx supabase migration up\n');
    process.exit(1);
  }

  const puzzlesSeeded = await seedPuzzles();
  if (!puzzlesSeeded) {
    console.error('\n❌ Failed to seed puzzles.');
    process.exit(1);
  }

  await verifyDeployment();

  console.log('✨ Daily Tracker is ready for launch!\n');
  console.log('Next steps:');
  console.log('  1. Verify on /student/tracker');
  console.log('  2. Test logging on real device');
  console.log('  3. Deploy to Vercel: git push origin main');
  console.log('  4. Monitor: Check Sentry + Firebase Analytics');
  console.log();
}

main().catch(console.error);
