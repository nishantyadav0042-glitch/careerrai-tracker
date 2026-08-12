import { dailyPickIndex } from '@/lib/community-pipeline';
import { selfVsObserved, type PeerRow } from './peer-cohort';

// ── The mirror: something true about THIS student's own preparation ─────────
//
// The Daily Pick slot that needs no content bank, no peers and no community —
// only the student's own record. That makes it the most reliably available
// interesting thing we can show, and the one a competitor cannot copy, because
// it is made of data they do not have.
//
// The bar every line here must clear: a student should read it and think "I
// didn't know that about myself", or at minimum "that's true and I'd forgotten".
// A line that just reads their own screen back to them ("you have 3 tasks
// today") is noise and does not belong.
//
// TONE IS A HARD CONSTRAINT, not a preference. This slot fires on days a
// student may have studied nothing, and MISSION.md forbids anything that makes
// the free product worse for a student who will never pay. So:
//   · never a streak-loss warning, a countdown, or a "you're falling behind"
//   · never a comparison to their past self framed as decline
//   · when the honest fact is bad news, the line points at the PLAN, which is
//     ours to fix, not at the student, who is doing their best
//
// A mirror that makes a struggling student feel watched is a product that gets
// deleted, and it would take the whole learning machine with it.

export interface MirrorLine {
  id: string;
  line: string;
}

/**
 * Every true thing we can say about this student today, best first.
 *
 * Returns [] when we hold nothing worth saying — a brand-new student has no
 * record to mirror, and inventing one would be exactly the failure this
 * codebase spends the most effort preventing.
 */
export function mirrorLines(me: PeerRow): MirrorLine[] {
  const out: MirrorLine[] = [];

  // The plan-vs-reality gap. The most valuable single thing we know, and it
  // already carries the "blame the plan" framing.
  const gap = selfVsObserved(me);
  if (gap) out.push({ id: 'plan-gap', line: gap.line });

  // Consistency, stated as an achievement rather than a scoreboard. Only when
  // there is something to be pleased about — silence beats a zero.
  if (me.loggedDaysLast7 >= 5) {
    out.push({
      id: 'consistency-strong',
      line: `You showed up ${me.loggedDaysLast7} of the last 7 days. That is the part most preparations never manage — the syllabus is the easy half.`,
    });
  } else if (me.loggedDaysLast7 >= 2) {
    out.push({
      id: 'consistency-real',
      line: `${me.loggedDaysLast7} study days logged this week. Every one of them moved your finish date — that is not nothing.`,
    });
  }

  // What their real day actually looks like, which almost nobody knows about
  // themselves without being told.
  if (me.observedAvgHours != null && me.loggedDaysLast7 >= 2) {
    out.push({
      id: 'real-day',
      line: `On the days you study, you average ${Math.round(me.observedAvgHours * 10) / 10} hours. That is your real day — the plan should be built around it, not around a perfect one.`,
    });
  }

  return out;
}

/** Today's mirror line for this student — stable for the day, like every other
 *  pick on this surface, so a refresh cannot reroll it. */
export function mirrorForDay(me: PeerRow, dayIso: string): MirrorLine | null {
  const lines = mirrorLines(me);
  if (lines.length === 0) return null;
  return lines[dailyPickIndex(`${me.studentId}:mirror`, dayIso, lines.length)];
}
