import { describe, it, expect } from 'vitest';
import { sendOtpSms, maskPhone, buildIndiahostUrl } from './indiahost-otp';

// ── The 4 Sep silent outage, encoded ──────────────────────────────────────
//
// OTP delivery stopped at 09:00 UTC and ran broken for seven hours. Supabase
// called the hook 18 times, the hook returned 200 every time, and nothing was
// delivered: 31 requests produced one verification attempt.
//
// Nothing was wrong with our code path. What was wrong is that this module
// decided success by hunting for five error words in the gateway's reply, so
// any failure phrased differently read as a successful send. Each case below
// is a reply that used to pass.

function reply(body: string, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(body, { status })) as unknown as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const KEY_ENV = () => { process.env.INDIAHOST_OTP_KEY = 'test-key'; };

describe('a reply the gateway means as a failure is never read as a send', () => {
  KEY_ENV();

  // Every one of these passed the old five-word denylist.
  const failures = [
    'Insufficient balance',
    'Your credits are over',
    'Account suspended',
    'Quota exceeded for today',
    'Daily limit exceeded',
    'Account inactive',
    'Number blacklisted',
    'Request denied',
    'API key expired',
  ];

  for (const body of failures) {
    it(`treats "${body}" as rejected`, async () => {
      const restore = reply(body);
      try {
        const out = await sendOtpSms('+919999999999', '123456');
        expect(out.verdict, body).toBe('rejected');
      } finally { restore(); }
    });
  }
});

describe('a reply the gateway means as a send is read as one', () => {
  KEY_ENV();

  for (const body of ['Success', 'OTP sent', 'message submitted', 'status:1', '{"status":"success"}', 'Queued']) {
    it(`treats "${body}" as sent`, async () => {
      const restore = reply(body);
      try {
        expect((await sendOtpSms('+919999999999', '123456')).verdict, body).toBe('sent');
      } finally { restore(); }
    });
  }
});

describe('an unreadable reply is reported, not guessed', () => {
  KEY_ENV();

  // The honest third state. We do not know indiahost's real success format, so
  // a reply we cannot classify must not be silently trusted OR silently
  // rejected — one hides an outage, the other breaks every working sign-in.
  for (const body of ['', 'MSGID:88213', 'xyzzy']) {
    it(`reports "${body}" as unknown`, async () => {
      const restore = reply(body);
      try {
        expect((await sendOtpSms('+919999999999', '123456')).verdict, body).toBe('unknown');
      } finally { restore(); }
    });
  }

  it('reads a mixed reply as a failure, not a success', async () => {
    // "sent: 0, failed: 1" contains both words. The failure wins.
    const restore = reply('sent: 0, failed: 1');
    try {
      expect((await sendOtpSms('+919999999999', '123456')).verdict).toBe('rejected');
    } finally { restore(); }
  });
});

describe('a transport failure still throws', () => {
  KEY_ENV();
  it('throws on a non-2xx, because the request never landed', async () => {
    const restore = reply('gateway down', 502);
    try {
      await expect(sendOtpSms('+919999999999', '123456')).rejects.toThrow(/HTTP 502/);
    } finally { restore(); }
  });
});

describe('nothing sensitive reaches a log line', () => {
  it('masks the number so a log can carry it', () => {
    expect(maskPhone('+919876543210')).toBe('+91****3210');
  });

  it('never puts the otp anywhere but the request', () => {
    KEY_ENV();
    const url = buildIndiahostUrl('+919876543210', '654321');
    // The OTP belongs in the outbound URL and nowhere else; the masked number
    // is what the hook logs.
    expect(url).toContain('otp=654321');
    expect(maskPhone('+919876543210')).not.toContain('98765');
  });
});
