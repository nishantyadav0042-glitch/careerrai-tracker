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
    expect(readFileSync(ROUTE, 'utf8')).toContain("not('weekly_session_cap', 'is', null)");
  });

  it('a student cannot buy a second session while one is unfinished', () => {
    const s = readFileSync(ROUTE, 'utf8');
    expect(s).toContain("in('status', ['paid', 'assigned', 'scheduled'])");
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
    expect(readFileSync(CARD, 'utf8')).toContain('Not a subscription');
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
    const diagnosis = s.indexOf('We found ');
    const red = s.indexOf('bg-red-600');
    const person = s.indexOf('Your IIM Buddy');
    const price = s.indexOf('<BookSessionCard');
    const tillcat = s.indexOf('Want {buddyFirst} till CAT?');
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

  it('the Till-CAT plan is one active-choice banner, not the price-card stack', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('till CAT?');
    expect(s).toContain('₹2,999');
    // ...but the big subscription price cards do not come back.
    expect(s).not.toContain('BuddyBuyButtons');
  });

  it('the repeater fact is the sourced one, never the unsourced ~50%', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('REPEATER_FACT');
    expect(s).not.toContain('50%');
  });

  it('the free buddy route renders this screen, wired to the student\'s case', () => {
    const page = readFileSync('src/app/student/buddy/page.tsx', 'utf8');
    expect(page).toContain('<BuddyConversionScreen');
    expect(page).toContain('loadStudentCase(admin, user.id)');
    expect(page).not.toContain('<LockedBuddyHub');
  });
});
