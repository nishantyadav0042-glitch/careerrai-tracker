import { describe, it, expect } from 'vitest';
import { validateRoomLink } from './meeting-room-link';

// A mentor pasting their own room link is now the PRIMARY way to become
// bookable — Google is the optional shortcut. That happened because making
// booking depend on Google OAuth made every mentor hostage to Google's
// app-verification queue ("this app is being tested and can only be accessed
// by developer-approved testers"), which no amount of our code could fix.
//
// So this validation matters: it is the gate between a mentor and their first
// session.

const ok = (s: string) => validateRoomLink(s);

describe('real rooms are accepted', () => {
  it('takes a normal Meet link', () => {
    expect(ok('https://meet.google.com/abc-defg-hij')).toEqual({
      ok: true, room: { url: 'https://meet.google.com/abc-defg-hij', provider: 'meet' },
    });
  });

  it('takes a link pasted without the scheme', () => {
    // People copy "meet.google.com/abc-defg-hij" out of a message all the time.
    expect(ok('meet.google.com/abc-defg-hij')).toMatchObject({ ok: true });
  });

  it('takes Zoom and Teams — a mentor with an established room keeps it', () => {
    expect(ok('https://us05web.zoom.us/j/1234567890')).toMatchObject({ ok: true, room: { provider: 'zoom' } });
    expect(ok('https://teams.microsoft.com/l/meetup-join/xyz')).toMatchObject({ ok: true, room: { provider: 'teams' } });
  });

  it('tolerates www. and a trailing slash', () => {
    expect(ok('https://www.meet.google.com/abc-defg-hij/')).toMatchObject({
      ok: true, room: { url: 'https://meet.google.com/abc-defg-hij' },
    });
  });
});

describe('the meet.google.com/new trap', () => {
  it('refuses /new and explains what to do instead', () => {
    // /new mints a DIFFERENT room every visit. Saving it would give every
    // student a dead link — the exact failure the permanent room exists to
    // prevent, reintroduced by a plausible-looking paste.
    const res = ok('https://meet.google.com/new');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('brand-new room');
      expect(res.error).toContain('abc-defg-hij');
    }
  });
});

describe('malformed input is refused with a usable message', () => {
  it('refuses an empty paste', () => {
    expect(ok('')).toMatchObject({ ok: false });
    expect(ok('   ')).toMatchObject({ ok: false });
  });

  it('refuses text that is not a link', () => {
    expect(ok('my zoom room')).toMatchObject({ ok: false });
  });

  it('refuses an incomplete Meet code', () => {
    for (const bad of ['https://meet.google.com/', 'https://meet.google.com/abc', 'https://meet.google.com/abcdefghij']) {
      expect(ok(bad).ok, bad).toBe(false);
    }
  });

  it('refuses http, so a room link is never sent in the clear', () => {
    expect(ok('http://meet.google.com/abc-defg-hij')).toMatchObject({ ok: false });
  });

  it('refuses an unknown provider rather than saving something students cannot join', () => {
    expect(ok('https://example.com/my-room')).toMatchObject({ ok: false });
  });

  it('refuses a lookalike domain', () => {
    // meet.google.com.evil.test ends with "evil.test", not "meet.google.com".
    expect(ok('https://meet.google.com.evil.test/abc-defg-hij')).toMatchObject({ ok: false });
  });
});

describe('what gets stored is clean', () => {
  it('strips query strings and fragments', () => {
    // A one-time passcode or tracking parameter in a PERMANENT room is a link
    // that quietly stops working months later.
    expect(ok('https://us05web.zoom.us/j/123?pwd=abc#success')).toMatchObject({
      ok: true, room: { url: 'https://us05web.zoom.us/j/123' },
    });
  });

  it('lowercases the host but leaves the meeting code alone', () => {
    expect(ok('https://MEET.GOOGLE.COM/abc-defg-hij')).toMatchObject({
      ok: true, room: { url: 'https://meet.google.com/abc-defg-hij' },
    });
  });
});
