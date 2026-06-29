'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { InstallAppButton } from '@/components/install-app-button';
import { OpenInBrowser } from '@/components/open-in-browser';

// Freemium self-signup. Two fields (Name + Phone), phone-OTP, no password,
// no allowlist. On success the visitor lands straight in the free app.
// Meta ad CTA points here (optionally after previewing the public /demo).
type Step = 'form' | 'otp';

export default function StartPage() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep only digits, cap at 10 (Indian mobile).
  function onPhoneChange(v: string) {
    setPhone(v.replace(/\D/g, '').slice(0, 10));
  }

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError('Please enter your name.'); return; }
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) { setError('Please enter a valid 10-digit mobile number.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.sent) {
        setStep('otp');
      } else {
        setError(data.message ?? "We couldn't send the OTP. Please try again.");
      }
    } catch {
      setError('Connection issue. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token: otp, name: name.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.dest) {
        window.location.href = data.dest;
      } else {
        setError(data.error ?? 'That code is incorrect or has expired.');
      }
    } catch {
      setError('Connection issue. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white flex flex-col items-center px-4 py-10">
      {/* Instagram/Facebook in-app browser can't install PWAs — prompt the user to
          open in real Safari/Chrome first. Renders only inside an in-app browser. */}
      <OpenInBrowser />
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo /></div>

        {step === 'form' ? (
          <form onSubmit={requestOtp} className="space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-xl font-bold text-stone-900">Start tracking your CAT prep — the app is completely free 🎯</h1>
              <p className="text-sm text-stone-600">An IIM senior comes later; first, try the app for yourself.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm focus:border-stone-900 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Mobile number</label>
                <div className="flex items-center rounded-xl border border-stone-300 focus-within:border-stone-900">
                  <span className="pl-4 pr-2 text-sm text-stone-500">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    placeholder="10-digit number"
                    className="w-full rounded-xl py-3 pr-4 text-sm focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-stone-400">Verify by OTP, takes 10 seconds.</p>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Get free access →'}
            </Button>
            <p className="text-center text-[11px] text-stone-400">
              We&apos;re not a coaching institute. Your data is used only for your prep.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-xl font-bold text-stone-900">Enter the code 📲</h1>
              <p className="text-sm text-stone-600">
                We&apos;ve sent a 6-digit code to +91 {phone} — enter it to head straight in.
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-center text-lg tracking-[0.4em] focus:border-stone-900 focus:outline-none"
              autoFocus
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Verifying…' : 'Continue →'}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('form'); setOtp(''); setError(null); }}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-700"
            >
              ← Change number
            </button>
          </form>
        )}

        {/* Prominent install push — below the signup form so lead capture stays primary. */}
        <div className="mt-6">
          <InstallAppButton variant="banner" />
        </div>
      </div>
    </div>
  );
}
