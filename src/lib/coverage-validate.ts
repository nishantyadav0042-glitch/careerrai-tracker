import { KNOWLEDGE_GRAPH } from '@/lib/topics-constants';

// Shared with /api/coverage (the authenticated, logged-in-student path) so
// the pre-auth signup path (verify-phone-otp persisting a matrix built
// before the account existed) can never diverge from what a real coverage
// write accepts.
export const VALID_SECTIONS = KNOWLEDGE_GRAPH.map((s) => s.id);
export const VALID_STATUSES = ['not_started', 'learning', 'practicing', 'revising', 'exam_ready'] as const;
export const TOPICS_BY_SECTION: Record<string, string[]> = Object.fromEntries(
  KNOWLEDGE_GRAPH.map((s) => [s.id, s.groups.flatMap((g) => g.units)])
);

export interface MatrixEntry { section?: string; topic?: string; status?: string }

export function validateCoverageEntry({ section, topic, status }: MatrixEntry, allowExamReady: boolean): string | null {
  if (!section || !(VALID_SECTIONS as string[]).includes(section)) return 'section is not a Knowledge Graph section';
  if (!topic || !TOPICS_BY_SECTION[section].includes(topic)) return 'topic is not valid for section';
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) return 'status is not a recognised value';
  if (!allowExamReady && status === 'exam_ready') return 'exam_ready cannot be self-declared';
  return null;
}

export function validateCoverageMatrix(matrix: MatrixEntry[]): string | null {
  if (matrix.length === 0 || matrix.length > 80) return 'matrix must have 1-80 entries';
  for (const entry of matrix) {
    const problem = validateCoverageEntry(entry, false);
    if (problem) return `${entry.section ?? '?'}/${entry.topic ?? '?'}: ${problem}`;
  }
  return null;
}
