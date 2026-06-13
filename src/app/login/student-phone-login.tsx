'use client';

import { useState } from 'react';
import { ArrowRight, Phone, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type Phase = 'phone' | 'otp';

export function StudentPhoneLogin() {
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.sent) {
        setPhase('otp');
        setMessage('Code sent. Check your SMS.');
      } else {
        setMessage(data.message ?? "Couldn't send the code. Try again.");
      }
    } catch {
      setMessage('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp }),
      });
      const data = await res.json();
      if (res.ok && data.dest) {
        window.location.href = data.dest;
        return;
      }
      setMessage(data.error ?? 'That code is incorrect or expired.');
    } catch {
      setMessage('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'otp') {
    return (
      <form onSubmit={verifyOtp} className="space-y-4">
        <p className="text-sm text-stone-600">
          Enter the 6-digit code sent to <span className="font-semibold text-stone-900">+91 {phone}</span>.
        </p>
        <div>
          <label className="block text-sm font-medium text-stone-800 mb-1.5">Verification code</label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              required
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm tracking-[0.4em] font-mono focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
            />
          </div>
        </div>

        {message && <p className="text-xs text-stone-600">{message}</p>}

        <button
          type="submit"
          disabled={loading || otp.length < 6}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Verifying…' : <>Verify &amp; sign in <ArrowRight className="w-4 h-4" /></>}
        </button>

        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={() => { setPhase('phone'); setOtp(''); setMessage(null); }} className="text-stone-500 hover:text-stone-700">
            ← Change number
          </button>
          <button type="button" onClick={() => requestOtp()} disabled={loading} className="font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestOtp} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-800 mb-1.5">Mobile number</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500 flex items-center gap-1">
            <Phone className="w-4 h-4 text-stone-400" /> +91
          </span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="98765 43210"
            required
            className="w-full pl-[4.75rem] pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
          />
        </div>
      </div>

      {message && <p className="text-xs text-stone-600">{message}</p>}

      <button
        type="submit"
        disabled={loading || phone.length < 10}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.98] disabled:opacity-50',
          'bg-stone-900 text-white hover:bg-stone-800'
        )}
      >
        {loading ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
      </button>

      <p className="text-[11px] text-stone-400 text-center">
        We&apos;ll text you a one-time code. No password needed.
      </p>
    </form>
  );
}
