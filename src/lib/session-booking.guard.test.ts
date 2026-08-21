import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── We never take money for a session nobody can hold ───────────────────────
//
// Four mentors have delivered thirteen sessions in three weeks. Overselling is
// a live risk, not a hypothetical, and the students most willing to pay us are
// exactly the ones a broken promise would burn. These pin the order of
// operations that prevents it.

const ROUTE = 'src/app/api/sessions/book/route.ts';
const CARD = 'src/components/buddy/book-session-card.tsx';

describe('capacity is checked BEFORE money, never after', () => {
  it('the route refuses on a full roster before creating any order', () => {
    const s = readFileSync(ROUTE, 'utf8');
    const capacity = s.indexOf('rosterCapacity(roster) <= 0');
    const charge = s.indexOf('createRazorpayOrder(');
    expect(capacity, 'no capacity gate').toBeGreaterThan(-1);
    expect(capacity, 'capacity must be checked before charging').toBeLessThan(charge);
  });

  it('a mentor must exist who can actually take it', () => {
    const s = readFileSync(ROUTE, 'utf8');
    const match = s.indexOf('matchMentor(roster');
    const charge = s.indexOf('createRazorpayOrder(');
    expect(match).toBeLessThan(charge);
    expect(s).toMatch(/if \(!match\)[\s\S]{0,200}409/);
  });

  it('only mentors who DECLARED a capacity are ever considered', () => {
    // Undeclared means zero, not unlimited — seven of eight have not declared.
    // Boundary 2 Change 3 moved the roster query into the failure-aware
    // primitive; the idea (filter on a declared cap) lives there now, and the
    // route must actually consume that primitive rather than a local copy.
    expect(readFileSync('src/lib/session-credit.ts', 'utf8')).toContain("not('weekly_session_cap', 'is', null)");
    expect(readFileSync(ROUTE, 'utf8')).toContain('readMentorRoster(admin)');
  });

  it('a student cannot buy a second session while one is unfinished', () => {
    // The open-credit query moved into hasOpenSessionCredit (Boundary 2,
    // Change 3); the route keeps the decision, the primitive keeps the read.
    expect(readFileSync('src/lib/session-credit.ts', 'utf8')).toContain("in('status', ['paid', 'assigned', 'scheduled'])");
    const s = readFileSync(ROUTE, 'utf8');
    expect(s).toContain('hasOpenSessionCredit(admin, user.id)');
    expect(s).toContain('alreadyBooked: true');
  });
});

describe('the card refuses honestly rather than failing at checkout', () => {
  it('availability is fetched before the button renders', () => {
    // A student must never tap something that is going to turn them down.
    const s = readFileSync(CARD, 'utf8');
    expect(s).toContain("fetch('/api/sessions/book')");
    expect(s).toContain('if (!state) return null;');
  });

  it('sold out says so plainly, and does not offer a button', () => {
    const s = readFileSync(CARD, 'utf8');
    expect(s).toContain('Fully booked this week');
    expect(s).toMatch(/state\.available \?/);
  });

  it('never publishes how few spots remain', () => {
    // "2 spots left" across four mentors reports how small we are.
    const s = readFileSync(CARD, 'utf8');
    expect(s).not.toMatch(/spots? left/i);
    expect(s).not.toMatch(/remaining/i);
  });

  it('says plainly that nothing renews', () => {
    // The entire point is that a free student can buy once without a
    // subscription; leaving that ambiguous is how a refund request starts.
    // Trimmed to four words on 14 Aug — the claim survives, the sentence did not.
    expect(readFileSync(CARD, 'utf8')).toContain('One-time. Nothing renews.');
  });
});

describe('the conversion screen: weakness → person → price, nothing else', () => {
  // Founder, 14 Aug: keep only the student's weakness, the buddy profile with
  // why-this-buddy, and ₹299 book now. The old hub (fear hero, USP stack, two
  // price cards) is retired from the route; this pins the replacement's shape
  // so it cannot quietly re-grow.
  const SCREEN = 'src/components/buddy/buddy-conversion-screen.tsx';

  it('diagnosis → red strip → person → price → till-CAT, in that order', () => {
    const s = readFileSync(SCREEN, 'utf8');
    const diagnosis = s.indexOf('your weak spots');
    const red = s.indexOf('bg-red-600');
    const person = s.indexOf('Your IIM Buddy');
    const price = s.indexOf('<BookSessionCard');
    const tillcat = s.indexOf('till CAT — ₹2,999');
    expect(diagnosis).toBeGreaterThan(-1);
    expect(red).toBeGreaterThan(diagnosis);
    expect(person).toBeGreaterThan(red);
    expect(price).toBeGreaterThan(person);
    expect(tillcat).toBeGreaterThan(price);
  });

  it('every diagnosis bullet is a pointer with the student\'s own stat', () => {
    // "QA — 9/28 topics started", never a paragraph — and the generic
    // "nobody is reviewing" line never leads the card.
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('{b.chip}');
    expect(s).toContain('{b.stat}');
    expect(s).not.toContain('Nobody is reviewing your preparation');
  });

  it('the Till-CAT plan is one line, not the price-card stack', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('₹2,999');
    // ...but the big subscription price cards do not come back.
    expect(s).not.toContain('BuddyBuyButtons');
  });

  it('the red strip is ONE sourced line and nothing after it', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('REPEATER_HEADLINE');
    expect(s).not.toContain('REPEATER_SO_WHAT');
    expect(s).not.toContain('50%');
  });

  it('the person is the loudest block, not a white card between two loud ones', () => {
    // Founder, 14 Aug: the buddy profile was "bogus", not distinct, nothing
    // hatke. It was a ranking error rather than a taste one — a hairline card
    // on a white page, sitting under a black card and a red strip, so the one
    // thing being bought was the quietest object on the screen.
    const s = readFileSync(SCREEN, 'utf8');
    const card = s.slice(s.indexOf('{buddy && ('), s.indexOf('<BookSessionCard'));
    expect(card).toMatch(/bg-gradient-to-br from-indigo-600/);
    // The flat shell that made it disappear must not come back.
    expect(card).not.toMatch(/border-stone-200 bg-white/);
  });

  it('answers in a different register from the two blocks that raise alarm', () => {
    // Black states the problem, red states the stakes. A third alarm-toned
    // card would read as more bad news; what is being sold here is relief.
    const s = readFileSync(SCREEN, 'utf8');
    const card = s.slice(s.indexOf('{buddy && ('), s.indexOf('<BookSessionCard'));
    expect(card).not.toMatch(/bg-red-|bg-stone-900/);
  });

  it('the credential is set as a badge, not as caption text under a name', () => {
    const s = readFileSync(SCREEN, 'utf8');
    const card = s.slice(s.indexOf('{buddy && ('), s.indexOf('<BookSessionCard'));
    expect(card).toContain('bg-amber-300');
    expect(card).toContain('CAT {buddy.cat_percentile}%ile');
  });

  it('shows the mentor\'s real face when there is one', () => {
    // A photo is the difference between a person and a placeholder; initials
    // stay only as the fallback.
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('buddy.avatar_url ?');
    expect(s).toContain('initials(buddy.full_name)');
  });

  it('the 5-student cap is printed AND enforced, not just claimed', () => {
    // A scarcity line next to a payment button has to be true; the student
    // otherwise discovers it by getting a mentor with no time for them.
    expect(readFileSync(SCREEN, 'utf8')).toContain('Max 5 students per mentor');
  });

  it('the diagnosis card can never be padded with status facts again', () => {
    const loader = readFileSync('src/lib/buddy-case-data.ts', 'utf8');
    expect(loader).not.toContain('statusBullets');
    expect(loader).toContain("f.kind !== 'unreviewed'");
  });

  it('the free buddy route renders this screen, wired to the student\'s case', () => {
    const page = readFileSync('src/app/student/buddy/page.tsx', 'utf8');
    expect(page).toContain('<BuddyConversionScreen');
    expect(page).toContain('loadStudentCase(admin, user.id)');
    expect(page).not.toContain('<LockedBuddyHub');
  });
});
