// Prints upsert SQL for the daily games (31 days, rotating game types:
// detective → airport → escape room → mafia).
// Usage: node scripts/print-seed-sql.mjs [chunkIndex chunkSize]
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const detective = JSON.parse(readFileSync(join(__dirname, 'lrdi-game-sets.json'), 'utf-8'));
const v2 = JSON.parse(readFileSync(join(__dirname, 'game-sets-v2.json'), 'utf-8'));

// Daily rotation keeps the app fresh: each game type returns every 4 days.
const pools = [detective, v2.airport, v2.escape, v2.mafia];
const poolCursor = [0, 0, 0, 0];

const esc = (s) => String(s).replace(/'/g, "''");

const today = new Date();
today.setHours(0, 0, 0, 0);

const rows = [];
for (let i = 0; i < 31; i++) {
  const date = new Date(today);
  date.setDate(date.getDate() + i);
  const dateStr = date.toISOString().split('T')[0];
  const poolIdx = i % pools.length;
  const pool = pools[poolIdx];
  const set = pool[poolCursor[poolIdx] % pool.length];
  poolCursor[poolIdx]++;
  rows.push(
    `('${dateStr}', '${set.type}', ${set.difficulty}, '${set.difficulty <= 6 ? 'Medium' : 'Hard'}', ${set.estimatedTime}, '${esc(JSON.stringify(set.content))}'::jsonb, '${esc(set.solutionText)}', '${esc(set.explanation)}')`
  );
}

const [chunkIndex, chunkSize] = process.argv.slice(2).map(Number);
const selected = Number.isInteger(chunkIndex) && Number.isInteger(chunkSize)
  ? rows.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize)
  : rows;

console.log(`INSERT INTO daily_lrdi_puzzles (puzzle_date, puzzle_type, difficulty, difficulty_description, estimated_time_minutes, puzzle_content, solution, explanation)
VALUES
${selected.join(',\n')}
ON CONFLICT (puzzle_date) DO UPDATE SET
  puzzle_type = EXCLUDED.puzzle_type,
  difficulty = EXCLUDED.difficulty,
  difficulty_description = EXCLUDED.difficulty_description,
  estimated_time_minutes = EXCLUDED.estimated_time_minutes,
  puzzle_content = EXCLUDED.puzzle_content,
  solution = EXCLUDED.solution,
  explanation = EXCLUDED.explanation;`);
