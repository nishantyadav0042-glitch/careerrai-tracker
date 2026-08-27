import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── A MESSAGE MUST REACH THE OTHER SIDE, NOT THE SENDER ────────────────────
//
// Matrix item 1.13 (mentor reply) is ALREADY BUILT: deliverPairMessage inserts
// the message and dispatches to the other half of the pair, deep-linking each
// role to their own chat screen and collapsing the tray by pair tag. Nothing
// here rebuilds it.
//
// What it did NOT have was a test of the direction itself. The recipient is
// chosen by one ternary:
//
//     senderId === pair.studentId ? pair.buddyId : pair.studentId
//
// Flip that and every push goes to the person who just typed the message,
// while the person waiting for a reply hears nothing — and the suite would
// have stayed green. The same single expression also decides the deep link, so
// one flip lands a mentor on the student's page.
//
// The dispatch is deliberately fire-and-forget in production (a push must
// never delay a message insert), so these tests flush the microtask queue
// rather than changing the code to be convenient to test.

const dispatch = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('./notification-os', () => ({ dispatch }));

import { deliverPairMessage } from './chat-deliver';

const STUDENT = 'stu-1';
const BUDDY = 'bud-1';

const admin = {
  from: (table: string) => {
    if (table === 'chat_messages') {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'msg-1' }, error: null }) }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            single: async () => ({
              data: id === BUDDY
                ? { full_name: 'Shreya Bendigeri', notif_prefs: { push: true } }
                : { full_name: 'Dhruv Vakadia', notif_prefs: { push: true } },
            }),
          }),
        }),
      };
    }
    if (table === 'buddy_checkin_drafts') {
      // Stamped best-effort when a STUDENT replies, so an unanswered-check-in
      // count cannot keep drafting messages to someone who has been replying.
      return {
        // The real call is `.then(undefined, handler)` — a rejection guard, not
        // a success callback. Returning a settled promise keeps that shape.
        update: () => ({
          eq: () => ({
            not: () => ({ is: () => Promise.resolve({ error: null }) }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const pair = { studentId: STUDENT, buddyId: BUDDY };

/** The dispatch is fired without awaiting; let the microtask run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

async function send(senderId: string, body = 'hello') {
  await deliverPairMessage({ admin, pair, senderId, body });
  await flush();
  return dispatch.mock.calls[0]?.[0] as unknown as Record<string, unknown> | undefined;
}

beforeEach(() => vi.clearAllMocks());

describe('the message goes to the OTHER side of the pair', () => {
  it('a mentor reply notifies the STUDENT', async () => {
    const sent = await send(BUDDY);
    expect(sent?.userId).toBe(STUDENT);
  });

  it('a student message notifies the MENTOR', async () => {
    const sent = await send(STUDENT);
    expect(sent?.userId).toBe(BUDDY);
  });

  it('never notifies the person who just sent it', async () => {
    expect((await send(BUDDY))?.userId).not.toBe(BUDDY);
    vi.clearAllMocks();
    expect((await send(STUDENT))?.userId).not.toBe(STUDENT);
  });

  it('sends exactly one notification per message', async () => {
    await send(BUDDY);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('each side lands on their own screen', () => {
  it('the mentor is deep-linked to the buddy chat, not the student page', async () => {
    const sent = await send(STUDENT); // recipient is the buddy
    expect(sent?.url).toBe(`/buddy/chat/${STUDENT}`);
  });

  it('the student is deep-linked to their own chat tab', async () => {
    const sent = await send(BUDDY); // recipient is the student
    expect(sent?.url).toBe('/student/buddy?tab=chat');
  });

  it('names the SENDER in the title, not the recipient', async () => {
    const sent = await send(BUDDY); // Shreya writes to Dhruv
    expect(sent?.title).toContain('Shreya');
    expect(sent?.title).not.toContain('Dhruv');
  });
});

describe('the tray collapses per conversation', () => {
  it('both directions share one tag, so a thread is one tray entry', async () => {
    const fromBuddy = await send(BUDDY);
    vi.clearAllMocks();
    const fromStudent = await send(STUDENT);
    expect(fromBuddy?.tag).toBe(fromStudent?.tag);
    expect(fromBuddy?.tag).toBe(`chat-${STUDENT}-${BUDDY}`);
  });

  it('rides the one dispatch authority as a chat event', async () => {
    expect((await send(BUDDY))?.type).toBe('chat');
  });
});

describe('the preview is truthful', () => {
  it('truncates a long message rather than pushing the whole thing', async () => {
    const sent = await send(BUDDY, 'x'.repeat(200));
    expect((sent?.body as string).length).toBeLessThan(200);
    expect(sent?.body).toContain('…');
  });

  it('a short message is sent whole', async () => {
    expect((await send(BUDDY, 'see you at 4'))?.body).toBe('see you at 4');
  });
});
