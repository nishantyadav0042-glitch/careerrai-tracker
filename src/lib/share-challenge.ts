'use client';

// "Share the question, not the app." (founder, 25 Jul)
//
// Nobody forwards an ad; everyone forwards a challenge. The share text is the
// QUESTION itself — fully solvable inside the WhatsApp group with no install,
// no link-click required. CareerRai appears as one quiet closing line. The
// friend's curiosity does the marketing, which is the only kind that works.

import { track } from '@/lib/journey';

export interface ShareableQuestion {
  section?: string | null;
  topic?: string | null;
  text?: string | null;
  options?: string[] | null;
  imageUrl?: string | null;
}

export function buildChallengeText(q: ShareableQuestion): string {
  const tag = [q.section, q.topic].filter(Boolean).join(' · ');
  const lines: string[] = [
    `Think this one is tough? See how many of your friends can solve it 👇${tag ? `  (${tag})` : ''}`,
    '',
  ];
  if (q.text) lines.push(q.text.trim(), '');
  if (q.options && q.options.length > 0) {
    q.options.forEach((o, i) => lines.push(`${String.fromCharCode(65 + i)}. ${o}`));
    lines.push('');
  }
  if (q.imageUrl) lines.push(q.imageUrl, '');
  lines.push('Reply with your answer!');
  lines.push('— today’s student-shared question on CareerRai, by the students for the students');
  lines.push('https://careerrai.in/start?src=challenge');
  return lines.join('\n');
}

/**
 * Native share sheet where it exists (every phone — lands straight in
 * WhatsApp), clipboard everywhere else. Returns how it went so the caller
 * can show "Copied!" without a second code path.
 */
export async function shareChallenge(q: ShareableQuestion, surface: string): Promise<'shared' | 'copied' | 'failed'> {
  const text = buildChallengeText(q);
  track('challenge_shared', { section: q.section ?? null, topic: q.topic ?? null, surface });
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch {
    // User closed the sheet — fall through to clipboard only on real absence.
    return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
