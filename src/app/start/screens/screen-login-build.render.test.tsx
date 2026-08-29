import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ScreenLoginBuild from './screen-login-build';

// ── GOOGLE IS THE RECOMMENDED DOOR; OTP IS THE FALLBACK ─────────────────────
//
// Founder, 29 Aug: prioritise Google on this screen and make mobile OTP the
// secondary option. Asserted on the rendered DOM rather than by reading the
// file, because "which control does a student see first" is a question about
// ORDER and EMPHASIS — two things a grep cannot see and a reorder can silently
// destroy.
//
// The screen is also where Incident #10's lesson lives: a login screen with a
// single door cost us an App Store 2.1 rejection. Demoting OTP is the ask;
// dropping it is not, so its survival is pinned here too.

const html = renderToStaticMarkup(
  <ScreenLoginBuild isLoading={false} onboarding={{ target_percentile: 98 }} />
);

const at = (needle: string) => html.indexOf(needle);

describe('the final /start screen leads with Google', () => {
  it('renders both doors', () => {
    expect(at('Continue with Google')).toBeGreaterThan(-1);
    expect(at('Send OTP'), 'mobile OTP was dropped, not demoted — Incident #10')
      .toBeGreaterThan(-1);
    expect(at('Mobile number')).toBeGreaterThan(-1);
  });

  it('puts Google ABOVE the mobile-number form, not below it', () => {
    // The whole change in one assertion. Before 29 Aug the OTP form came first
    // and Google sat under an "or" divider beneath it.
    expect(at('Continue with Google')).toBeLessThan(at('Mobile number'));
    expect(at('Continue with Google')).toBeLessThan(at('Send OTP'));
  });

  it('gives Google the filled CTA and OTP the outline one', () => {
    // Emphasis, not just order: two filled buttons would leave the student
    // with no recommendation at all, and an outlined Google under a filled
    // OTP would be the old hierarchy with the order changed.
    const googleBtn = html.slice(at('<button'), at('Continue with Google'));
    const googleTag = googleBtn.slice(googleBtn.lastIndexOf('<button'));
    expect(googleTag, 'the Google button is not the filled/primary CTA')
      .toMatch(/bg-stone-900/);

    const otpTag = html.slice(0, at('Send OTP')).lastIndexOf('<button');
    const otp = html.slice(otpTag, at('Send OTP'));
    expect(otp, 'the OTP button is still a filled CTA competing with Google')
      .not.toMatch(/bg-stone-900/);
    expect(otp, 'the OTP button lost its outline styling').toMatch(/border-stone-300/);
  });

  it('does not steal the screen with an autofocused keyboard', () => {
    // autoFocus on the name field pops the mobile keyboard on load and scrolls
    // the primary CTA out of view — which would undo the reorder on exactly
    // the devices that matter most.
    const nameField = html.slice(at('Your name'), at('Mobile number'));
    expect(nameField).not.toMatch(/autofocus/i);
  });

  it('keeps the password door reachable for returning students', () => {
    expect(at('Log in with password')).toBeGreaterThan(-1);
  });
});
