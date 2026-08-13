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
  /** The sharer's own time, if they were timed — turns the forward from
   *  "look at this question" into "beat my time". */
  yourSeconds?: number | null;
  /** The question's own clock; 90 assumed for surfaces that predate it. */
  targetSeconds?: number | null;
}

export function buildChallengeText(q: ShareableQuestion): string {
  const tag = [q.section, q.topic].filter(Boolean).join(' · ');
  // The 90 seconds IS the share (founder, 13 Aug: "will your friends also be
  // able to solve it in 90 secs — this urgency will push the share"). A
  // question is homework; a question with a clock is a dare. When the sharer
  // has a time, the dare is personal — beat ME — which is stronger still.
  const target = q.targetSeconds ?? 90;
  const dare = q.yourSeconds != null
    ? `I solved this in ${q.yourSeconds} seconds ⏱️ Can you beat me?${tag ? `  (${tag})` : ''}`
    // No personal time claimed when none was measured — the dare still
    // stands on the clock alone.
    : `⏱️ Can you crack this in ${target} seconds? 👇${tag ? `  (${tag})` : ''}`;
  const lines: string[] = [dare, ''];
  if (q.text) lines.push(q.text.trim(), '');
  if (q.options && q.options.length > 0) {
    q.options.forEach((o, i) => lines.push(`${String.fromCharCode(65 + i)}. ${o}`));
    lines.push('');
  }
  if (q.imageUrl) lines.push(q.imageUrl, '');
  lines.push('Time yourself — reply with your answer AND your seconds.');
  lines.push(`— today’s ${target}-second question on CareerRai, by the students for the students`);
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
