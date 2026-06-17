// Lightweight type definitions and guards for puzzle game content.
// Lives in a plain (non-React) module so DailyTrackerApp can import
// the guards without pulling in the full modal bundles.

export interface CaseQuestion {
  q: string;
  options: string[];
  answer: number;
}

export interface ArrangementContent {
  game_type?: 'detective' | 'airport';
  mode: 'linear' | 'circular';
  title: string;
  story: string;
  entities: string[];
  slotLabels: string[];
  solution: string[];
  clues: string[];
  questions: CaseQuestion[];
}

export type DetectiveCaseContent = ArrangementContent;

export interface EscapeLock {
  room: string;
  prompt: string;
  options: string[];
  answer: number;
  hint: string;
}

export interface EscapeRoomContent {
  game_type: 'escape_room';
  title: string;
  story: string;
  locks: EscapeLock[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export interface MafiaStatement { suspect: string; says: string }

export interface MafiaContent {
  game_type: 'mafia';
  title: string;
  story: string;
  suspects: string[];
  guilty_index: number;
  statements: MafiaStatement[];
  facts: string[];
  questions: Array<{ q: string; options: string[]; answer: number }>;
}

export function isDetectiveCase(content: unknown): content is ArrangementContent {
  const c = content as Partial<ArrangementContent> | null | undefined;
  return (
    !!c &&
    Array.isArray(c.entities) &&
    Array.isArray(c.solution) &&
    Array.isArray(c.clues) &&
    Array.isArray(c.questions) &&
    c.questions.length > 0 &&
    (c.game_type === undefined || c.game_type === 'detective' || c.game_type === 'airport')
  );
}

export function isEscapeRoom(content: unknown): content is EscapeRoomContent {
  const c = content as Partial<EscapeRoomContent> | null | undefined;
  return !!c && c.game_type === 'escape_room' && Array.isArray(c.locks) && c.locks.length > 0;
}

export function isMafiaGame(content: unknown): content is MafiaContent {
  const c = content as Partial<MafiaContent> | null | undefined;
  return !!c && c.game_type === 'mafia' && Array.isArray(c.suspects) && Array.isArray(c.statements);
}
