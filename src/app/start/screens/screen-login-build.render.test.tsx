import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ScreenLoginBuild from './screen-login-build';

// ── PHONE OTP IS THE ONLY ACCOUNT-CREATION DOOR (Incident #62) ──────────────
//
// This file previously asserted the opposite: Google first, filled CTA, OTP
// demoted beneath an "or" divider (founder, 29 Aug). Two days of production
// retired that decision. Every Google account created in that window — five of
// them — had NO phone number, because Supabase can only attach a Google
// identity to an existing user on a matching CONFIRMED email and 963 of 969
// students have no email on file. So on this screen Google could not recognise
// a returning student even in principle; it could only mint a second account
// beside the real one, with a fresh streak and no plan, buddy or history.
//
// Asserted on the rendered DOM rather than by reading the file, for the same
// reason as before: which control a student sees, and how loudly, is a question
// about ORDER and EMPHASIS that a grep cannot answer.
//
// Incident #10 — a single-door login cost an App Store 2.1 rejection — is NOT
// re-created here. A student who cannot receive an SMS still has the password
// door on this screen, and a Google sign-in from /login converges on the same
// verified account through /auth/link-phone. What is gone is the door that
// could create an account we can never contact.

const html = renderToStaticMarkup(
  <ScreenLoginBuild isLoading={false} onboarding={{ target_percentile: 98 }} />
);

const at = (needle: string) => html.indexOf(needle);

describe('the final /start screen creates accounts by phone only', () => {
  it('renders the phone door', () => {
    expect(at('Mobile number')).toBeGreaterThan(-1);
    expect(at('Send OTP')).toBeGreaterThan(-1);
  });

  // THE REGRESSION TEST. Restoring this button re-opens the P0: an
  // unauthenticated Google sign-in on this screen is an account-creation door.
  it('offers no Google door — it cannot create an account it can recognise', () => {
    expect(at('Continue with Google'), 'Google is an account-creation door here again — Incident #62')
      .toBe(-1);
  });

  it('gives the phone door the filled CTA, since it is now the recommendation', () => {
    // Emphasis follows the decision. When Google held the filled style this
    // button was deliberately outlined so as not to compete; with Google gone,
    // an outlined lone CTA would leave the screen with no clear action at all.
    const otpTag = html.slice(0, at('Send OTP')).lastIndexOf('<button');
    const otp = html.slice(otpTag, at('Send OTP'));
    expect(otp, 'the primary action on this screen is not the filled CTA')
      .toMatch(/bg-stone-900/);
  });

  it('does not steal the screen with an autofocused keyboard', () => {
    // autoFocus on the name field pops the mobile keyboard on load and scrolls
    // the primary CTA out of view — on exactly the devices that matter most.
    const nameField = html.slice(at('Your name'), at('Mobile number'));
    expect(nameField).not.toMatch(/autofocus/i);
  });

  it('keeps the password door reachable for returning students', () => {
    expect(at('Log in with password')).toBeGreaterThan(-1);
  });
});
