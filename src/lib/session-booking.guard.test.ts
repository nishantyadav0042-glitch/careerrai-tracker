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

describe('the session sits below the subscription, not in place of it', () => {
  it('the Buddy plan is still the product', () => {
    const s = readFileSync('src/components/locked-buddy-hub.tsx', 'utf8');
    const buy = s.indexOf('<BuddyBuyButtons');
    const session = s.indexOf('<BookSessionCard');
    expect(session, 'session card missing').toBeGreaterThan(-1);
    expect(buy, 'the ₹299 must not outrank the subscription').toBeLessThan(session);
  });
});
